import { copySkillAndBundles } from '../../installer/generated-files.js'
import type { InitPlan } from '../../core/types.js'

export async function runSync(options: {
  packageRoot: string
  repoRoot: string
  plan: InitPlan
}): Promise<void> {
  await copySkillAndBundles(options.packageRoot, options.repoRoot, options.plan)
}
