import { describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  resolveHookConversationKey,
  resolveHookConversationKeyOptional,
} from '../../src/hooks/resolve-hook-session-id.js'
import {
  AUDIT_FOLLOWUP_MESSAGE,
  decideAfterTurn,
  isAuditFollowUpPrompt,
} from '../../src/hooks/common.js'
import { defaultConfig } from '../../src/core/config.js'
import type { TurnState } from '../../src/core/types.js'
import { runBeforeTurn } from '../../src/hooks/before-turn.js'
import { runAfterTurn } from '../../src/hooks/after-turn.js'
import { runTurnClose } from '../../src/cli/commands/turn-close.js'
import {
  PENDING_AUDIT_CONVERSATION_ID,
  loadAuditChain,
  loadAuditChainForScope,
} from '../../src/hooks/audit-chain.js'
import { loadTurnStateForSession } from '../../src/hooks/turn-pointer.js'

function baseTurnState(overrides: Partial<TurnState> = {}): TurnState {
  return {
    schemaVersion: 1,
    sessionId: 'gen-1',
    turnId: 'turn-1',
    promptHash: 'abc',
    risk: 'possible',
    signals: [],
    beforeFingerprint: {
      paths: [],
      gitStatusHash: '',
      watchGitStatusHash: '',
      overflowWatchHash: '',
      contentHashes: {},
    },
    relevantAdrPaths: [],
    followUpCount: 0,
    receipt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('resolveHookConversationKey', () => {
  it('prefers conversation_id over generation_id', () => {
    const key = resolveHookConversationKey({
      generation_id: 'gen-1',
      conversation_id: 'conv-1',
    })
    expect(key).toBe('conv-1')
  })

  it('does not fall back to generation_id when conversation_id is missing', () => {
    expect(resolveHookConversationKey({ generation_id: 'gen-1' })).toBeUndefined()
  })

  it('returns undefined optional when no stable conversation key exists', () => {
    expect(resolveHookConversationKeyOptional({})).toBeUndefined()
  })
})

describe('decideAfterTurn conversation follow-up limit', () => {
  const config = defaultConfig()

  it('blocks follow-up when conversation chain already reached maxFollowUps', () => {
    const decision = decideAfterTurn(baseTurnState(), false, false, config, 1)
    expect(decision.allowFinish).toBe(true)
    expect(decision.warning).toContain('follow-up limit')
    expect(decision.followUpMessage).toBeUndefined()
  })

  it('allows first follow-up when conversation chain is empty', () => {
    const decision = decideAfterTurn(baseTurnState(), false, false, config, 0)
    expect(decision.allowFinish).toBe(false)
    expect(decision.followUpMessage).toBe(AUDIT_FOLLOWUP_MESSAGE)
  })
})

describe('isAuditFollowUpPrompt', () => {
  it('detects the canonical audit follow-up message', () => {
    expect(isAuditFollowUpPrompt(AUDIT_FOLLOWUP_MESSAGE)).toBe(true)
  })

  it('ignores normal user prompts', () => {
    expect(isAuditFollowUpPrompt('We need a new database migration for auth architecture')).toBe(
      false,
    )
  })

  it('ignores partial user-pasted audit text', () => {
    expect(
      isAuditFollowUpPrompt(
        'ADR audit: this turn may have architectural impact. Read managing-adrs/SKILL.md',
      ),
    ).toBe(false)
  })
})

async function setupRepo(prefix: string): Promise<string> {
  const repo = await mkdtemp(path.join(tmpdir(), prefix))
  await writeFile(path.join(repo, 'adr.config.json'), JSON.stringify(defaultConfig(), null, 2))
  await mkdir(path.join(repo, '.adr-governance/state'), { recursive: true })
  await writeFile(path.join(repo, '.adr-governance/manifest.json'), '{}\n')
  return repo
}

describe('follow-up loop regression', () => {
  it('does not re-audit on generation-2 when conversation follow-up already fired', async () => {
    const repo = await setupRepo('adr-loop-regression-')
    const conversationId = 'conv-loop-test'
    const gen1 = 'gen-loop-1'
    const gen2 = 'gen-loop-2'

    await runBeforeTurn({
      cwd: repo,
      prompt: 'We need a new database migration for auth architecture',
      sessionId: gen1,
      conversationId,
    })

    const afterGen1 = await runAfterTurn({
      cwd: repo,
      sessionId: gen1,
      conversationId,
    })
    expect(afterGen1.followUpMessage).toContain('ADR audit')

    const chainAfterGen1 = await loadAuditChain(repo, conversationId)
    expect(chainAfterGen1?.followUpCount).toBe(1)

    await runBeforeTurn({
      cwd: repo,
      prompt: AUDIT_FOLLOWUP_MESSAGE,
      sessionId: gen2,
      conversationId,
    })

    const gen2State = await loadTurnStateForSession(repo, gen2)
    expect(gen2State?.isAuditFollowUp).toBe(true)
    expect(gen2State?.risk).toBe('none')

    const afterGen2 = await runAfterTurn({
      cwd: repo,
      sessionId: gen2,
      conversationId,
    })
    expect(afterGen2.followUpMessage).toBeUndefined()
    expect(afterGen2.allowFinish).toBe(true)
  })

  it('does not re-audit on generation-2 when only generation_id is available', async () => {
    const repo = await setupRepo('adr-loop-generation-only-')
    const gen1 = 'gen-only-1'
    const gen2 = 'gen-only-2'

    await runBeforeTurn({
      cwd: repo,
      prompt: 'We need a new database migration for auth architecture',
      sessionId: gen1,
    })

    const afterGen1 = await runAfterTurn({ cwd: repo, sessionId: gen1 })
    expect(afterGen1.followUpMessage).toContain('ADR audit')

    const pendingChain = await loadAuditChain(repo, PENDING_AUDIT_CONVERSATION_ID)
    expect(pendingChain?.followUpCount).toBe(1)

    await runBeforeTurn({
      cwd: repo,
      prompt: AUDIT_FOLLOWUP_MESSAGE,
      sessionId: gen2,
    })

    const gen2State = await loadTurnStateForSession(repo, gen2)
    expect(gen2State?.isAuditFollowUp).toBe(true)
    expect(gen2State?.conversationId).toBeUndefined()

    const afterGen2 = await runAfterTurn({ cwd: repo, sessionId: gen2 })
    expect(afterGen2.followUpMessage).toBeUndefined()
    expect(afterGen2.allowFinish).toBe(true)
  })
})

describe('turn-close conversation resolution', () => {
  it('records receipt via conversation_id when generation pointer differs', async () => {
    const repo = await setupRepo('adr-turn-close-conv-')

    const conversationId = 'conv-close-test'
    const generationId = 'gen-close-test'

    await runBeforeTurn({
      cwd: repo,
      prompt: 'We need a new database migration for auth architecture',
      sessionId: generationId,
      conversationId,
    })

    await runTurnClose({
      repoRoot: repo,
      outcome: 'no-change',
      reason: 'reversible',
      sessionId: conversationId,
    })

    const state = await loadTurnStateForSession(repo, generationId)
    expect(state?.receipt?.outcome).toBe('no-change')
    expect(state?.receipt?.reason).toBe('reversible')

    const chain = await loadAuditChain(repo, conversationId)
    expect(chain).toBeNull()
  })

  it('clears audit chain on docs-updated outcome', async () => {
    const repo = await setupRepo('adr-turn-close-docs-')
    const conversationId = 'conv-docs-close'
    const generationId = 'gen-docs-close'

    await runBeforeTurn({
      cwd: repo,
      prompt: 'We need a new database migration for auth architecture',
      sessionId: generationId,
      conversationId,
    })

    await runAfterTurn({
      cwd: repo,
      sessionId: generationId,
      conversationId,
    })
    expect(await loadAuditChain(repo, conversationId)).not.toBeNull()

    await runTurnClose({
      repoRoot: repo,
      outcome: 'docs-updated',
      sessionId: conversationId,
    })

    expect(await loadAuditChain(repo, conversationId)).toBeNull()
  })
})

describe('audit chain lifecycle', () => {
  it('clears chain when a new user turn starts in the same conversation', async () => {
    const repo = await setupRepo('adr-chain-new-turn-')
    const conversationId = 'conv-new-turn'
    const gen1 = 'gen-new-1'
    const gen2 = 'gen-new-2'

    await runBeforeTurn({
      cwd: repo,
      prompt: 'We need a new database migration for auth architecture',
      sessionId: gen1,
      conversationId,
    })
    await runAfterTurn({ cwd: repo, sessionId: gen1, conversationId })
    expect((await loadAuditChain(repo, conversationId))?.followUpCount).toBe(1)

    await runBeforeTurn({
      cwd: repo,
      prompt: 'Another architecture question about auth boundaries',
      sessionId: gen2,
      conversationId,
    })

    expect(await loadAuditChain(repo, conversationId)).toBeNull()

    const afterGen2 = await runAfterTurn({ cwd: repo, sessionId: gen2, conversationId })
    expect(afterGen2.followUpMessage).toContain('ADR audit')
    expect((await loadAuditChain(repo, conversationId))?.followUpCount).toBe(1)
  })

  it('clears pending chain when a new user turn starts without conversation_id', async () => {
    const repo = await setupRepo('adr-chain-pending-new-turn-')
    const gen1 = 'gen-pending-1'
    const gen2 = 'gen-pending-2'

    await runBeforeTurn({
      cwd: repo,
      prompt: 'We need a new database migration for auth architecture',
      sessionId: gen1,
    })
    await runAfterTurn({ cwd: repo, sessionId: gen1 })
    expect(
      (await loadAuditChainForScope(repo, undefined))?.conversationId,
    ).toBe(PENDING_AUDIT_CONVERSATION_ID)

    await runBeforeTurn({
      cwd: repo,
      prompt: 'Another architecture question about auth boundaries',
      sessionId: gen2,
    })

    expect(await loadAuditChainForScope(repo, undefined)).toBeNull()
  })
})
