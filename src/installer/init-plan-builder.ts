import { readFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

import type { AdrConfig, InitPlanOperation } from '../core/types.js'
import { hashFileAt } from './apply-plan.js'
import { ciWorkflowSuggestion } from '../analysis/init-hints.js'
import { buildHookMergePlanOperations } from './hook-merge.js'

const STATIC_TEMPLATES: Array<[string, string]> = [
  ['templates/docs/adr/README.md', 'docs/adr/README.md'],
  ['templates/cursor/rules/adr-governance.mdc', '.cursor/rules/adr-governance.mdc'],
  ['templates/cursor/hooks/adr-governance.mjs', '.cursor/hooks/adr-governance.mjs'],
  ['templates/claude/commands/adr.md', '.claude/commands/adr.md'],
  ['templates/claude/hooks/adr-governance.mjs', '.claude/hooks/adr-governance.mjs'],
  ['templates/codex/hooks/adr-governance.mjs', '.codex/hooks/adr-governance.mjs'],
  ['templates/gemini/hooks/adr-governance.mjs', '.gemini/hooks/adr-governance.mjs'],
  ['templates/adr-governance/gitignore', '.adr-governance/.gitignore'],
]

const BUNDLE_TARGETS = [
  ['dist/bundle/cli.mjs', '.adr-governance/bin/cli.mjs'],
  ['dist/bundle/hook.mjs', '.adr-governance/bin/hook.mjs'],
] as const

export function contextTemplate(language: 'ja' | 'en'): string {
  if (language === 'ja') {
    return `# ドメインコンテキスト

このリポジトリのドメイン用語と境界コンテキスト。

## 用語

<!-- ADR / CONTEXT ワークフローで確定した用語を追記 -->

`
  }
  return `# Domain Context

Domain terms and bounded-context language for this repository.

## Language

<!-- Add domain terms as decisions are recorded in the ADR/CONTEXT workflow -->

`
}

export function proposedAdrReadme(language: 'ja' | 'en'): string {
  if (language === 'ja') {
    return `# 提案中 ADR

検討中・却下の ADR は \`docs/adr/\` へ昇格するまでここに置きます。
`
  }
  return `# Proposed ADRs

Draft and rejected ADRs live here until promoted to \`docs/adr/\`.
`
}

async function planFileFromContent(
  repoRoot: string,
  relPath: string,
  content: string,
): Promise<InitPlanOperation> {
  const expected = await hashFileAt(repoRoot, relPath)
  if (expected === null) {
    return { kind: 'create', path: relPath, content }
  }
  return {
    kind: 'replace-generated',
    path: relPath,
    expectedCurrentHash: expected,
    content,
  }
}

async function walkFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(full)))
    } else if (entry.isFile()) {
      files.push(full)
    }
  }
  return files
}

async function collectDirOperations(
  packageRoot: string,
  repoRoot: string,
  srcRel: string,
  destRel: string,
): Promise<InitPlanOperation[]> {
  const srcAbs = path.join(packageRoot, srcRel)
  if (!existsSync(srcAbs)) return []

  const ops: InitPlanOperation[] = []
  for (const entryPath of await walkFiles(srcAbs)) {
    const relFromSrc = path.relative(srcAbs, entryPath)
    const destPath = path.join(destRel, relFromSrc)
    const content = await readFile(entryPath, 'utf8')
    ops.push(await planFileFromContent(repoRoot, destPath, content))
  }
  return ops
}

export async function buildInitPlanOperations(
  packageRoot: string,
  repoRoot: string,
  proposedConfig: AdrConfig,
  ciProvider: 'github-actions' | null,
): Promise<InitPlanOperation[]> {
  const operations: InitPlanOperation[] = []

  operations.push(
    await planFileFromContent(
      repoRoot,
      'adr.config.json',
      JSON.stringify(proposedConfig, null, 2) + '\n',
    ),
  )

  operations.push(...(await collectDirOperations(packageRoot, repoRoot, 'skill/managing-adrs', '.agents/skills/managing-adrs')))
  operations.push(...(await collectDirOperations(packageRoot, repoRoot, 'templates/schema', '.adr-governance/schema')))

  for (const [src, dest] of STATIC_TEMPLATES) {
    const srcPath = path.join(packageRoot, src)
    if (!existsSync(srcPath)) continue
    const content = await readFile(srcPath, 'utf8')
    operations.push(await planFileFromContent(repoRoot, dest, content))
  }

  for (const [src, dest] of BUNDLE_TARGETS) {
    const srcPath = path.join(packageRoot, src)
    if (!existsSync(srcPath)) continue
    const content = await readFile(srcPath, 'utf8')
    operations.push(await planFileFromContent(repoRoot, dest, content))
  }

  const { acceptedDir, proposedDir, contextFile, contextMapFile } = proposedConfig.layout

  if (!existsSync(path.join(repoRoot, contextFile))) {
    operations.push({
      kind: 'create',
      path: contextFile,
      content: contextTemplate(proposedConfig.documents.language),
    })
  }

  const proposedReadme = path.join(proposedDir, 'README.md')
  if (!existsSync(path.join(repoRoot, proposedReadme))) {
    operations.push({
      kind: 'create',
      path: proposedReadme,
      content: proposedAdrReadme(proposedConfig.documents.language),
    })
  }

  if (!existsSync(path.join(repoRoot, contextMapFile))) {
    operations.push({
      kind: 'create',
      path: contextMapFile,
      content: `# Context Map\n\n<!-- Link bounded contexts when the repo grows beyond a single CONTEXT.md -->\n`,
    })
  }

  if (ciProvider === 'github-actions') {
    const workflowPath = '.github/workflows/adr-governance.yml'
    if (!existsSync(path.join(repoRoot, workflowPath))) {
      operations.push({
        kind: 'create',
        path: workflowPath,
        content: ciWorkflowSuggestion(),
      })
    }
  }

  operations.push(...(await buildHookMergePlanOperations(repoRoot)))

  return operations
}
