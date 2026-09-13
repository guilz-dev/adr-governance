import { afterEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, open, readdir, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { defaultConfig } from '../../src/core/config.js'
import { acquireLock } from '../../src/core/locks.js'
import { runBeforeTurn } from '../../src/hooks/before-turn.js'
import { runAfterTurn } from '../../src/hooks/after-turn.js'
import { isAuditFollowUpPrompt } from '../../src/hooks/common.js'
import { loadTurnStateForSession } from '../../src/hooks/turn-pointer.js'
import { runTurnClose } from '../../src/cli/commands/turn-close.js'
import { initTestGitRepo, gitCommit } from '../helpers/git-test-repo.js'

const repos: string[] = []
afterEach(async () => { await Promise.all(repos.map(repo => rm(repo, { recursive: true, force: true }))); repos.length = 0 })
async function setupRepo(): Promise<string> {
  const repo = await mkdtemp(path.join(tmpdir(), 'adr-hook-reliability-'))
  repos.push(repo)
  initTestGitRepo(repo)
  await mkdir(path.join(repo, '.adr-governance'), { recursive: true })
  await writeFile(path.join(repo, '.adr-governance/manifest.json'), '{}\n')
  await writeFile(path.join(repo, 'adr.config.json'), JSON.stringify(defaultConfig()))
  await writeFile(path.join(repo, '.gitignore'), '.adr-governance/state/\n')
  await writeFile(path.join(repo, 'tracked.txt'), 'old\n')
  execFileSync('git', ['add', '.'], { cwd: repo })
  gitCommit(repo, 'initial')
  return repo
}

function instructionSession(instruction: string): string {
  const argument = instruction.match(/--session-id (.+)$/m)?.[1]
  expect(argument, 'receipt instructions must include the actual session ID').toBeDefined()
  return execFileSync('sh', ['-c', `printf '%s' ${argument}`], { encoding: 'utf8' })
}

describe('runtime receipt usability', () => {
  it('delivers a safely quoted receipt session in before and audit instructions', async () => {
    const repo = await setupRepo()
    const sessionId = `runtime's session $(printf injected)`
    const before = await runBeforeTurn({ cwd: repo, prompt: 'change architecture database', sessionId })
    expect(instructionSession(before.hookContext!.fullInstruction)).toBe(sessionId)
    await writeFile(path.join(repo, 'tracked.txt'), 'changed\n')
    const after = await runAfterTurn({ cwd: repo, sessionId })
    expect(after.allowFinish).toBe(false)
    expect(instructionSession(after.followUpMessage!)).toBe(sessionId)
    expect(isAuditFollowUpPrompt(after.followUpMessage!)).toBe(true)
    await runTurnClose({ repoRoot: repo, sessionId, outcome: 'no-change', reason: 'implementation-detail' })
    expect((await runAfterTurn({ cwd: repo, sessionId })).allowFinish).toBe(true)
  })

  it('includes the generated receipt session even for a low-risk prompt', async () => {
    const repo = await setupRepo()
    const before = await runBeforeTurn({ cwd: repo, prompt: 'hello' })
    expect(instructionSession(before.hookContext!.fullInstruction)).toBe(before.sessionId)
  })

  it('keeps explicit sessions isolated when their filenames would otherwise collide', async () => {
    const repo = await setupRepo()
    await runBeforeTurn({ cwd: repo, prompt: 'hello', sessionId: 'session/a', conversationId: 'conversation-a' })
    await runBeforeTurn({ cwd: repo, prompt: 'hello', sessionId: 'session?a', conversationId: 'conversation-b' })
    await runTurnClose({ repoRoot: repo, sessionId: 'session/a', outcome: 'no-change', reason: 'reversible' })
    expect((await loadTurnStateForSession(repo, 'session/a'))!.receipt?.reason).toBe('reversible')
    expect((await loadTurnStateForSession(repo, 'session?a'))!.receipt).toBeNull()
  })

  it('rejects an unspecified receipt rather than writing an orphan or attaching another session', async () => {
    const repo = await setupRepo()
    await runBeforeTurn({ cwd: repo, prompt: 'change architecture database', sessionId: 'session-a' })
    await expect(runTurnClose({ repoRoot: repo, outcome: 'no-change', reason: 'reversible' })).rejects.toThrow(/--session-id/)
    expect((await loadTurnStateForSession(repo, 'session-a'))!.receipt).toBeNull()
    expect((await readdir(path.join(repo, '.adr-governance/state/turns'))).some(p => p.startsWith('receipt-'))).toBe(false)
  })

  it('rejects an unknown explicit ID without attaching another session', async () => {
    const repo = await setupRepo()
    await runBeforeTurn({ cwd: repo, prompt: 'change architecture database', sessionId: 'session-a' })
    await expect(runTurnClose({ repoRoot: repo, sessionId: 'missing', outcome: 'docs-updated' })).rejects.toThrow(/session/i)
    expect((await loadTurnStateForSession(repo, 'session-a'))!.receipt).toBeNull()
  })
})

describe('repository observation', () => {
  it('requests an audit for a tracked diff larger than 1MB even when prompt risk is none', async () => {
    const repo = await setupRepo()
    const before = await runBeforeTurn({ cwd: repo, prompt: 'hello', sessionId: 'large' })
    expect(before.hookContext!.risk).toBe('none')
    await writeFile(path.join(repo, 'tracked.txt'), 'changed line\n'.repeat(100000))
    expect((await runAfterTurn({ cwd: repo, sessionId: 'large' })).allowFinish).toBe(false)
  })

  it('does not collect unused watched content hashes in hook state', async () => {
    const repo = await setupRepo()
    await mkdir(path.join(repo, 'src'))
    await writeFile(path.join(repo, 'src/schema.ts'), 'const value = 1\n')
    execFileSync('git', ['add', '.'], { cwd: repo })
    gitCommit(repo, 'watch file')
    await runBeforeTurn({ cwd: repo, prompt: 'hello', sessionId: 'watch' })
    const state = await loadTurnStateForSession(repo, 'watch')
    expect(state!.beforeFingerprint.contentHashes).toEqual({})
    expect(state!.beforeFingerprint.collectionMode).toBe('content')
  })
})

describe('lock ownership', () => {
  it('does not steal a newly created lock before its owner writes metadata', async () => {
    const repo = await setupRepo()
    const dir = path.join(repo, '.adr-governance/state/locks')
    await mkdir(dir, { recursive: true })
    const handle = await open(path.join(dir, 'active.lock'), 'wx')
    try {
      await expect(acquireLock(repo, 'active', 'competitor')).rejects.toThrow(/Could not acquire lock/)
    } finally { await handle.close() }
  })

  it('does not let a previous owner release a replacement lock', async () => {
    const repo = await setupRepo()
    const release = await acquireLock(repo, 'active', 'first')
    const lockPath = path.join(repo, '.adr-governance/state/locks/active.lock')
    await rm(lockPath, { recursive: true })
    const nextRelease = await acquireLock(repo, 'active', 'replacement')
    await release()
    await expect(acquireLock(repo, 'active', 'third')).rejects.toThrow(/Could not acquire lock/)
    await nextRelease()
  })

  it('reclaims an old abandoned incomplete lock', async () => {
    const repo = await setupRepo()
    const dir = path.join(repo, '.adr-governance/state/locks')
    await mkdir(dir, { recursive: true })
    const lockPath = path.join(dir, 'active.lock')
    await writeFile(lockPath, '')
    const old = new Date(Date.now() - 20 * 60 * 1000)
    await utimes(lockPath, old, old)
    const release = await acquireLock(repo, 'active', 'new owner')
    await release()
  })
})
