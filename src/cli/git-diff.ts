import { execFile } from 'node:child_process'
import { lstat, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const STATE_PREFIX = '.adr-governance/state/'

async function git(repoRoot: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd: repoRoot,
    maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_LITERAL_PATHSPECS: '1' },
  })
  return stdout
}

function normalizeRepoPath(relativePath: string): string {
  return relativePath.split(path.sep).join('/')
}

function parseNullSeparatedPaths(output: string): string[] {
  if (!output) return []
  const parts = output.split('\0').filter((part) => part.length > 0)
  return parts.map(normalizeRepoPath)
}

async function isIgnored(repoRoot: string, relativePath: string): Promise<boolean> {
  try {
    await git(repoRoot, ['check-ignore', '-q', '--', relativePath])
    return true
  } catch {
    return false
  }
}

async function shouldIncludePath(repoRoot: string, relativePath: string): Promise<boolean> {
  const normalized = normalizeRepoPath(relativePath)
  if (!normalized || normalized.startsWith(STATE_PREFIX)) return false
  if (await isIgnored(repoRoot, normalized)) return false
  const abs = path.join(repoRoot, normalized)
  try {
    const info = await lstat(abs)
    if (info.isDirectory()) return false
  } catch {
    // Path may exist only in Git history.
  }
  return true
}

export async function resolveCommit(repoRoot: string, ref: string): Promise<string> {
  const output = (await git(repoRoot, ['rev-parse', ref])).trim()
  if (!/^[a-f0-9]{40}$/.test(output)) {
    throw new Error(`invalid commit ref: ${ref}`)
  }
  return output
}

export async function resolveMergeBase(
  repoRoot: string,
  left: string,
  right: string,
): Promise<string> {
  const leftCommit = await resolveCommit(repoRoot, left)
  const rightCommit = await resolveCommit(repoRoot, right)
  const output = (await git(repoRoot, ['merge-base', leftCommit, rightCommit])).trim()
  if (!/^[a-f0-9]{40}$/.test(output)) {
    throw new Error(`merge-base unavailable for ${left} and ${right}`)
  }
  return output
}

export async function listSnapshotChangedPaths(
  repoRoot: string,
  baseRef: string,
): Promise<string[]> {
  const baseCommit = await resolveCommit(repoRoot, baseRef)
  const paths = new Set<string>()

  const diff = await git(repoRoot, [
    'diff',
    '--no-renames',
    '--name-only',
    '-z',
    `${baseCommit}...HEAD`,
  ])
  for (const relativePath of parseNullSeparatedPaths(diff)) {
    if (await shouldIncludePath(repoRoot, relativePath)) paths.add(relativePath)
  }

  // Disable rename detection so each NUL record always contains one path,
  // including both sides of staged and intent-to-add renames.
  const status = await git(repoRoot, [
    'status', '--porcelain', '-z', '--no-renames', '--untracked-files=all',
  ])
  for (const entry of status.split('\0')) {
    if (entry.length < 4) continue
    const relativePath = entry.slice(3)
    if (await shouldIncludePath(repoRoot, relativePath)) paths.add(relativePath)
  }

  return [...paths].sort((a, b) => Buffer.from(a).compare(Buffer.from(b)))
}

export async function readBlobAtRef(
  repoRoot: string,
  ref: string,
  relativePath: string,
): Promise<Buffer | null> {
  const normalized = normalizeRepoPath(relativePath)
  try {
    const { stdout } = await execFileAsync('git', ['show', `${ref}:${normalized}`], {
      cwd: repoRoot,
      maxBuffer: 10 * 1024 * 1024,
      encoding: 'buffer',
    })
    return stdout as Buffer
  } catch {
    return null
  }
}

export async function readModeAtRef(
  repoRoot: string,
  ref: string,
  relativePath: string,
): Promise<'100644' | '100755' | '120000' | null> {
  const normalized = normalizeRepoPath(relativePath)
  try {
    const output = (
      await git(repoRoot, ['ls-tree', ref, '--', normalized])
    ).trim()
    if (!output) return null
    const mode = output.split(/\s+/)[0]
    if (mode === '100644' || mode === '100755' || mode === '120000') return mode
    return null
  } catch {
    return null
  }
}

export async function listChangedPaths(repoRoot: string, baseRef: string): Promise<string[]> {
  return listSnapshotChangedPaths(repoRoot, baseRef)
}

/** Read exactly the bytes Git would store, including clean filters and EOL conversion. */
export async function readCleanWorktreeBlob(repoRoot: string, relativePath: string): Promise<Buffer> {
  const objectDirectory = await mkdtemp(path.join(tmpdir(), 'adr-snapshot-objects-'))
  try {
    const sourceObjects = path.resolve(repoRoot, (await git(repoRoot, ['rev-parse', '--git-path', 'objects'])).trim())
    const env = {
      ...process.env,
      GIT_OPTIONAL_LOCKS: '0',
      GIT_OBJECT_DIRECTORY: objectDirectory,
      // Git accepts C-quoted paths; quoting also handles path-list separators.
      GIT_ALTERNATE_OBJECT_DIRECTORIES: JSON.stringify(sourceObjects),
    }
    const { stdout: oid } = await execFileAsync('git', [
      'hash-object', '-w', `--path=${relativePath}`, '--', path.join(repoRoot, relativePath),
    ], { cwd: repoRoot, env, maxBuffer: 10 * 1024 * 1024 })
    const { stdout } = await execFileAsync('git', ['cat-file', 'blob', oid.trim()], {
      // Match readFile's current-side behavior: buffer the complete file without
      // imposing a subprocess output limit on otherwise valid large changes.
      cwd: repoRoot, env, encoding: 'buffer', maxBuffer: Infinity,
    })
    return stdout
  } finally {
    await rm(objectDirectory, { recursive: true, force: true })
  }
}

export async function readIndexMode(
  repoRoot: string,
  relativePath: string,
): Promise<'100644' | '100755' | '120000' | null> {
  const output = await git(repoRoot, ['ls-files', '--stage', '-z', '--', relativePath])
  const entry = output.split('\0').find((line) => line.split('\t')[0]?.endsWith(' 0'))
  const mode = entry?.split(' ')[0]
  return mode === '100644' || mode === '100755' || mode === '120000' ? mode : null
}

export async function readGitBoolean(repoRoot: string, key: string, fallback: boolean): Promise<boolean> {
  try {
    return (await git(repoRoot, ['config', '--bool', '--get', key])).trim() === 'true'
  } catch (error) {
    if ((error as { code?: number }).code === 1) return fallback
    throw error
  }
}

export async function readFileAtRef(
  repoRoot: string,
  ref: string,
  relativePath: string,
): Promise<string | null> {
  const blob = await readBlobAtRef(repoRoot, ref, relativePath)
  if (blob === null) return null
  return blob.toString('utf8').replace(/\r\n/g, '\n')
}

export async function refExists(repoRoot: string, ref: string): Promise<boolean> {
  try {
    await git(repoRoot, ['rev-parse', '--verify', ref])
    return true
  } catch {
    return false
  }
}
