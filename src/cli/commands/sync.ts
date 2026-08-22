import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

import { copySkillAndBundles } from '../../installer/generated-files.js'
import type { InitPlan } from '../../core/types.js'

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

  await copySkillAndBundles(options.packageRoot, options.repoRoot, options.plan)
}
