import { createHash } from 'node:crypto'
import { lstat, readFile, readlink } from 'node:fs/promises'
import path from 'node:path'

import {
  listSnapshotChangedPaths,
  readBlobAtRef,
  readModeAtRef,
  resolveCommit,
  resolveMergeBase,
} from '../cli/git-diff.js'
import { sha256 } from './numbering.js'

export type SnapshotSide = {
  mode: '100644' | '100755' | '120000'
  contentHash: `sha256:${string}`
} | null

export type ChangeSetEntry = {
  path: string
  base: SnapshotSide
  current: SnapshotSide
}

export type BuiltChangeSet = {
  algorithm: 'git-change-set-v1'
  baseCommit: string
  comparisonBaseCommit: string
  digest: `sha256:${string}`
  entries: ChangeSetEntry[]
}

function sideParts(side: SnapshotSide): [string, string] {
  return side ? [side.mode, side.contentHash] : ['-', '-']
}

function hashContent(buffer: Buffer): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(buffer).digest('hex')}`
}

export function hashChangeSetEntries(entries: ChangeSetEntry[]): `sha256:${string}` {
  const seen = new Set<string>()
  const sorted = entries
    .map((entry) => ({
      ...entry,
      path: entry.path.replace(/\\/g, '/'),
    }))
    .sort((a, b) => Buffer.from(a.path).compare(Buffer.from(b.path)))

  const parts: string[] = []
  for (const entry of sorted) {
    if (!entry.path || entry.path.includes('\0') || seen.has(entry.path)) {
      throw new Error(`invalid change-set path: ${entry.path}`)
    }
    seen.add(entry.path)
    const [baseMode, baseHash] = sideParts(entry.base)
    const [currentMode, currentHash] = sideParts(entry.current)
    parts.push(
      `${entry.path}\0${baseMode}\0${baseHash}\0${currentMode}\0${currentHash}\0`,
    )
  }
  return `sha256:${sha256(parts.join(''))}`
}

async function readCurrentSide(
  repoRoot: string,
  relativePath: string,
): Promise<SnapshotSide> {
  const abs = path.join(repoRoot, relativePath)
  let info
  try {
    info = await lstat(abs)
  } catch {
    return null
  }

  if (info.isSymbolicLink()) {
    const target = await readlink(abs)
    return { mode: '120000', contentHash: hashContent(Buffer.from(target, 'utf8')) }
  }

  if (!info.isFile()) {
    return null
  }

  const mode = (info.mode & 0o111) !== 0 ? '100755' : '100644'
  const content = await readFile(abs)
  return { mode, contentHash: hashContent(content) }
}

async function readBaseSide(
  repoRoot: string,
  comparisonBase: string,
  relativePath: string,
): Promise<SnapshotSide> {
  const mode = await readModeAtRef(repoRoot, comparisonBase, relativePath)
  if (!mode) return null
  const blob = await readBlobAtRef(repoRoot, comparisonBase, relativePath)
  if (blob === null) return null
  return { mode, contentHash: hashContent(blob) }
}

export async function buildChangeSet(repoRoot: string, baseRef: string): Promise<BuiltChangeSet> {
  const baseCommit = await resolveCommit(repoRoot, baseRef)
  const comparisonBaseCommit = await resolveMergeBase(repoRoot, baseCommit, 'HEAD')
  const changedPaths = await listSnapshotChangedPaths(repoRoot, baseRef)

  const entries: ChangeSetEntry[] = []
  for (const relativePath of changedPaths) {
    const base = await readBaseSide(repoRoot, comparisonBaseCommit, relativePath)
    const current = await readCurrentSide(repoRoot, relativePath)
    if (base === null && current === null) continue
    entries.push({ path: relativePath.replace(/\\/g, '/'), base, current })
  }

  const digest = hashChangeSetEntries(entries)
  return {
    algorithm: 'git-change-set-v1',
    baseCommit,
    comparisonBaseCommit,
    digest,
    entries,
  }
}
