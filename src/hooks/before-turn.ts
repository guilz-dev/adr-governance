import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

import { resolveHookTurnKey } from './resolve-hook-session-id.js'

import { parseConfig } from '../core/config.js'
import { hashPrompt, assessPromptRisk, rankRelevantAdrs } from '../core/risk-signals.js'
import {
  findRepoRoot,
  loadAllAdrs,
  readConfig,
  STATE_DIR,
} from '../core/repository-state.js'
import { buildHookContext } from './common.js'
import type { TurnState } from '../core/types.js'
import { buildRepositoryFingerprint } from '../core/fingerprint.js'
import { gitLsFiles } from '../cli/git.js'
import { loadTurnStateForSession, writeTurnPointer } from './turn-pointer.js'

export type BeforeTurnInput = {
  cwd: string
  prompt: string
  sessionId?: string
  hookPayload?: Record<string, unknown>
}

export type BeforeTurnResult = {
  ok: boolean
  warning?: string
  hookContext?: ReturnType<typeof buildHookContext>
  turnStatePath?: string
  sessionId?: string
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

  const adrs = await loadAllAdrs(repoRoot, config)
  const { risk, signals } = assessPromptRisk(input.prompt, config)
  const relevant = rankRelevantAdrs(input.prompt, adrs)

  const hookContext = buildHookContext(
    config,
    risk,
    signals,
    relevant.map((a) => a.path),
  )

  const tracked = await gitLsFiles(repoRoot)
  const beforeFingerprint = await buildRepositoryFingerprint(repoRoot, tracked)

  const stateDir = path.join(repoRoot, STATE_DIR, 'turns')
  await mkdir(stateDir, { recursive: true })

  const turnId = randomUUID()
  const sessionId =
    input.sessionId?.trim() ||
    (input.hookPayload ? resolveHookTurnKey(input.hookPayload) : randomUUID())

  const turnState: TurnState = {
    schemaVersion: 1,
    sessionId,
    turnId,
    promptHash: hashPrompt(input.prompt),
    risk,
    signals,
    beforeFingerprint,
    relevantAdrPaths: relevant.map((a) => a.path),
    followUpCount: 0,
    receipt: null,
    createdAt: new Date().toISOString(),
  }

  const turnStatePath = path.join(stateDir, `${turnId}.json`)
  await writeFile(turnStatePath, JSON.stringify(turnState, null, 2))

  await writeTurnPointer(repoRoot, sessionId, {
    turnId,
    turnStatePath: path.relative(repoRoot, turnStatePath),
    risk,
    fullInstruction: hookContext.fullInstruction,
    updatedAt: turnState.createdAt,
  })

  return { ok: true, hookContext, turnStatePath, sessionId }
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
