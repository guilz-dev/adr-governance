import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

import type { AdrConfig, FingerprintCollectionMode, RepositoryFingerprint } from './types.js'
import { isWatchPath } from './risk-signals.js'
import { sha256 } from './numbering.js'

const MAX_FINGERPRINT_FILES = 500
const MAX_FINGERPRINT_BYTES = 1024 * 1024

type UntrackedObservation = {
  hash: string
  mode: 'content' | 'metadata'
  reason?: 'untracked-count' | 'untracked-size'
}

type RepositoryStateObservation = {
  gitStatusHash: string
  repositoryStateHash: string
  collectionMode: FingerprintCollectionMode
  degradationReason?: 'untracked-count' | 'untracked-size' | 'git-unavailable'
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

async function metadataHashForPaths(
  repoRoot: string,
  paths: string[],
  reason: 'untracked-count' | 'untracked-size',
): Promise<UntrackedObservation> {
  const parts: string[] = []
  for (const rel of paths) {
    try {
      const info = await stat(path.join(repoRoot, rel))
      if (!info.isFile()) continue
      parts.push(`${rel.replace(/\\/g, '/')}\0${info.size}\0${Math.trunc(info.mtimeMs)}`)
    } catch {
      parts.push(`${rel.replace(/\\/g, '/')}\0-\0-`)
    }
  }
  return {
    hash: sha256(parts.join('\n')),
    mode: 'metadata',
    reason,
  }
}

async function hashUntrackedFiles(
  repoRoot: string,
  status: string,
): Promise<UntrackedObservation | null> {
  const paths = status
    .split('\0')
    .filter((entry) => entry.startsWith('?? '))
    .map((entry) => entry.slice(3))

  if (paths.length > MAX_FINGERPRINT_FILES) {
    return metadataHashForPaths(repoRoot, paths, 'untracked-count')
  }

  const hashes: string[] = []
  for (const rel of paths) {
    try {
      const file = path.join(repoRoot, rel)
      const info = await stat(file)
      if (!info.isFile()) continue
      if (info.size > MAX_FINGERPRINT_BYTES) {
        return metadataHashForPaths(repoRoot, paths, 'untracked-size')
      }
      const content = await readFile(file)
      hashes.push(`${rel}:${createHash('sha256').update(content).digest('hex')}`)
    } catch {
      return null
    }
  }

  return { hash: sha256(hashes.join('\n')), mode: 'content' }
}

async function observeRepositoryState(repoRoot: string): Promise<RepositoryStateObservation | null> {
  const [status, head, diff] = await Promise.all([
    runGit(repoRoot, ['status', '--porcelain=v1', '-z', '--untracked-files=all']),
    runGit(repoRoot, ['rev-parse', 'HEAD']),
    runGit(repoRoot, ['diff', '--no-ext-diff', '--binary', 'HEAD']),
  ])
  if (status === null || head === null || diff === null) return null

  const untracked = await hashUntrackedFiles(repoRoot, status)
  if (untracked === null) return null

  return {
    gitStatusHash: createHash('sha256').update(status).digest('hex'),
    repositoryStateHash: sha256(`${head}\n${diff}\n${untracked.hash}`),
    collectionMode: untracked.mode,
    degradationReason: untracked.reason,
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
  config?: AdrConfig,
): Promise<RepositoryFingerprint> {
  const watchPaths = trackedRelativePaths.filter((rel) => isWatchPath(rel, config))
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

  const collectionMode = observation?.collectionMode ?? 'unavailable'
  const degradationReason =
    observation === null ? 'git-unavailable' : observation.degradationReason

  return {
    paths: truncated ? watchPaths : selected,
    gitStatusHash,
    watchGitStatusHash,
    overflowWatchHash,
    contentHashes,
    repositoryStateHash: observation?.repositoryStateHash,
    collectionMode,
    degradationReason,
  }
}

export async function readGitStatusHash(repoRoot: string): Promise<string> {
  const status = await runGit(repoRoot, ['status', '--porcelain'])
  return status === null ? sha256('') : createHash('sha256').update(status).digest('hex')
}

export function degradationWarningMessage(
  reason: 'untracked-count' | 'untracked-size' | 'git-unavailable',
): string {
  const label = reason === 'git-unavailable' ? 'unavailable' : reason
  return `Repository change detection is using metadata fallback (${label}).\nThe CI decision gate remains authoritative.`
}
