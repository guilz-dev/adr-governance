import { access, mkdir, utimes, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { mkdtemp } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

import { defaultConfig } from '../../src/core/config.js'
import { pruneOldState } from '../../src/core/locks.js'

async function expectExists(filePath: string): Promise<void> {
  await expect(access(filePath)).resolves.toBeUndefined()
}

async function expectMissing(filePath: string): Promise<void> {
  await expect(access(filePath)).rejects.toMatchObject({ code: 'ENOENT' })
}

async function runBundledHook(repo: string, runtime: string, phase: string, payload: object) {
  const hook = path.resolve(import.meta.dirname, '../../dist/bundle/hook.mjs')
  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [hook, runtime, phase], {
      cwd: repo,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const stderr: Buffer[] = []
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`hook exited ${code}: ${Buffer.concat(stderr).toString('utf8')}`))
    })
    child.stdin.end(JSON.stringify(payload))
  })
}

describe('pruneOldState', () => {
  it('prunes stale state files inside active state directories', async () => {
    const repo = await mkdtemp(path.join(tmpdir(), 'adr-state-pruning-'))
    const stateDir = path.join(repo, '.adr-governance/state')
    const turnsDir = path.join(stateDir, 'turns')
    const pointersDir = path.join(stateDir, 'current-turn')
    const auditDir = path.join(stateDir, 'audit-chain')
    const locksDir = path.join(stateDir, 'locks')
    await Promise.all([
      mkdir(turnsDir, { recursive: true }),
      mkdir(pointersDir, { recursive: true }),
      mkdir(auditDir, { recursive: true }),
      mkdir(locksDir, { recursive: true }),
    ])

    const oldTurn = path.join(turnsDir, 'old.json')
    const freshTurn = path.join(turnsDir, 'fresh.json')
    const oldPointer = path.join(pointersDir, 'old.json')
    const oldAudit = path.join(auditDir, 'old.json')
    const oldLock = path.join(locksDir, 'keep.lock')
    await Promise.all([
      writeFile(oldTurn, '{}'),
      writeFile(freshTurn, '{}'),
      writeFile(oldPointer, '{}'),
      writeFile(oldAudit, '{}'),
      writeFile(oldLock, '{}'),
    ])

    const stale = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
    await Promise.all([
      utimes(oldTurn, stale, stale),
      utimes(oldPointer, stale, stale),
      utimes(oldAudit, stale, stale),
      utimes(oldLock, stale, stale),
    ])

    await pruneOldState(repo, 7)

    await Promise.all([
      expectMissing(oldTurn),
      expectMissing(oldPointer),
      expectMissing(oldAudit),
      expectExists(freshTurn),
      expectExists(oldLock),
    ])
  })

  it('prunes stale state through a non-Cursor before-turn hook', async () => {
    const repo = await mkdtemp(path.join(tmpdir(), 'adr-hook-state-pruning-'))
    const staleTurn = path.join(repo, '.adr-governance/state/turns/old.json')
    await mkdir(path.dirname(staleTurn), { recursive: true })
    await writeFile(path.join(repo, 'adr.config.json'), JSON.stringify(defaultConfig(), null, 2))
    await writeFile(path.join(repo, '.adr-governance/manifest.json'), '{}\n')
    await writeFile(staleTurn, '{}')

    const stale = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
    await utimes(staleTurn, stale, stale)

    await runBundledHook(repo, 'claude', 'before-turn', {
      session_id: 'claude-pruning-session',
      transcript_path: '/tmp/claude-pruning-session.jsonl',
      cwd: repo,
      hook_event_name: 'UserPromptSubmit',
      permission_mode: 'default',
      prompt: 'fix typo in comment',
    })

    await expectMissing(staleTurn)
  })
})
