import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const interception = vi.hoisted(() => ({ path: '', gates: [] as (() => Promise<void>)[] }))
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    unlink: async (target: string) => {
      if (target === interception.path) await interception.gates.shift()?.()
      return actual.unlink(target)
    },
  }
})
import { acquireLock } from '../../src/core/locks.js'

function signal() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}
let repo: string | undefined
afterEach(async () => { if (repo) await rm(repo, { recursive: true, force: true }) })

describe('concurrent stale lock cleanup', () => {
  it('does not unlink a new owner after another cleaner replaces the stale legacy lock', async () => {
    repo = await mkdtemp(path.join(tmpdir(), 'adr-lock-race-'))
    const dir = path.join(repo, '.adr-governance/state/locks')
    await mkdir(dir, { recursive: true })
    const lockPath = path.join(dir, 'active.lock')
    await writeFile(lockPath, '')
    const old = new Date(Date.now() - 20 * 60 * 1000)
    await utimes(lockPath, old, old)
    const firstReached = signal(), secondReached = signal()
    const allowFirst = signal(), allowSecond = signal()
    interception.path = lockPath
    interception.gates = [
      async () => { firstReached.resolve(); await allowFirst.promise },
      async () => { secondReached.resolve(); await allowSecond.promise },
    ]
    const first = acquireLock(repo, 'active', 'first')
    await firstReached.promise
    const second = acquireLock(repo, 'active', 'second')
    await secondReached.promise
    allowFirst.resolve()
    const releaseFirst = await first
    allowSecond.resolve()
    try {
      await expect(second).rejects.toThrow(/Could not acquire lock/)
    } finally { await releaseFirst() }
  })
})
