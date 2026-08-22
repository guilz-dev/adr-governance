import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

import { parseConfig } from '../core/config.js'
import { hashPrompt, assessPromptRisk, rankRelevantAdrs, buildFingerprint } from '../core/risk-signals.js'
import {
  findRepoRoot,
  loadAllAdrs,
  readConfig,
  STATE_DIR,
} from '../core/repository-state.js'
import { buildHookContext } from './common.js'
import type { TurnState } from '../core/types.js'
import { sha256 } from '../core/numbering.js'

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
    beforeFingerprint: buildFingerprint([], sha256(''), {}),
    relevantAdrPaths: relevant.map((a) => a.path),
    followUpCount: 0,
    receipt: null,
    createdAt: new Date().toISOString(),
  }

  const turnStatePath = path.join(stateDir, `${turnId}.json`)
  await writeFile(turnStatePath, JSON.stringify(turnState, null, 2))

  return { ok: true, hookContext, turnStatePath }
}

export async function loadLatestTurnState(repoRoot: string): Promise<TurnState | null> {
  const stateDir = path.join(repoRoot, STATE_DIR, 'turns')
  try {
    const { readdir } = await import('node:fs/promises')
    const files = await readdir(stateDir)
    const jsonFiles = files.filter((f) => f.endsWith('.json')).sort()
    const latest = jsonFiles.at(-1)
    if (!latest) return null
    const raw = await readFile(path.join(stateDir, latest), 'utf8')
    return JSON.parse(raw) as TurnState
  } catch {
    return null
  }
}
