import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
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

  return loadLatestTurnStateByMtime(repoRoot)
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

async function loadLatestTurnStateByMtime(repoRoot: string): Promise<TurnState | null> {
  const pointerDir = path.join(repoRoot, CURRENT_TURN_DIR)
  try {
    const pointerFiles = await readdir(pointerDir)
    let latestPointer: { rel: string; mtime: number } | null = null
    for (const file of pointerFiles.filter((f) => f.endsWith('.json'))) {
      const rel = path.join(CURRENT_TURN_DIR, file)
      const s = await stat(path.join(repoRoot, rel))
      if (!latestPointer || s.mtimeMs > latestPointer.mtime) {
        latestPointer = { rel, mtime: s.mtimeMs }
      }
    }
    if (latestPointer) {
      const state = await readPointerTurnState(repoRoot, latestPointer.rel)
      if (state) return state
    }
  } catch {
    /* fall through */
  }

  const stateDir = path.join(repoRoot, STATE_DIR, 'turns')
  try {
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
