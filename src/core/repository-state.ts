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
  const acceptedDir = path.join(repoRoot, config.layout.acceptedDir)
  const proposedDir = path.join(repoRoot, config.layout.proposedDir)

  for (const name of await listAdrFiles(acceptedDir)) {
    const rel = path.join(config.layout.acceptedDir, name)
    const content = await readFile(path.join(repoRoot, rel), 'utf8')
    const parsed = parseAdrFromPath(rel, content, 'accepted', config)
    if (parsed) adrs.push(parsed)
  }

  if (config.layout.mode === 'split' || config.layout.acceptedDir !== config.layout.proposedDir) {
    for (const name of await listAdrFiles(proposedDir)) {
      const rel = path.join(config.layout.proposedDir, name)
      const content = await readFile(path.join(repoRoot, rel), 'utf8')
      const parsed = parseAdrFromPath(rel, content, 'proposed', config)
      if (parsed) adrs.push(parsed)
    }
  }

  return adrs.sort((a, b) => a.number - b.number)
}

export async function readConfig(repoRoot: string): Promise<{ raw: string; path: string } | null> {
  const configPath = path.join(repoRoot, CONFIG_FILENAME)
  if (!existsSync(configPath)) return null
  const raw = await readFile(configPath, 'utf8')
  return { raw, path: configPath }
}

export function isPathInsideRepo(repoRoot: string, targetPath: string): boolean {
  const resolved = path.resolve(repoRoot, targetPath)
  const relative = path.relative(repoRoot, resolved)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

export async function fileHashIfExists(filePath: string): Promise<string | null> {
  if (!existsSync(filePath)) return null
  const s = await stat(filePath)
  if (!s.isFile()) return null
  const { sha256 } = await import('./numbering.js')
  const content = await readFile(filePath, 'utf8')
  return sha256(content)
}
