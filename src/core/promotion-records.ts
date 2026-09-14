import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { canPromoteToAccepted } from './lifecycle.js'
import { parseAdrFromPath } from './validation.js'
import type { Acceptance, AdrConfig, ParsedAdr } from './types.js'

// Portable lifecycle evidence, not authentication of the approving human.
export type PromotionRecord = {
  schemaVersion: 1
  adrId: string
  proposedPath: string
  proposedContent: string
  approval: Acceptance
}

export function promotionRecordPath(adrId: string): string {
  if (!/^ADR-\d{4,}$/.test(adrId)) throw new Error(`Invalid ADR id: ${adrId}`)
  return `.adr-governance/promotions/${adrId}.json`
}

export async function hasValidPromotionRecord(repoRoot: string, adr: ParsedAdr, config: AdrConfig): Promise<boolean> {
  try {
    const raw: unknown = JSON.parse(await readFile(path.join(repoRoot, promotionRecordPath(adr.id)), 'utf8'))
    if (!raw || typeof raw !== 'object') return false
    const record = raw as Partial<PromotionRecord>
    if (record.schemaVersion !== 1 || record.adrId !== adr.id || typeof record.proposedPath !== 'string' || typeof record.proposedContent !== 'string') return false
    if (record.approval !== 'human' && record.approval !== 'automatic') return false
    const expectedPath = path.posix.join(config.layout.proposedDir, path.posix.basename(adr.path.replace(/\\/g, '/')))
    if (record.proposedPath !== expectedPath) return false
    const proposed = parseAdrFromPath(record.proposedPath, record.proposedContent, 'proposed', config)
    if (!proposed || proposed.id !== adr.id || proposed.frontmatter.acceptance) return false
    // Git may normalize Markdown line endings without changing the decision.
    return proposed.body.replace(/\r\n/g, '\n') === adr.body.replace(/\r\n/g, '\n')
      && adr.frontmatter.acceptance === record.approval
      && canPromoteToAccepted(proposed, config.promotion.requireHumanAcceptance, record.approval).ok
  } catch {
    // Missing, malformed and stale records must never authorize a new accepted ADR.
    return false
  }
}
