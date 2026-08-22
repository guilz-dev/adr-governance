import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import os from 'node:os'

import { defaultConfig, configForSingleDir, parseConfig } from '../../core/config.js'
import { buildEvidenceBundle, detectExistingLayout } from '../../analysis/repository-scan.js'
import {
  detectLegacyFrontmatter,
  detectDocumentLanguage,
  detectCiProvider,
} from '../../analysis/init-hints.js'
import type { InitPlan } from '../../core/types.js'
import { gitLsFiles, gitRevParse } from '../git.js'
import { sha256 } from '../../core/numbering.js'
import { validatePlanPaths } from '../../installer/apply-plan.js'
import { buildInitPlanOperations } from '../../installer/init-plan-builder.js'

export type InitScanResult = {
  planPath: string
  plan: InitPlan
  evidencePath: string
}

export async function runInitScan(
  repoRoot: string,
  outDir: string,
  packageRoot: string,
): Promise<InitScanResult> {
  const tracked = await gitLsFiles(repoRoot)
  const headSha = await gitRevParse(repoRoot, 'HEAD')
  const config = defaultConfig()
  const evidence = await buildEvidenceBundle(repoRoot, tracked, headSha, config.analysis.exclude)
  const layout = detectExistingLayout(repoRoot, tracked)

  let proposedConfig = defaultConfig()
  if (layout.detectedLayout === 'single' && layout.acceptedDirs[0]) {
    proposedConfig = configForSingleDir(layout.acceptedDirs[0])
  } else if (layout.detectedLayout === 'custom' && layout.acceptedDirs[0]) {
    proposedConfig = defaultConfig({
      layout: {
        mode: 'split',
        acceptedDir: layout.acceptedDirs[0] ?? 'docs/adr',
        proposedDir: layout.proposedDirs[0] ?? 'docs/proposed-adr',
        contextFile: 'CONTEXT.md',
        contextMapFile: 'CONTEXT-MAP.md',
      },
    })
  }

  proposedConfig.documents.language = await detectDocumentLanguage(repoRoot)
  proposedConfig.documents.legacyFrontmatter = await detectLegacyFrontmatter(repoRoot, {
    acceptedDir: proposedConfig.layout.acceptedDir,
    proposedDir: proposedConfig.layout.proposedDir,
  })

  const ciProvider = detectCiProvider(tracked)
  const operations = await buildInitPlanOperations(packageRoot, repoRoot, proposedConfig, ciProvider)

  await mkdir(outDir, { recursive: true })
  const evidencePath = path.join(outDir, 'evidence.json')
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2))

  const plan: InitPlan = {
    schemaVersion: 1,
    planId: randomUUID(),
    repositoryRootHash: sha256(repoRoot),
    sourceHeadSha: headSha,
    createdAt: new Date().toISOString(),
    detectedLayout: layout.detectedLayout,
    proposedConfig,
    operations,
    postApplySteps: ['write-manifest'],
    evidenceReferences: operations.map((op, index) => ({
      operationIndex: index,
      sourcePaths: [op.path],
      rationale: 'Planned init apply operation',
    })),
  }

  const planPath = path.join(outDir, 'init-plan.json')
  await writeFile(planPath, JSON.stringify(plan, null, 2))

  return { planPath, plan, evidencePath }
}

export async function loadInitPlan(planPath: string): Promise<InitPlan> {
  const raw = await readFile(planPath, 'utf8')
  const plan = JSON.parse(raw) as InitPlan
  return {
    ...plan,
    postApplySteps: plan.postApplySteps ?? ['write-manifest'],
  }
}

export function validateInitPlan(plan: InitPlan): string[] {
  const errors: string[] = []
  for (const op of plan.operations) {
    if (op.kind === 'create' && op.content.length === 0) {
      errors.push(`Empty content for create: ${op.path}`)
    }
  }
  return errors
}

export async function applyInitPlan(
  repoRoot: string,
  plan: InitPlan,
  applyGenerated: (repoRoot: string, plan: InitPlan) => Promise<void>,
): Promise<void> {
  const errors = [...validateInitPlan(plan), ...(await validatePlanPaths(repoRoot, plan))]
  if (errors.length > 0) {
    throw new Error(errors.join('\n'))
  }
  await applyGenerated(repoRoot, plan)
}

export { parseConfig }

export function defaultInitOutputDir(repoRoot: string): string {
  return path.join(
    os.tmpdir(),
    'adr-governance-init',
    sha256(repoRoot).slice(0, 16),
  )
}
