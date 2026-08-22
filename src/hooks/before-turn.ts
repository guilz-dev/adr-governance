import { mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

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

export const CURRENT_TURN_POINTER = '.adr-governance/state/current-turn.json'

export type BeforeTurnInput = {
  cwd: string
  prompt: string
  sessionId?: string
}

export type BeforeTurnResult = {
  ok: boolean
  warning?: string
  hookContext?: ReturnType<typeof buildHookContext>
  turnStatePath?: string
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
  const sessionId = input.sessionId ?? randomUUID()

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

  const pointerPath = path.join(repoRoot, CURRENT_TURN_POINTER)
  await mkdir(path.dirname(pointerPath), { recursive: true })
  await writeFile(
    pointerPath,
    JSON.stringify(
      {
        turnId,
        turnStatePath: path.relative(repoRoot, turnStatePath),
        risk,
        fullInstruction: hookContext.fullInstruction,
        updatedAt: turnState.createdAt,
      },
      null,
      2,
    ),
  )

  return { ok: true, hookContext, turnStatePath }
}

export async function loadCurrentTurnState(repoRoot: string): Promise<TurnState | null> {
  const pointerPath = path.join(repoRoot, CURRENT_TURN_POINTER)
  try {
    const pointer = JSON.parse(await readFile(pointerPath, 'utf8')) as {
      turnStatePath?: string
    }
    if (!pointer.turnStatePath) return null
    const statePath = path.join(repoRoot, pointer.turnStatePath)
    return JSON.parse(await readFile(statePath, 'utf8')) as TurnState
  } catch {
    return loadLatestTurnStateByMtime(repoRoot)
  }
}

async function loadLatestTurnStateByMtime(repoRoot: string): Promise<TurnState | null> {
  const stateDir = path.join(repoRoot, STATE_DIR, 'turns')
  try {
    const { readdir } = await import('node:fs/promises')
    const files = await readdir(stateDir)
    const jsonFiles = files.filter((f) => f.endsWith('.json'))
    let latest: { file: string; mtime: number } | null = null
    for (const file of jsonFiles) {
      const s = await stat(path.join(stateDir, file))
      if (!latest || s.mtimeMs > latest.mtime) {
        latest = { file, mtime: s.mtimeMs }
      }
    }
    if (!latest) return null
    return JSON.parse(await readFile(path.join(stateDir, latest.file), 'utf8')) as TurnState
  } catch {
    return null
  }
}

export async function loadLatestTurnState(repoRoot: string): Promise<TurnState | null> {
  return loadCurrentTurnState(repoRoot)
}
