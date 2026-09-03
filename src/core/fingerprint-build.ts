import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

import type { RepositoryFingerprint } from './types.js'
import { isWatchPath } from './risk-signals.js'
import { sha256 } from './numbering.js'

const MAX_FINGERPRINT_FILES = 500
const MAX_FINGERPRINT_BYTES = 1024 * 1024

type RepositoryStateObservation = {
  gitStatusHash: string
  repositoryStateHash: string
}

async function runGit(repoRoot: string, args: string[]): Promise<string | null> {
  try {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const exec = promisify(execFile)
    const { stdout } = await exec('git', args, {
      cwd: repoRoot,
      maxBuffer: MAX_FINGERPRINT_BYTES,
    })
    return stdout
  } catch {
    return null
  }
}

async function hashUntrackedFiles(repoRoot: string, status: string): Promise<string | null> {
  const paths = status
    .split('\0')
    .filter((entry) => entry.startsWith('?? '))
    .map((entry) => entry.slice(3))

  if (paths.length > MAX_FINGERPRINT_FILES) return null

  const hashes: string[] = []
  for (const rel of paths) {
    try {
      const file = path.join(repoRoot, rel)
      const info = await stat(file)
      if (!info.isFile() || info.size > MAX_FINGERPRINT_BYTES) return null
      const content = await readFile(file)
      hashes.push(`${rel}:${createHash('sha256').update(content).digest('hex')}`)
    } catch {
      return null
    }
  }

  return sha256(hashes.join('\n'))
}

async function observeRepositoryState(repoRoot: string): Promise<RepositoryStateObservation | null> {
  const [status, head, diff] = await Promise.all([
    runGit(repoRoot, ['status', '--porcelain=v1', '-z', '--untracked-files=all']),
    runGit(repoRoot, ['rev-parse', 'HEAD']),
    runGit(repoRoot, ['diff', '--no-ext-diff', '--binary', 'HEAD']),
  ])
  if (status === null || head === null || diff === null) return null

  const untrackedHash = await hashUntrackedFiles(repoRoot, status)
  if (untrackedHash === null) return null

  return {
    gitStatusHash: createHash('sha256').update(status).digest('hex'),
    repositoryStateHash: sha256(`${head}\n${diff}\n${untrackedHash}`),
  }
}

async function hashWatchFile(repoRoot: string, rel: string): Promise<string | null> {
  const abs = path.join(repoRoot, rel)
  if (!existsSync(abs)) return null
  try {
    const s = await stat(abs)
    if (!s.isFile()) return null
    const content = await readFile(abs, 'utf8')
    return sha256(content)
  } catch {
    return null
  }
}

export async function readWatchPathsGitStatusHash(
  repoRoot: string,
  watchPaths: string[],
): Promise<string> {
  if (watchPaths.length === 0) return sha256('')
  try {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const exec = promisify(execFile)
    const { stdout } = await exec('git', ['status', '--porcelain'], { cwd: repoRoot })
    const matchingLines = stdout
      .split('\n')
      .filter((line) => line.length > 3)
      .filter((line) => {
        const file = (line.slice(3).trim().split(' -> ').pop() ?? '').trim()
        return watchPaths.some(
          (watchPath) =>
            file === watchPath ||
            file.startsWith(`${watchPath}/`) ||
            watchPath.startsWith(`${file}/`),
        )
      })
    return sha256(matchingLines.join('\n'))
  } catch {
    return sha256('')
  }
}

async function hashOverflowWatchPaths(
  repoRoot: string,
  overflowPaths: string[],
): Promise<string> {
  const parts: string[] = []
  for (const rel of overflowPaths) {
    const hash = await hashWatchFile(repoRoot, rel)
    if (hash) parts.push(`${rel}:${hash}`)
  }
  return sha256(parts.join('\n'))
}

export async function buildRepositoryFingerprint(
  repoRoot: string,
  trackedRelativePaths: string[],
): Promise<RepositoryFingerprint> {
  const watchPaths = trackedRelativePaths.filter(isWatchPath)
  const truncated = watchPaths.length > MAX_FINGERPRINT_FILES
  const selected = truncated ? watchPaths.slice(0, MAX_FINGERPRINT_FILES) : watchPaths
  const overflowPaths = truncated ? watchPaths.slice(MAX_FINGERPRINT_FILES) : []
  const contentHashes: Record<string, string> = {}

  for (const rel of selected) {
    const hash = await hashWatchFile(repoRoot, rel)
    if (hash) contentHashes[rel] = hash
  }

  const observation = await observeRepositoryState(repoRoot)
  const gitStatusHash = observation?.gitStatusHash ?? sha256('')
  const watchGitStatusHash = await readWatchPathsGitStatusHash(repoRoot, watchPaths)
  const overflowWatchHash = await hashOverflowWatchPaths(repoRoot, overflowPaths)

  return {
    paths: truncated ? watchPaths : selected,
    gitStatusHash,
    watchGitStatusHash,
    overflowWatchHash,
    contentHashes,
    repositoryStateHash: observation?.repositoryStateHash,
    collectionAvailable: observation !== null,
  }
}

export async function readGitStatusHash(repoRoot: string): Promise<string> {
  const status = await runGit(repoRoot, ['status', '--porcelain'])
  return status === null ? sha256('') : createHash('sha256').update(status).digest('hex')
}

export async function detectDocsPathsUpdated(
  repoRoot: string,
  paths: string[],
  sinceIso: string,
): Promise<boolean> {
  const since = new Date(sinceIso).getTime()

  for (const rel of paths) {
    const abs = path.join(repoRoot, rel)
    if (!existsSync(abs)) continue
    const updated = await pathTreeUpdatedSince(abs, since)
    if (updated) return true
  }
  return false
}

async function pathTreeUpdatedSince(absPath: string, since: number): Promise<boolean> {
  const { readdir, stat: statFile } = await import('node:fs/promises')
  let s
  try {
    s = await statFile(absPath)
  } catch {
    return false
  }

  if (s.isFile()) {
    return s.mtimeMs >= since
  }

  if (!s.isDirectory()) return false

  const entries = await readdir(absPath, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === 'README.md') continue
    const child = path.join(absPath, entry.name)
    if (await pathTreeUpdatedSince(child, since)) return true
  }
  return false
}
