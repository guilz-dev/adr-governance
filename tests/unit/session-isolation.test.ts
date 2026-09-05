import { describe, expect, it } from 'vitest'

import { resolveHookTurnKey, resolveHookConversationKey } from '../../src/hooks/resolve-hook-session-id.js'
import { loadTurnStateForSession, writeTurnPointer } from '../../src/hooks/turn-pointer.js'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { TurnState } from '../../src/core/types.js'

describe('resolveHookTurnKey', () => {
  it('prefers generation_id over conversation_id', () => {
    const key = resolveHookTurnKey({
      generation_id: 'gen-1',
      conversation_id: 'conv-1',
    })
    expect(key).toBe('gen-1')
  })

  it('falls back to conversation_id when generation_id is missing', () => {
    const key = resolveHookTurnKey({
      conversation_id: 'conv-1',
    })
    expect(key).toBe('conv-1')
  })

  it('uses conversation_id for audit chain even when generation_id is present', () => {
    const key = resolveHookConversationKey({
      generation_id: 'gen-1',
      conversation_id: 'conv-1',
    })
    expect(key).toBe('conv-1')
  })
})

describe('loadTurnStateForSession isolation', () => {
  it('does not fall back to another session pointer when session id is explicit', async () => {
    const repo = await mkdtemp(path.join(tmpdir(), 'adr-session-isolation-'))
    const stateDir = path.join(repo, '.adr-governance/state/turns')
    await mkdir(stateDir, { recursive: true })

    const turnState: TurnState = {
      schemaVersion: 1,
      sessionId: 'session-a',
      turnId: 'turn-a',
      promptHash: 'abc',
      risk: 'none',
      signals: [],
      beforeFingerprint: {
        paths: [],
        gitStatusHash: '',
        watchGitStatusHash: '',
        overflowWatchHash: '',
        contentHashes: {},
        collectionMode: 'content',
      },
      relevantAdrPaths: [],
      followUpCount: 0,
      receipt: null,
      createdAt: new Date().toISOString(),
    }

    const turnRel = '.adr-governance/state/turns/turn-a.json'
    await writeFile(path.join(repo, turnRel), JSON.stringify(turnState, null, 2))

    await writeTurnPointer(repo, 'session-a', {
      turnId: 'turn-a',
      turnStatePath: turnRel,
      risk: 'none',
      updatedAt: turnState.createdAt,
    })

    const missing = await loadTurnStateForSession(repo, 'session-b')
    expect(missing).toBeNull()
  })
})
