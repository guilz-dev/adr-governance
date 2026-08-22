import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

import { detectCiProvider } from '../../analysis/init-hints.js'
import { copySkillAndBundles } from '../../installer/generated-files.js'
import { buildInitPlanOperations } from '../../installer/init-plan-builder.js'
import type { InitPlan } from '../../core/types.js'
import { gitLsFiles } from '../git.js'

export async function runSync(options: {
  packageRoot: string
  repoRoot: string
  plan: InitPlan
}): Promise<void> {
  const manifestPath = path.join(options.repoRoot, '.adr-governance/manifest.json')
  if (existsSync(manifestPath)) {
    const existing = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      files?: Record<string, string>
    }
    for (const [rel, expectedHash] of Object.entries(existing.files ?? {})) {
      const abs = path.join(options.repoRoot, rel)
      if (!existsSync(abs)) continue
      const actual = await readFile(abs, 'utf8')
      const { sha256 } = await import('../../core/numbering.js')
      if (sha256(actual) !== expectedHash) {
        throw new Error(
          `Sync conflict: ${rel} was modified locally. Resolve manually and re-run sync.`,
        )
      }
    }
  }

  const tracked = await gitLsFiles(options.repoRoot)
  const operations = await buildInitPlanOperations(
    options.packageRoot,
    options.repoRoot,
    options.plan.proposedConfig,
    detectCiProvider(tracked),
  )

  await copySkillAndBundles(options.packageRoot, options.repoRoot, {
    ...options.plan,
    operations,
    postApplySteps: options.plan.postApplySteps ?? ['write-manifest'],
  })
}
