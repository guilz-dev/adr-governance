import { readFile, readdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

import type { InitPlan } from '../core/types.js'
import { atomicWriteFile } from '../core/locks.js'
import { sha256 } from '../core/numbering.js'
import { applyPlanOperations } from './apply-plan.js'

export type Manifest = {
  version: string
  generatorVersion: string
  files: Record<string, string>
}

export const GENERATOR_VERSION = '0.1.9'

export async function hashFile(absPath: string): Promise<string> {
  const content = await readFile(absPath, 'utf8')
  return sha256(content)
}

export async function buildManifest(repoRoot: string, packageRoot: string): Promise<Manifest> {
  const files: Record<string, string> = {}
  const targets = [
    '.agents/skills/managing-adrs',
    '.adr-governance/bin',
    '.adr-governance/schema',
    '.adr-governance/.gitignore',
    '.cursor/rules/adr-governance.mdc',
    '.cursor/hooks/adr-governance.mjs',
    '.cursor/hooks.json',
    '.claude/commands/adr.md',
    '.claude/hooks/adr-governance.mjs',
    '.claude/settings.json',
    '.codex/hooks/adr-governance.mjs',
    '.codex/hooks.json',
    '.gemini/hooks/adr-governance.mjs',
    '.gemini/settings.json',
    'adr.config.json',
  ]

  for (const rel of targets) {
    const abs = path.join(repoRoot, rel)
    if (!existsSync(abs)) continue
    const s = await stat(abs)
    if (s.isDirectory()) {
      const entries = await readdir(abs, { recursive: true })
      for (const entry of entries) {
        const entryPath = path.join(abs, String(entry))
        const st = await stat(entryPath)
        if (st.isFile()) {
          const r = path.relative(repoRoot, entryPath)
          files[r] = await hashFile(entryPath)
        }
      }
    } else {
      files[rel] = await hashFile(abs)
    }
  }

  void packageRoot
  return {
    version: GENERATOR_VERSION,
    generatorVersion: GENERATOR_VERSION,
    files,
  }
}

export async function copySkillAndBundles(
  packageRoot: string,
  repoRoot: string,
  plan: InitPlan,
): Promise<void> {
  const filteredOperations = plan.operations.filter((op) => {
    if (op.kind !== 'create') return true
    return !existsSync(path.join(repoRoot, op.path))
  })

  await applyPlanOperations(repoRoot, filteredOperations)

  const postApplySteps = plan.postApplySteps ?? ['write-manifest']
  if (postApplySteps.includes('write-manifest')) {
    const manifest = await buildManifest(repoRoot, packageRoot)
    await atomicWriteFile(
      path.join(repoRoot, '.adr-governance/manifest.json'),
      JSON.stringify(manifest, null, 2) + '\n',
    )
  }
}

export function planRootHash(repoRoot: string): string {
  return createHash('sha256').update(repoRoot).digest('hex')
}
