import { existsSync } from 'node:fs'
import path from 'node:path'

export function resolvePackageRoot(defaultRoot: string, from?: string): string {
  const packageRoot = from ? path.resolve(from) : defaultRoot
  const skillSrc = path.join(packageRoot, 'skill/managing-adrs')
  const cliBundle = path.join(packageRoot, 'dist/bundle/cli.mjs')
  const hookBundle = path.join(packageRoot, 'dist/bundle/hook.mjs')

  if (!existsSync(skillSrc) || !existsSync(cliBundle) || !existsSync(hookBundle)) {
    throw new Error(
      'Requires the adr-governance package root (skill/ and dist/bundle/). Use --from /path/to/adr-governance',
    )
  }

  return packageRoot
}
