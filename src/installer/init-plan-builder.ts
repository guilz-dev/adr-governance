import { readFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

import type { AdrConfig, EvidenceBundle, InitPlanOperation } from '../core/types.js'
import { hashFileAt } from './apply-plan.js'
import { ciWorkflowSuggestion } from '../analysis/init-hints.js'
import { buildHookMergePlanOperations } from './hook-merge.js'
import { contextTemplate } from './context-template.js'
import {
  buildEvidenceInformedContext,
  buildProposedAdrCandidateOperations,
  buildReviewQuestions,
  shouldProposeContextMap,
  type OperationProvenance,
} from './init-evidence-plan.js'

const STATIC_TEMPLATES: Array<[string, string]> = [
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

export function proposedAdrReadme(language: 'ja' | 'en', acceptedDir: string): string {
  if (language === 'ja') {
    return `# 提案中 ADR

検討中・却下の ADR は \`${acceptedDir}/\` へ昇格するまでここに置きます。
`
  }
  return `# Proposed ADRs

Draft and rejected ADRs live here until promoted to \`${acceptedDir}/\`.
`
}

export function singleDirAdrReadme(language: 'ja' | 'en', dir: string): string {
  if (language === 'ja') {
    return `# ADR 運用ルール

\`${dir}/\` に accepted / proposed / rejected を置きます。

詳細は \`.agents/skills/managing-adrs/SKILL.md\` を参照。
`
  }
  return `# ADR workflow

Store accepted, proposed, and rejected ADRs under \`${dir}/\`.

See \`.agents/skills/managing-adrs/SKILL.md\` for details.
`
}

function adaptSplitReadme(content: string, acceptedDir: string, proposedDir: string): string {
  return content
    .replace(/docs\/adr/g, acceptedDir)
    .replace(/docs\/proposed-adr/g, proposedDir)
}

async function planLayoutReadmeOperations(
  packageRoot: string,
  repoRoot: string,
  config: AdrConfig,
): Promise<Array<{ operation: InitPlanOperation; provenance: OperationProvenance }>> {
  const { acceptedDir, proposedDir, mode } = config.layout
  const lang = config.documents.language
  const results: Array<{ operation: InitPlanOperation; provenance: OperationProvenance }> = []

  const acceptedReadme = path.join(acceptedDir, 'README.md')
  const proposedReadme = path.join(proposedDir, 'README.md')

  if (mode === 'single') {
    if (!existsSync(path.join(repoRoot, acceptedReadme))) {
      results.push({
        operation: {
          kind: 'create',
          path: acceptedReadme,
          content: singleDirAdrReadme(lang, acceptedDir),
        },
        provenance: {
          sourcePaths: ['templates/docs/adr/README.md'],
          rationale: 'Single-layout ADR directory readme',
        },
      })
    }
    return results
  }

  const templatePath = path.join(packageRoot, 'templates/docs/adr/README.md')
  if (existsSync(templatePath) && !existsSync(path.join(repoRoot, acceptedReadme))) {
    const raw = await readFile(templatePath, 'utf8')
    results.push({
      operation: {
        kind: 'create',
        path: acceptedReadme,
        content: adaptSplitReadme(raw, acceptedDir, proposedDir),
      },
      provenance: {
        sourcePaths: ['templates/docs/adr/README.md'],
        rationale: 'Split-layout accepted ADR readme',
      },
    })
  }

  if (
    proposedDir !== acceptedDir &&
    !existsSync(path.join(repoRoot, proposedReadme))
  ) {
    results.push({
      operation: {
        kind: 'create',
        path: proposedReadme,
        content: proposedAdrReadme(lang, acceptedDir),
      },
      provenance: {
        sourcePaths: [],
        rationale: 'Split-layout proposed ADR readme',
      },
    })
  }

  return results
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

export type InitPlanBuildResult = {
  operations: InitPlanOperation[]
  provenance: OperationProvenance[]
  reviewQuestions: string[]
}

export async function buildInitPlanOperations(
  packageRoot: string,
  repoRoot: string,
  proposedConfig: AdrConfig,
  ciProvider: 'github-actions' | null,
  evidence?: EvidenceBundle,
): Promise<InitPlanBuildResult> {
  const operations: InitPlanOperation[] = []
  const provenance: OperationProvenance[] = []

  const pushOp = (operation: InitPlanOperation, source: OperationProvenance) => {
    operations.push(operation)
    provenance.push(source)
  }

  pushOp(
    await planFileFromContent(
      repoRoot,
      'adr.config.json',
      JSON.stringify(proposedConfig, null, 2) + '\n',
    ),
    {
      sourcePaths: evidence?.existingLayout.agentConfigFiles ?? [],
      rationale: 'Detected repository layout and document language',
    },
  )

  for (const op of await collectDirOperations(
    packageRoot,
    repoRoot,
    'skill/managing-adrs',
    '.agents/skills/managing-adrs',
  )) {
    pushOp(op, {
      sourcePaths: ['skill/managing-adrs'],
      rationale: 'Package skill bundle',
    })
  }

  for (const op of await collectDirOperations(
    packageRoot,
    repoRoot,
    'templates/schema',
    '.adr-governance/schema',
  )) {
    pushOp(op, {
      sourcePaths: ['templates/schema'],
      rationale: 'Package JSON schema bundle',
    })
  }

  for (const [src, dest] of STATIC_TEMPLATES) {
    const srcPath = path.join(packageRoot, src)
    if (!existsSync(srcPath)) continue
    const content = await readFile(srcPath, 'utf8')
    pushOp(await planFileFromContent(repoRoot, dest, content), {
      sourcePaths: [src],
      rationale: 'Package template file',
    })
  }

  for (const [src, dest] of BUNDLE_TARGETS) {
    const srcPath = path.join(packageRoot, src)
    if (!existsSync(srcPath)) continue
    const content = await readFile(srcPath, 'utf8')
    pushOp(await planFileFromContent(repoRoot, dest, content), {
      sourcePaths: [src],
      rationale: 'Bundled CLI and hook entrypoints',
    })
  }

  const { contextFile, contextMapFile } = proposedConfig.layout

  if (!existsSync(path.join(repoRoot, contextFile))) {
    const contextContent = evidence
      ? buildEvidenceInformedContext(evidence, proposedConfig.documents.language)
      : contextTemplate(proposedConfig.documents.language)
    pushOp(
      {
        kind: 'create',
        path: contextFile,
        content: contextContent,
      },
      {
        sourcePaths: evidence
          ? [
              ...evidence.manifests.map((item) => item.path),
              ...evidence.candidateEvidence.map((item) => item.path),
            ]
          : [],
        rationale: evidence
          ? 'Observed repository structure for CONTEXT draft'
          : 'Default CONTEXT template',
      },
    )
  }

  for (const entry of await planLayoutReadmeOperations(packageRoot, repoRoot, proposedConfig)) {
    pushOp(entry.operation, entry.provenance)
  }

  if (evidence && shouldProposeContextMap(evidence) && !existsSync(path.join(repoRoot, contextMapFile))) {
    const mapEntries = evidence.existingLayout.contextFiles
      .filter((file) => file.endsWith('/CONTEXT.md') || file === 'CONTEXT.md')
      .map((file) => `- \`${file}\``)
      .join('\n')
    pushOp(
      {
        kind: 'create',
        path: contextMapFile,
        content: `# Context Map

Multiple bounded contexts were detected:

${mapEntries}

<!-- Link each context file and its responsibilities -->
`,
      },
      {
        sourcePaths: evidence.existingLayout.contextFiles,
        rationale: 'Multiple CONTEXT.md files detected',
      },
    )
  }

  if (evidence) {
    for (const entry of await buildProposedAdrCandidateOperations(repoRoot, evidence, proposedConfig)) {
      pushOp(entry.operation, entry.provenance)
    }
  }

  if (ciProvider === 'github-actions') {
    const workflowPath = '.github/workflows/adr-governance.yml'
    if (!existsSync(path.join(repoRoot, workflowPath))) {
      pushOp(
        {
          kind: 'create',
          path: workflowPath,
          content: ciWorkflowSuggestion(),
        },
        {
          sourcePaths: evidence?.manifests.filter((item) => item.path.includes('.github/workflows')).map((item) => item.path) ?? ['.github/workflows'],
          rationale: 'GitHub Actions CI provider detected',
        },
      )
    }
  }

  for (const op of await buildHookMergePlanOperations(repoRoot)) {
    pushOp(op, {
      sourcePaths: [
        '.cursor/hooks.json',
        '.claude/settings.json',
        '.codex/hooks.json',
        '.gemini/settings.json',
      ],
      rationale: 'Existing runtime hook configuration merge',
    })
  }

  const reviewQuestions = evidence
    ? buildReviewQuestions(evidence, proposedConfig.documents.language)
    : []

  return { operations, provenance, reviewQuestions }
}
