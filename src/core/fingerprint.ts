import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

import type { RepositoryFingerprint } from './types.js'
import { isWatchPath } from './risk-signals.js'
import { sha256 } from './numbering.js'

const MAX_FINGERPRINT_FILES = 500

export async function buildRepositoryFingerprint(
  repoRoot: string,
  trackedRelativePaths: string[],
): Promise<RepositoryFingerprint> {
  const watchPaths = trackedRelativePaths.filter(isWatchPath)
  const truncated = watchPaths.length > MAX_FINGERPRINT_FILES
  const selected = truncated ? watchPaths.slice(0, MAX_FINGERPRINT_FILES) : watchPaths
  const contentHashes: Record<string, string> = {}

  if (!truncated) {
    for (const rel of selected) {
      const abs = path.join(repoRoot, rel)
      if (!existsSync(abs)) continue
      try {
        const s = await stat(abs)
        if (!s.isFile()) continue
        const content = await readFile(abs, 'utf8')
        contentHashes[rel] = sha256(content)
      } catch {
        continue
      }
    }
  }

  const gitStatusHash = await readGitStatusHash(repoRoot)

  return {
    paths: truncated ? watchPaths : selected,
    gitStatusHash,
    contentHashes,
  }
}

async function readGitStatusHash(repoRoot: string): Promise<string> {
  try {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const exec = promisify(execFile)
    const { stdout } = await exec('git', ['status', '--porcelain'], { cwd: repoRoot })
    return createHash('sha256').update(stdout).digest('hex')
  } catch {
    return sha256('')
  }
}

export function fingerprintWatchPathsChanged(
  before: RepositoryFingerprint,
  after: RepositoryFingerprint,
): boolean {
  if (before.gitStatusHash !== after.gitStatusHash) return true

  const beforeHasHashes = Object.keys(before.contentHashes).length > 0
  const afterHasHashes = Object.keys(after.contentHashes).length > 0

  if (!beforeHasHashes || !afterHasHashes) {
    const allPaths = new Set([...before.paths, ...after.paths])
    return allPaths.size > 0 && before.paths.join('|') !== after.paths.join('|')
  }

  const allPaths = new Set([...before.paths, ...after.paths])
  for (const p of allPaths) {
    if (!isWatchPath(p)) continue
    if (before.contentHashes[p] !== after.contentHashes[p]) return true
  }
  return false
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
  const { readdir, stat } = await import('node:fs/promises')
  let s
  try {
    s = await stat(absPath)
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
