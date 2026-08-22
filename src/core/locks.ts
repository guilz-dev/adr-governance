import { mkdir, open, readFile, readdir, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

import { LOCKS_DIR } from '../core/repository-state.js'

const LOCK_STALE_MS = 10 * 60 * 1000

export type LockInfo = {
  pid: number
  startedAt: string
  command: string
}

export async function acquireLock(repoRoot: string, name: string, command: string): Promise<() => Promise<void>> {
  const lockDir = path.join(repoRoot, LOCKS_DIR)
  await mkdir(lockDir, { recursive: true })
  const lockPath = path.join(lockDir, `${name}.lock`)

  await cleanupStaleLocks(lockDir)

  try {
    const handle = await open(lockPath, 'wx')
    const info: LockInfo = {
      pid: process.pid,
      startedAt: new Date().toISOString(),
      command,
    }
    await handle.writeFile(JSON.stringify(info, null, 2))
    await handle.close()
  } catch {
    throw new Error(`Could not acquire lock: ${name}. Another command may be running.`)
  }

  return async () => {
    if (existsSync(lockPath)) {
      await unlink(lockPath)
    }
  }
}

async function cleanupStaleLocks(lockDir: string): Promise<void> {
  if (!existsSync(lockDir)) return
  const entries = await readdir(lockDir)
  const now = Date.now()

  for (const entry of entries) {
    const lockPath = path.join(lockDir, entry)
    try {
      const content = await readFile(lockPath, 'utf8')
      const info = JSON.parse(content) as LockInfo
      const age = now - new Date(info.startedAt).getTime()
      const stale = age > LOCK_STALE_MS
      let alive = false
      try {
        process.kill(info.pid, 0)
        alive = true
      } catch {
        alive = false
      }
      if (!alive && stale) {
        await unlink(lockPath)
      }
    } catch {
      await unlink(lockPath).catch(() => undefined)
    }
  }
}

export async function atomicWriteFile(targetPath: string, content: string): Promise<void> {
  const dir = path.dirname(targetPath)
  await mkdir(dir, { recursive: true })
  const tempPath = `${targetPath}.${process.pid}.tmp`
  await writeFile(tempPath, content, 'utf8')
  const { rename } = await import('node:fs/promises')
  await rename(tempPath, targetPath)
}

export async function pruneOldState(repoRoot: string, maxAgeDays = 7): Promise<void> {
  const stateDir = path.join(repoRoot, '.adr-governance/state')
  if (!existsSync(stateDir)) return
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000
  const entries = await readdir(stateDir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === 'locks') continue
    const full = path.join(stateDir, entry.name)
    const s = await stat(full)
    if (s.mtimeMs < cutoff) {
      await rm(full, { recursive: true, force: true })
    }
  }
}
