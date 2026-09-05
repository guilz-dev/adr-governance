import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

import { resolveHookTurnKey, resolveHookConversationKeyOptional } from './resolve-hook-session-id.js'

import { parseConfig } from '../core/config.js'
import { hashPrompt, assessPromptRisk, rankRelevantAdrs } from '../core/risk-signals.js'
import {
  findRepoRoot,
  loadAllAdrs,
  readConfig,
  STATE_DIR,
} from '../core/repository-state.js'
import { buildHookContext, isAuditFollowUpPrompt } from './common.js'
import type { TurnState } from '../core/types.js'
import { buildRepositoryFingerprint, degradationWarningMessage } from '../core/fingerprint.js'
import { buildWorkingDecisionCorpus, snapshotDecisionCorpus } from '../core/decision-corpus.js'
import { pruneOldState } from '../core/locks.js'
import { gitLsFiles } from '../cli/git.js'
import {
  loadAuditChainForScope,
  markAuditChainResolvedForScope,
} from './audit-chain.js'
import { loadTurnStateForSession, writeTurnPointer } from './turn-pointer.js'

export type BeforeTurnInput = {
  cwd: string
  prompt: string
  sessionId?: string
  conversationId?: string
  hookPayload?: Record<string, unknown>
}

export type BeforeTurnResult = {
  ok: boolean
  warning?: string
  hookContext?: ReturnType<typeof buildHookContext>
  turnStatePath?: string
  sessionId?: string
  conversationId?: string
}

export async function runBeforeTurn(input: BeforeTurnInput): Promise<BeforeTurnResult> {
  const repoRoot = findRepoRoot(input.cwd)
  if (!repoRoot) return { ok: true }

  const configFile = await readConfig(repoRoot)
  if (!configFile) return { ok: true }

  let config
  try {
    config = parseConfig(JSON.parse(configFile.raw)).config
  } catch (e) {
    return { ok: true, warning: `Invalid adr.config.json: ${String(e)}` }
  }

  if (!config.hooks.enabled) return { ok: true }

  await pruneOldState(repoRoot).catch(() => undefined)

  const conversationId =
    input.conversationId?.trim() ||
    (input.hookPayload ? resolveHookConversationKeyOptional(input.hookPayload) : undefined)

  const isAuditFollowUp = isAuditFollowUpPrompt(input.prompt)

  if (!isAuditFollowUp) {
    await markAuditChainResolvedForScope(repoRoot, conversationId)
  }

  const auditChain = isAuditFollowUp
    ? await loadAuditChainForScope(repoRoot, conversationId)
    : null

  const adrs = await loadAllAdrs(repoRoot, config)
  const assessed = isAuditFollowUp
    ? { risk: 'none' as const, signals: ['audit-follow-up'] }
    : assessPromptRisk(input.prompt, config)
  const relevant = isAuditFollowUp ? [] : rankRelevantAdrs(input.prompt, adrs)

  const tracked = await gitLsFiles(repoRoot)
  const beforeFingerprint = await buildRepositoryFingerprint(repoRoot, tracked, config)
  const degradationReason = beforeFingerprint.degradationReason
  const shouldWarnDegradation = degradationReason !== undefined

  const hookContext = buildHookContext(
    config,
    assessed.risk,
    assessed.signals,
    relevant.map((a) => a.path),
    shouldWarnDegradation ? degradationReason : undefined,
  )

  const stateDir = path.join(repoRoot, STATE_DIR, 'turns')
  await mkdir(stateDir, { recursive: true })

  const turnId = randomUUID()
  const sessionId =
    input.sessionId?.trim() ||
    (input.hookPayload ? resolveHookTurnKey(input.hookPayload) : randomUUID())

  const beforeDecisionCorpus = snapshotDecisionCorpus(
    await buildWorkingDecisionCorpus(repoRoot, config),
  )

  const turnState: TurnState = {
    schemaVersion: 2,
    sessionId,
    turnId,
    conversationId,
    isAuditFollowUp: isAuditFollowUp || undefined,
    promptHash: hashPrompt(input.prompt),
    risk: assessed.risk,
    signals: assessed.signals,
    beforeFingerprint,
    beforeDecisionCorpus,
    degradationWarningShown: shouldWarnDegradation || undefined,
    relevantAdrPaths: relevant.map((a) => a.path),
    followUpCount: auditChain?.followUpCount ?? 0,
    receipt: null,
    createdAt: new Date().toISOString(),
  }

  const turnStatePath = path.join(stateDir, `${turnId}.json`)
  await writeFile(turnStatePath, JSON.stringify(turnState, null, 2))

  await writeTurnPointer(repoRoot, sessionId, {
    turnId,
    turnStatePath: path.relative(repoRoot, turnStatePath),
    risk: assessed.risk,
    fullInstruction: hookContext.fullInstruction,
    updatedAt: turnState.createdAt,
  })

  if (conversationId) {
    await writeTurnPointer(repoRoot, conversationId, {
      turnId,
      turnStatePath: path.relative(repoRoot, turnStatePath),
      risk: assessed.risk,
      fullInstruction: hookContext.fullInstruction,
      updatedAt: turnState.createdAt,
    })
  }

  return {
    ok: true,
    hookContext,
    turnStatePath,
    sessionId,
    conversationId,
    warning: shouldWarnDegradation ? degradationWarningMessage(degradationReason!) : undefined,
  }
}

export async function loadCurrentTurnState(
  repoRoot: string,
  sessionId?: string,
): Promise<TurnState | null> {
  return loadTurnStateForSession(repoRoot, sessionId)
}

export async function loadLatestTurnState(
  repoRoot: string,
  sessionId?: string,
): Promise<TurnState | null> {
  return loadTurnStateForSession(repoRoot, sessionId)
}
