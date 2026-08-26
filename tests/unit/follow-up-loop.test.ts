import { describe, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  resolveHookConversationKey,
  resolveHookConversationKeyOptional,
  pendingConversationScopeWarning,
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
  loadAuditChain,
  loadAuditChainForScope,
} from '../../src/hooks/audit-chain.js'
import {
  findLatestUnreceiptedTurnForConversation,
  loadTurnStateByTurnId,
  loadTurnStateForSession,
} from '../../src/hooks/turn-pointer.js'

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

  it('uses a hashed transcript path when runtime ids are missing', () => {
    expect(
      resolveHookConversationKeyOptional({ transcript_path: '/tmp/session.jsonl' }),
    ).toBe('transcript-29e67821bedc391a811d7fd8fcdf12be11edd17dc6c6340415bce3c46c72fd28')
  })

  it('warns only when the hook payload has no stable conversation scope', () => {
    expect(pendingConversationScopeWarning({ generation_id: 'gen-only' })).toContain(
      'repository-wide pending audit scope',
    )
    expect(pendingConversationScopeWarning({ session_id: 'session-1' })).toBeUndefined()
    expect(
      pendingConversationScopeWarning({ transcript_path: '/tmp/session.jsonl' }),
    ).toBeUndefined()
  })
})

describe('decideAfterTurn conversation follow-up limit', () => {
  const config = defaultConfig()

  it('silently closes likely-risk turns even when conversation chain has prior follow-ups', () => {
    const decision = decideAfterTurn(baseTurnState({ risk: 'likely' }), false, config, 1)
    expect(decision.allowFinish).toBe(true)
    expect(decision.followUpMessage).toBeUndefined()
    expect(decision.silentCloseReason).toBe('reversible')
  })

  it('silently closes likely-risk turns without follow-up', () => {
    const decision = decideAfterTurn(baseTurnState({ risk: 'likely' }), false, config, 0)
    expect(decision.allowFinish).toBe(true)
    expect(decision.silentCloseReason).toBe('reversible')
    expect(decision.followUpMessage).toBeUndefined()
  })

  it('silently closes possible-risk turns without follow-up', () => {
    const decision = decideAfterTurn(baseTurnState({ risk: 'possible' }), false, config, 0)
    expect(decision.allowFinish).toBe(true)
    expect(decision.silentCloseReason).toBe('reversible')
    expect(decision.followUpMessage).toBeUndefined()
  })

  it('silently closes none-risk turns without follow-up', () => {
    const decision = decideAfterTurn(baseTurnState({ risk: 'none' }), false, config, 0)
    expect(decision.allowFinish).toBe(true)
    expect(decision.silentCloseReason).toBe('implementation-detail')
    expect(decision.followUpMessage).toBeUndefined()
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

async function runBundledHook(
  repo: string,
  runtime: string,
  phase: string,
  payload: object,
): Promise<Record<string, unknown>> {
  const hook = path.resolve(import.meta.dirname, '../../dist/bundle/hook.mjs')
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [hook, runtime, phase], {
      cwd: repo,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`hook exited ${code}: ${Buffer.concat(stderr).toString('utf8')}`))
        return
      }

      resolve(JSON.parse(Buffer.concat(stdout).toString('utf8')) as Record<string, unknown>)
    })
    child.stdin.end(JSON.stringify(payload))
  })
}

describe('silent turn-close for low-risk turns', () => {
  it('records receipt without follow-up for possible-risk turns', async () => {
    const repo = await setupRepo('adr-silent-close-')
    const conversationId = 'conv-silent'
    const gen1 = 'gen-silent-1'

    await runBeforeTurn({
      cwd: repo,
      prompt: 'Update the authentication label to ライム',
      sessionId: gen1,
      conversationId,
    })

    const stateAfterBefore = await loadTurnStateForSession(repo, gen1)
    expect(stateAfterBefore?.risk).toBe('possible')

    const after = await runAfterTurn({ cwd: repo, sessionId: gen1, conversationId })
    expect(after.followUpMessage).toBeUndefined()
    expect(after.allowFinish).toBe(true)

    const stateAfter = await loadTurnStateForSession(repo, gen1)
    expect(stateAfter?.receipt?.outcome).toBe('no-change')
    expect(stateAfter?.receipt?.reason).toBe('reversible')
    expect(await loadAuditChain(repo, conversationId)).toBeNull()
  })

  it('records receipt without follow-up for likely-risk turns', async () => {
    const repo = await setupRepo('adr-silent-close-likely-')
    const conversationId = 'conv-likely-silent'
    const gen1 = 'gen-likely-silent-1'

    await runBeforeTurn({
      cwd: repo,
      prompt: 'We need a new database migration for auth architecture',
      sessionId: gen1,
      conversationId,
    })

    const stateAfterBefore = await loadTurnStateForSession(repo, gen1)
    expect(stateAfterBefore?.risk).toBe('likely')

    const after = await runAfterTurn({ cwd: repo, sessionId: gen1, conversationId })
    expect(after.followUpMessage).toBeUndefined()
    expect(after.allowFinish).toBe(true)

    const stateAfter = await loadTurnStateForSession(repo, gen1)
    expect(stateAfter?.receipt?.outcome).toBe('no-change')
    expect(stateAfter?.receipt?.reason).toBe('reversible')
    expect(await loadAuditChain(repo, conversationId)).toBeNull()
  })
})

describe('follow-up loop regression', () => {
  it('silently closes architecture turns scoped only by transcript_path', async () => {
    const repo = await setupRepo('adr-loop-transcript-only-')
    const hookPayload = {
      cwd: repo,
      transcript_path: '/tmp/session.jsonl',
      prompt: 'We need a new database migration for auth architecture',
    }

    await runBundledHook(repo, 'claude', 'before-turn', hookPayload)
    const after = await runBundledHook(repo, 'claude', 'after-turn', hookPayload)

    expect(after.decision).toBeUndefined()
    expect(after.reason).toBeUndefined()
  })

  it('propagates receipt to parent turn when audit follow-up closes', async () => {
    const repo = await setupRepo('adr-loop-parent-receipt-')
    const conversationId = 'conv-parent-receipt'
    const gen1 = 'gen-parent-1'
    const gen2 = 'gen-parent-2'

    await runBeforeTurn({
      cwd: repo,
      prompt: 'We need a new database migration for auth architecture',
      sessionId: gen1,
      conversationId,
    })

    const parentState = await loadTurnStateForSession(repo, gen1)
    expect(parentState?.turnId).toBeTruthy()

    await runBeforeTurn({
      cwd: repo,
      prompt: AUDIT_FOLLOWUP_MESSAGE,
      sessionId: gen2,
      conversationId,
    })

    const followUpState = await loadTurnStateForSession(repo, gen2)
    expect(followUpState?.isAuditFollowUp).toBe(true)

    const turnsDir = path.join(repo, '.adr-governance/state/turns')
    const auditChainDir = path.join(repo, '.adr-governance/state/audit-chain')
    await mkdir(auditChainDir, { recursive: true })
    await writeFile(
      path.join(turnsDir, `${followUpState!.turnId}.json`),
      JSON.stringify({ ...followUpState, followUpCount: 1 }, null, 2),
    )
    await writeFile(
      path.join(repo, '.adr-governance/state/audit-chain', `${conversationId}.json`),
      JSON.stringify(
        {
          schemaVersion: 1,
          conversationId,
          followUpCount: 1,
          updatedAt: new Date().toISOString(),
          lastTurnId: parentState!.turnId,
          pendingAudit: true,
        },
        null,
        2,
      ),
    )

    const afterGen2 = await runAfterTurn({
      cwd: repo,
      sessionId: gen2,
      conversationId,
    })
    expect(afterGen2.followUpMessage).toBeUndefined()
    expect(afterGen2.allowFinish).toBe(true)

    const closedParent = await loadTurnStateByTurnId(repo, parentState!.turnId)
    expect(closedParent?.receipt?.outcome).toBe('no-change')
    expect(closedParent?.receipt?.reason).toBe('reversible')
  })

  it('propagates receipt to parent turn for pending audit scope', async () => {
    const repo = await setupRepo('adr-loop-pending-parent-')
    const gen1 = 'gen-pending-parent-1'
    const gen2 = 'gen-pending-parent-2'

    await runBeforeTurn({
      cwd: repo,
      prompt: 'We need a new database migration for auth architecture',
      sessionId: gen1,
    })

    const parentState = await loadTurnStateForSession(repo, gen1)
    expect(parentState?.turnId).toBeTruthy()

    await runBeforeTurn({
      cwd: repo,
      prompt: AUDIT_FOLLOWUP_MESSAGE,
      sessionId: gen2,
    })

    const followUpState = await loadTurnStateForSession(repo, gen2)
    expect(followUpState?.isAuditFollowUp).toBe(true)

    const auditChainDir = path.join(repo, '.adr-governance/state/audit-chain')
    await mkdir(auditChainDir, { recursive: true })
    await writeFile(
      path.join(auditChainDir, '__pending__.json'),
      JSON.stringify(
        {
          schemaVersion: 1,
          conversationId: '__pending__',
          followUpCount: 1,
          updatedAt: new Date().toISOString(),
          lastTurnId: parentState!.turnId,
          pendingAudit: true,
        },
        null,
        2,
      ),
    )

    const afterGen2 = await runAfterTurn({ cwd: repo, sessionId: gen2 })
    expect(afterGen2.followUpMessage).toBeUndefined()

    const closedParent = await loadTurnStateByTurnId(repo, parentState!.turnId)
    expect(closedParent?.receipt?.outcome).toBe('no-change')
    expect(closedParent?.receipt?.reason).toBe('reversible')
  })
})

describe('turn-close conversation resolution', () => {
  it('does not match another conversation whose session id equals the requested conversation', async () => {
    const repo = await setupRepo('adr-turn-close-collision-')
    const turnsDir = path.join(repo, '.adr-governance/state/turns')
    await mkdir(turnsDir, { recursive: true })

    const legacyMatch = baseTurnState({
      turnId: 'legacy-match',
      sessionId: 'conv-target',
      createdAt: '2026-08-23T00:00:00.000Z',
    })
    const collidingNewState = baseTurnState({
      turnId: 'colliding-new-state',
      sessionId: 'conv-target',
      conversationId: 'conv-other',
      createdAt: '2026-08-23T01:00:00.000Z',
    })
    await writeFile(
      path.join(turnsDir, `${legacyMatch.turnId}.json`),
      JSON.stringify(legacyMatch, null, 2),
    )
    await writeFile(
      path.join(turnsDir, `${collidingNewState.turnId}.json`),
      JSON.stringify(collidingNewState, null, 2),
    )

    const resolved = await findLatestUnreceiptedTurnForConversation(repo, 'conv-target')
    expect(resolved?.turnId).toBe('legacy-match')
  })

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

    const parentState = await loadTurnStateForSession(repo, generationId)
    const auditChainDir = path.join(repo, '.adr-governance/state/audit-chain')
    await mkdir(auditChainDir, { recursive: true })
    await writeFile(
      path.join(repo, '.adr-governance/state/audit-chain', `${conversationId}.json`),
      JSON.stringify(
        {
          schemaVersion: 1,
          conversationId,
          followUpCount: 1,
          updatedAt: new Date().toISOString(),
          lastTurnId: parentState!.turnId,
          pendingAudit: true,
        },
        null,
        2,
      ),
    )
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
    expect(await loadAuditChain(repo, conversationId)).toBeNull()

    await runBeforeTurn({
      cwd: repo,
      prompt:
        'We need a new database migration for auth architecture with deployment infrastructure trade-offs',
      sessionId: gen2,
      conversationId,
    })

    const afterGen2 = await runAfterTurn({ cwd: repo, sessionId: gen2, conversationId })
    expect(afterGen2.followUpMessage).toBeUndefined()
    expect(await loadAuditChain(repo, conversationId)).toBeNull()
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
    expect(await loadAuditChainForScope(repo, undefined)).toBeNull()

    await runBeforeTurn({
      cwd: repo,
      prompt: 'Another architecture question about auth boundaries',
      sessionId: gen2,
    })

    expect(await loadAuditChainForScope(repo, undefined)).toBeNull()
  })
})
