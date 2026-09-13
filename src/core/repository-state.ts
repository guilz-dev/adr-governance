import { existsSync } from 'node:fs'
import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'

import type { AdrConfig, ParsedAdr } from './types.js'
import { parseAdrFromPath } from './validation.js'

export const CONFIG_FILENAME = 'adr.config.json'
export const MANIFEST_PATH = '.adr-governance/manifest.json'
export const STATE_DIR = '.adr-governance/state'
export const LOCKS_DIR = '.adr-governance/state/locks'

export function findRepoRoot(startPath: string): string | null {
  let current = path.resolve(startPath)
  while (true) {
    const hasConfig = existsSync(path.join(current, CONFIG_FILENAME))
    const hasManifest = existsSync(path.join(current, MANIFEST_PATH))
    if (hasConfig && hasManifest) return current
    const parent = path.dirname(current)
    if (parent === current) return null
    current = parent
  }
}

export async function listAdrFiles(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return []
  const entries = await readdir(dir, { withFileTypes: true })
  return entries.filter((e) => e.isFile() && e.name.endsWith('.md') && e.name !== 'README.md').map((e) => e.name)
}

export async function loadAllAdrs(repoRoot: string, config: AdrConfig): Promise<ParsedAdr[]> {
  const adrs: ParsedAdr[] = []
  for (const rel of await listWorkingAdrPaths(repoRoot, config)) {
    const content = await readFile(path.join(repoRoot, rel), 'utf8')
    const parsed = parseAdrFromPath(rel, content, adrDirectoryKind(rel, config)!, config)
    if (parsed) adrs.push(parsed)
  }

  return adrs.sort((a, b) => a.number - b.number)
}

/** Longest directory wins when the proposed layout is nested inside accepted. */
export function adrDirectoryKind(relativePath: string, config: AdrConfig): 'accepted' | 'proposed' | null {
  const directories: Array<[string, 'accepted' | 'proposed']> = [[config.layout.acceptedDir, 'accepted']]
  if (config.layout.proposedDir !== config.layout.acceptedDir) {
    directories.push([config.layout.proposedDir, 'proposed'])
  }
  directories.sort((a, b) => b[0].length - a[0].length)
  return directories.find(([dir]) => relativePath.startsWith(`${dir.replace(/\/$/, '')}/`))?.[1] ?? null
}

export async function listWorkingAdrPaths(repoRoot: string, config: AdrConfig): Promise<string[]> {
  const paths = new Set<string>()
  async function visit(relativeDir: string): Promise<void> {
    const abs = path.join(repoRoot, relativeDir)
    if (!existsSync(abs)) return
    for (const entry of await readdir(abs, { withFileTypes: true })) {
      const rel = path.posix.join(relativeDir, entry.name)
      if (entry.isDirectory()) await visit(rel)
      else if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md') paths.add(rel)
    }
  }
  for (const dir of new Set([config.layout.acceptedDir, config.layout.proposedDir])) await visit(dir)
  return [...paths].sort((a, b) => Buffer.from(a).compare(Buffer.from(b)))
}

export async function readConfig(repoRoot: string): Promise<{ raw: string; path: string } | null> {
  const configPath = path.join(repoRoot, CONFIG_FILENAME)
  if (!existsSync(configPath)) return null
  const raw = await readFile(configPath, 'utf8')
  return { raw, path: configPath }
}

export function isPathInsideRepo(repoRoot: string, targetPath: string): boolean {
  const resolved = path.resolve(repoRoot, targetPath)
  const relative = path.relative(path.resolve(repoRoot), resolved)
  return !relative.startsWith('..') && !path.isAbsolute(relative)
}

export async function fileHashIfExists(filePath: string): Promise<string | null> {
  if (!existsSync(filePath)) return null
  const s = await stat(filePath)
  if (!s.isFile()) return null
  const { sha256 } = await import('./numbering.js')
  const content = await readFile(filePath, 'utf8')
  return sha256(content)
}
