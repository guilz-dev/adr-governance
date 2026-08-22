import { readFile, readdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

import type { InitPlan } from '../core/types.js'
import { defaultConfig } from '../core/config.js'
import { atomicWriteFile } from '../core/locks.js'
import { sha256 } from '../core/numbering.js'

export type Manifest = {
  version: string
  generatorVersion: string
  files: Record<string, string>
}

export const GENERATOR_VERSION = '0.1.0'

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
    '.cursor/rules/adr-governance.mdc',
    '.cursor/hooks/adr-governance.mjs',
    '.claude/commands/adr.md',
    '.claude/hooks/adr-governance.mjs',
    '.codex/hooks/adr-governance.mjs',
    '.gemini/hooks/adr-governance.mjs',
    'adr.config.json',
    'docs/adr/README.md',
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
  const configContent = JSON.stringify(plan.proposedConfig, null, 2) + '\n'
  await atomicWriteFile(path.join(repoRoot, 'adr.config.json'), configContent)

  const skillSrc = path.join(packageRoot, 'skill/managing-adrs')
  const skillDest = path.join(repoRoot, '.agents/skills/managing-adrs')
  await copyDir(skillSrc, skillDest)

  const cliBundle = path.join(packageRoot, 'dist/bundle/cli.mjs')
  const hookBundle = path.join(packageRoot, 'dist/bundle/hook.mjs')
  await mkdirSafe(path.join(repoRoot, '.adr-governance/bin'))
  await copyFile(cliBundle, path.join(repoRoot, '.adr-governance/bin/cli.mjs'))
  await copyFile(hookBundle, path.join(repoRoot, '.adr-governance/bin/hook.mjs'))

  const schemaSrc = path.join(packageRoot, 'templates/schema')
  await copyDir(schemaSrc, path.join(repoRoot, '.adr-governance/schema'))

  const templates: Array<[string, string]> = [
    ['templates/docs/adr/README.md', 'docs/adr/README.md'],
    ['templates/cursor/rules/adr-governance.mdc', '.cursor/rules/adr-governance.mdc'],
    ['templates/cursor/hooks/adr-governance.mjs', '.cursor/hooks/adr-governance.mjs'],
    ['templates/claude/commands/adr.md', '.claude/commands/adr.md'],
    ['templates/claude/hooks/adr-governance.mjs', '.claude/hooks/adr-governance.mjs'],
    ['templates/codex/hooks/adr-governance.mjs', '.codex/hooks/adr-governance.mjs'],
    ['templates/gemini/hooks/adr-governance.mjs', '.gemini/hooks/adr-governance.mjs'],
    ['templates/adr-governance/gitignore', '.adr-governance/.gitignore'],
  ]

  for (const [src, dest] of templates) {
    const srcPath = path.join(packageRoot, src)
    const destPath = path.join(repoRoot, dest)
    await copyFile(srcPath, destPath)
  }

  const manifest = await buildManifest(repoRoot, packageRoot)
  await atomicWriteFile(
    path.join(repoRoot, '.adr-governance/manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  )

  for (const op of plan.operations) {
    if (op.kind === 'create') {
      await atomicWriteFile(path.join(repoRoot, op.path), op.content)
    }
  }
}

async function copyDir(src: string, dest: string): Promise<void> {
  if (!existsSync(src)) return
  await mkdirSafe(dest)
  const entries = await readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    const s = path.join(src, entry.name)
    const d = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      await copyDir(s, d)
    } else {
      await copyFile(s, d)
    }
  }
}

async function copyFile(src: string, dest: string): Promise<void> {
  if (!existsSync(src)) return
  await mkdirSafe(path.dirname(dest))
  const content = await readFile(src, 'utf8')
  await atomicWriteFile(dest, content)
}

async function mkdirSafe(dir: string): Promise<void> {
  const { mkdir } = await import('node:fs/promises')
  await mkdir(dir, { recursive: true })
}

export function planRootHash(repoRoot: string): string {
  return createHash('sha256').update(repoRoot).digest('hex')
}
