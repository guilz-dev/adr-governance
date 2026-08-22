import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { NO_ADR_REASONS } from '../../core/types.js'
import type { NoAdrReason, TurnReceipt } from '../../core/types.js'
import { STATE_DIR } from '../../core/repository-state.js'
import { loadCurrentTurnState } from '../../hooks/before-turn.js'

export async function runTurnClose(options: {
  repoRoot: string
  outcome: 'docs-updated' | 'no-change'
  reason?: string
  sessionId?: string
}): Promise<void> {
  if (options.outcome === 'no-change') {
    if (!options.reason) {
      throw new Error('--reason is required when outcome is no-change')
    }
    if (!NO_ADR_REASONS.includes(options.reason as NoAdrReason)) {
      throw new Error(`Invalid reason code: ${options.reason}`)
    }
  }

  const receipt: TurnReceipt = {
    outcome: options.outcome,
    reason: options.outcome === 'no-change' ? (options.reason as NoAdrReason) : undefined,
    timestamp: new Date().toISOString(),
  }

  const state = await loadCurrentTurnState(options.repoRoot, options.sessionId)
  if (state) {
    state.receipt = receipt
    const statePath = path.join(options.repoRoot, STATE_DIR, 'turns', `${state.turnId}.json`)
    await writeFile(statePath, JSON.stringify(state, null, 2))
    return
  }

  const stateDir = path.join(options.repoRoot, STATE_DIR, 'turns')
  await mkdir(stateDir, { recursive: true })
  await writeFile(
    path.join(stateDir, `receipt-${Date.now()}.json`),
    JSON.stringify({ receipt }, null, 2),
  )
}
