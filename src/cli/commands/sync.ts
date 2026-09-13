import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

import { detectCiProvider } from '../../analysis/init-hints.js'
import { copySkillAndBundles, isUserManagedFile } from '../../installer/generated-files.js'
import { buildInitPlanOperations } from '../../installer/init-plan-builder.js'
import { parseConfig } from '../../core/config.js'
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
      if (isUserManagedFile(rel)) continue
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

  const configPath = path.join(options.repoRoot, 'adr.config.json')
  const hasCurrentConfig = existsSync(configPath)
  const config = hasCurrentConfig
    ? parseConfig(JSON.parse(await readFile(configPath, 'utf8'))).config
    : options.plan.proposedConfig

  const tracked = await gitLsFiles(options.repoRoot)
  const planBuild = await buildInitPlanOperations(
    options.packageRoot,
    options.repoRoot,
    config,
    detectCiProvider(tracked),
  )

  await copySkillAndBundles(options.packageRoot, options.repoRoot, {
    ...options.plan,
    proposedConfig: config,
    // Sync must not serialize user-owned configuration: that loses unknown settings
    // and can overwrite edits with a stale plan's proposed configuration.
    operations: planBuild.operations.filter(op => !hasCurrentConfig || op.path !== 'adr.config.json'),
    postApplySteps: options.plan.postApplySteps ?? ['write-manifest'],
  })
}
