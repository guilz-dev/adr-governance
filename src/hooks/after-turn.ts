import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { readdir } from 'node:fs/promises'

import { parseConfig } from '../core/config.js'
import { findRepoRoot, readConfig, STATE_DIR } from '../core/repository-state.js'
import { decideAfterTurn } from './common.js'
import type { TurnState } from '../core/types.js'

export type AfterTurnInput = {
  cwd: string
}

export type AfterTurnResult = {
  allowFinish: boolean
  followUpMessage?: string
  warning?: string
}

async function loadLatestTurn(repoRoot: string): Promise<TurnState | null> {
  const stateDir = path.join(repoRoot, STATE_DIR, 'turns')
  try {
    const files = await readdir(stateDir)
    const latest = files.filter((f) => f.endsWith('.json')).sort().at(-1)
    if (!latest) return null
    return JSON.parse(await readFile(path.join(stateDir, latest), 'utf8')) as TurnState
  } catch {
    return null
  }
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

  const state = await loadLatestTurn(repoRoot)
  if (!state) return { allowFinish: true }

  const docsUpdated = await detectDocsUpdated(repoRoot, config.layout.acceptedDir, config.layout.proposedDir, config.layout.contextFile, state.createdAt)

  const decision = decideAfterTurn(state, docsUpdated, false, config)

  if (!decision.allowFinish && decision.followUpMessage) {
    state.followUpCount += 1
    const stateDir = path.join(repoRoot, STATE_DIR, 'turns')
    const files = await readdir(stateDir)
    const latest = files.filter((f) => f.endsWith('.json')).sort().at(-1)
    if (latest) {
      await writeFile(path.join(stateDir, latest), JSON.stringify(state, null, 2))
    }
  }

  return decision
}

async function detectDocsUpdated(
  repoRoot: string,
  acceptedDir: string,
  proposedDir: string,
  contextFile: string,
  sinceIso: string,
): Promise<boolean> {
  const since = new Date(sinceIso).getTime()
  const paths = [acceptedDir, proposedDir, contextFile]
  const { stat } = await import('node:fs/promises')
  const { existsSync } = await import('node:fs')

  for (const p of paths) {
    const abs = path.join(repoRoot, p)
    if (!existsSync(abs)) continue
    try {
      const s = await stat(abs)
      if (s.mtimeMs >= since) return true
    } catch {
      continue
    }
  }
  return false
}
