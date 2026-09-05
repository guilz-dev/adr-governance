import { execFile } from 'node:child_process'
import { lstat } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const STATE_PREFIX = '.adr-governance/state/'

async function git(repoRoot: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd: repoRoot,
    maxBuffer: 10 * 1024 * 1024,
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

  const status = await git(repoRoot, ['status', '--porcelain', '-z', '--untracked-files=all'])
  const entries = status.split('\0').filter((entry) => entry.length > 0)
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!
    if (entry.length < 4) continue
    const code = entry.slice(0, 2)
    const raw = entry.slice(3)
    if (code.startsWith('R') && raw.includes(' -> ')) {
      const [from, to] = raw.split(' -> ')
      if (from && (await shouldIncludePath(repoRoot, from))) {
        paths.add(normalizeRepoPath(from))
      }
      if (to && (await shouldIncludePath(repoRoot, to))) {
        paths.add(normalizeRepoPath(to))
      }
      continue
    }
    if (code.startsWith('R') && !raw.includes(' -> ')) {
      if (raw && (await shouldIncludePath(repoRoot, raw))) {
        paths.add(normalizeRepoPath(raw))
      }
      const source = entries[i + 1]
      if (source && !source.includes(' ')) {
        if (await shouldIncludePath(repoRoot, source)) {
          paths.add(normalizeRepoPath(source))
        }
        i += 1
      }
      continue
    }
    if (raw && (await shouldIncludePath(repoRoot, raw))) {
      paths.add(normalizeRepoPath(raw))
    }
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

function parsePathList(output: string): string[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

export async function listChangedPaths(repoRoot: string, baseRef: string): Promise<string[]> {
  const paths = new Set<string>()

  const diff = await git(repoRoot, ['diff', '--name-only', `${baseRef}...HEAD`])
  for (const p of parsePathList(diff)) paths.add(p)

  const status = await git(repoRoot, ['status', '--porcelain', '-u', '--untracked-files=all'])
  for (const line of status.split('\n')) {
    if (!line.trim()) continue
    const raw = line.slice(3).trim()
    const filePath = raw.includes(' -> ') ? (raw.split(' -> ').pop() ?? raw) : raw
    if (filePath) paths.add(filePath)
  }

  return [...paths].sort()
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
