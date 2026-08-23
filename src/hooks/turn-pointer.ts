import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { STATE_DIR } from '../core/repository-state.js'
import type { TurnState } from '../core/types.js'

export const CURRENT_TURN_DIR = '.adr-governance/state/current-turn'
export const LEGACY_CURRENT_TURN_POINTER = '.adr-governance/state/current-turn.json'

export function sanitizeSessionId(sessionId: string): string {
  const trimmed = sessionId.trim()
  if (!trimmed) return 'default'
  return trimmed.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 128)
}

export function turnPointerRelPath(sessionId: string): string {
  return path.join(CURRENT_TURN_DIR, `${sanitizeSessionId(sessionId)}.json`)
}

export async function writeTurnPointer(
  repoRoot: string,
  sessionId: string,
  pointer: {
    turnId: string
    turnStatePath: string
    risk: string
    fullInstruction?: string
    updatedAt: string
  },
): Promise<void> {
  const pointerPath = path.join(repoRoot, turnPointerRelPath(sessionId))
  await mkdir(path.dirname(pointerPath), { recursive: true })
  await writeFile(pointerPath, JSON.stringify(pointer, null, 2))
}

export async function loadTurnStateForSession(
  repoRoot: string,
  sessionId?: string,
): Promise<TurnState | null> {
  const trimmed = sessionId?.trim()
  if (trimmed) {
    return readPointerTurnState(repoRoot, turnPointerRelPath(trimmed))
  }

  const fromLegacy = await readPointerTurnState(repoRoot, LEGACY_CURRENT_TURN_POINTER)
  if (fromLegacy) return fromLegacy

  return null
}

export async function resolveTurnStateForClose(
  repoRoot: string,
  sessionId?: string,
): Promise<TurnState | null> {
  const trimmed = sessionId?.trim()
  if (!trimmed) {
    return loadTurnStateForSession(repoRoot)
  }

  const direct = await loadTurnStateForSession(repoRoot, trimmed)
  if (direct) return direct

  const byConversation = await findLatestUnreceiptedTurnForConversation(repoRoot, trimmed)
  if (byConversation) return byConversation

  return null
}

export async function findLatestUnreceiptedTurnForConversation(
  repoRoot: string,
  conversationId: string,
): Promise<TurnState | null> {
  const turnsDir = path.join(repoRoot, STATE_DIR, 'turns')
  let entries: string[]
  try {
    entries = await readdir(turnsDir)
  } catch {
    return null
  }

  const candidates: TurnState[] = []
  for (const entry of entries) {
    if (!entry.endsWith('.json') || entry.startsWith('receipt-')) continue
    try {
      const state = JSON.parse(
        await readFile(path.join(turnsDir, entry), 'utf8'),
      ) as TurnState
      if (state.receipt !== null) continue
      if (state.conversationId === conversationId || state.sessionId === conversationId) {
        candidates.push(state)
      }
    } catch {
      continue
    }
  }

  if (candidates.length === 0) return null

  candidates.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  return candidates[0] ?? null
}

async function readPointerTurnState(repoRoot: string, relPointer: string): Promise<TurnState | null> {
  try {
    const pointer = JSON.parse(await readFile(path.join(repoRoot, relPointer), 'utf8')) as {
      turnStatePath?: string
    }
    if (!pointer.turnStatePath) return null
    const statePath = path.join(repoRoot, pointer.turnStatePath)
    return JSON.parse(await readFile(statePath, 'utf8')) as TurnState
  } catch {
    return null
  }
}
