import { readFileAtRef } from '../cli/git-diff.js'
import { parseConfig } from './config.js'
import type { AdrConfig } from './types.js'

/** Policy changes take effect only after they reach the explicitly selected base. */
export async function readBasePolicy(repoRoot: string, baseRef: string): Promise<AdrConfig> {
  const raw = await readFileAtRef(repoRoot, baseRef, 'adr.config.json')
  if (raw === null) throw new Error(`No readable adr.config.json at base ${baseRef}`)
  return parseConfig(JSON.parse(raw)).config
}
