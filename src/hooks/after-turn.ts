import { writeFile } from 'node:fs/promises'
import path from 'node:path'

import { recordTurnReceiptForState } from '../cli/commands/turn-close.js'
import { parseConfig } from '../core/config.js'
import { findRepoRoot, readConfig, STATE_DIR } from '../core/repository-state.js'
import { decideAfterTurn } from './common.js'
import { loadCurrentTurnState } from './before-turn.js'
import { detectDocsPathsUpdated } from '../core/fingerprint.js'
import {
  incrementAuditChainFollowUpForScope,
  loadAuditChainForScope,
  markAuditChainResolvedForScope,
} from './audit-chain.js'

export type AfterTurnInput = {
  cwd: string
  sessionId?: string
  conversationId?: string
}

export type AfterTurnResult = {
  allowFinish: boolean
  followUpMessage?: string
  warning?: string
}

export async function runAfterTurn(input: AfterTurnInput): Promise<AfterTurnResult> {
  const repoRoot = findRepoRoot(input.cwd)
  if (!repoRoot) return { allowFinish: true }

  const configFile = await readConfig(repoRoot)
  if (!configFile) return { allowFinish: true }

  let config
  try {
    config = parseConfig(JSON.parse(configFile.raw)).config
  } catch {
    return { allowFinish: true, warning: 'Invalid adr.config.json' }
  }

  if (!config.hooks.enabled || !config.hooks.afterTurnAudit) {
    return { allowFinish: true }
  }

  const state = await loadCurrentTurnState(repoRoot, input.sessionId)
  if (!state) return { allowFinish: true }

  const conversationId = input.conversationId ?? state.conversationId
  const auditChain = await loadAuditChainForScope(repoRoot, conversationId)
  const conversationFollowUpCount = auditChain?.followUpCount ?? 0

  const docPaths = [
    config.layout.acceptedDir,
    config.layout.proposedDir,
    config.layout.contextFile,
    config.layout.contextMapFile,
  ]

  const docsUpdated = await detectDocsPathsUpdated(repoRoot, docPaths, state.createdAt)

  const decision = decideAfterTurn(
    state,
    docsUpdated,
    config,
    conversationFollowUpCount,
  )

  if (docsUpdated || state.receipt !== null) {
    await markAuditChainResolvedForScope(repoRoot, conversationId)
  }

  if (decision.silentCloseReason && state.receipt === null) {
    await recordTurnReceiptForState(repoRoot, state, {
      outcome: 'no-change',
      reason: decision.silentCloseReason,
      timestamp: new Date().toISOString(),
    })
  }

  if (!decision.allowFinish && decision.followUpMessage) {
    state.followUpCount += 1
    const stateDir = path.join(repoRoot, STATE_DIR, 'turns')
    const statePath = path.join(stateDir, `${state.turnId}.json`)
    await writeFile(statePath, JSON.stringify(state, null, 2))
    await incrementAuditChainFollowUpForScope(repoRoot, conversationId, state.turnId)
  }

  return decision
}
