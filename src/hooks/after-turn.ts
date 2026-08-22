import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { parseConfig } from '../core/config.js'
import { findRepoRoot, readConfig, STATE_DIR } from '../core/repository-state.js'
import { decideAfterTurn } from './common.js'
import { loadCurrentTurnState } from './before-turn.js'
import {
  buildRepositoryFingerprint,
  detectDocsPathsUpdated,
  fingerprintWatchPathsChanged,
} from '../core/fingerprint.js'
import { gitLsFiles } from '../cli/git.js'

export type AfterTurnInput = {
  cwd: string
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

  const state = await loadCurrentTurnState(repoRoot)
  if (!state) return { allowFinish: true }

  const docPaths = [
    config.layout.acceptedDir,
    config.layout.proposedDir,
    config.layout.contextFile,
    config.layout.contextMapFile,
  ]

  const docsUpdated = await detectDocsPathsUpdated(repoRoot, docPaths, state.createdAt)

  const tracked = await gitLsFiles(repoRoot)
  const afterFingerprint = await buildRepositoryFingerprint(repoRoot, tracked)
  const watchChanged = fingerprintWatchPathsChanged(state.beforeFingerprint, afterFingerprint)

  const decision = decideAfterTurn(state, docsUpdated, watchChanged, config)

  if (!decision.allowFinish && decision.followUpMessage) {
    state.followUpCount += 1
    const stateDir = path.join(repoRoot, STATE_DIR, 'turns')
    const statePath = path.join(stateDir, `${state.turnId}.json`)
    await writeFile(statePath, JSON.stringify(state, null, 2))
  }

  return decision
}
