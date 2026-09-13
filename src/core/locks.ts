import { mkdir, readFile, readdir, rename, rm, rmdir, lstat, unlink, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

import { LOCKS_DIR } from '../core/repository-state.js'

const LOCK_STALE_MS = 10 * 60 * 1000

export type LockInfo = {
  pid: number
  startedAt: string
  command: string
  ownerId?: string
}

export async function acquireLock(repoRoot: string, name: string, command: string): Promise<() => Promise<void>> {
  const lockDir = path.join(repoRoot, LOCKS_DIR)
  await mkdir(lockDir, { recursive: true })
  const lockPath = path.join(lockDir, `${name}.lock`)

  await cleanupStaleLocks(lockDir)

  const ownerId = randomUUID()
  const ownerFile = `owner-${ownerId}.json`
  const pendingPath = path.join(lockDir, `${name}.${ownerId}.pending`)
  try {
    // Publish only a populated directory. rename cannot replace a populated lock,
    // and stale cleanup cannot rmdir a newly published owner's directory.
    await mkdir(pendingPath)
    const info: LockInfo = {
      pid: process.pid,
      startedAt: new Date().toISOString(),
      command,
      ownerId,
    }
    await writeFile(path.join(pendingPath, ownerFile), JSON.stringify(info, null, 2))
    await rename(pendingPath, lockPath)
  } catch {
    throw new Error(`Could not acquire lock: ${name}. Another command may be running.`)
  } finally {
    await rm(pendingPath, { recursive: true, force: true })
  }

  return async () => {
    await removeLockOwner(lockPath, ownerFile)
  }
}

async function removeLockOwner(lockPath: string, ownerFile: string): Promise<void> {
  try {
    await unlink(path.join(lockPath, ownerFile))
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return
    throw error
  }
  try {
    await rmdir(lockPath)
  } catch (error) {
    // A replacement lock always has its own distinct owner file and is not empty.
    if (!['ENOENT', 'ENOTEMPTY', 'EEXIST', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error
  }
}

async function isAbandonedLock(metadataPath: string, now: number): Promise<boolean> {
  const infoStat = await lstat(metadataPath)
  if (!infoStat.isFile() || now - infoStat.mtimeMs <= LOCK_STALE_MS) return false
  try {
    const info = JSON.parse(await readFile(metadataPath, 'utf8')) as LockInfo
    if (Number.isInteger(info.pid) && info.pid > 0) {
      try {
        process.kill(info.pid, 0)
        return false
      } catch (error) {
        // Permission denial (or any error other than a missing PID) is not proof of death.
        return (error as NodeJS.ErrnoException).code === 'ESRCH'
      }
    }
  } catch {
    // Incomplete legacy metadata is reclaimable only after the file itself ages out.
  }
  return true
}

async function cleanupStaleLocks(lockDir: string): Promise<void> {
  const entries = await readdir(lockDir)
  const now = Date.now()
  for (const entry of entries) {
    if (!entry.endsWith('.lock')) continue
    const lockPath = path.join(lockDir, entry)
    try {
      const observed = await lstat(lockPath)
      if (observed.isDirectory()) {
        const owners = await readdir(lockPath)
        if (owners.length !== 1 || !/^owner-[a-f0-9-]+\.json$/.test(owners[0]!)) continue
        const ownerFile = owners[0]!
        if (await isAbandonedLock(path.join(lockPath, ownerFile), now)) {
          await removeLockOwner(lockPath, ownerFile)
        }
      } else if (await isAbandonedLock(lockPath, now)) {
        // A new lock is a directory: even another cleaner that observed this old
        // legacy file cannot unlink a replacement after publication.
        await unlink(lockPath)
      }
    } catch {
      // A competing cleanup may already have removed the abandoned owner.
    }
  }
}

export async function atomicWriteFile(targetPath: string, content: string): Promise<void> {
  const dir = path.dirname(targetPath)
  await mkdir(dir, { recursive: true })
  const tempPath = `${targetPath}.${process.pid}.tmp`
  await writeFile(tempPath, content, 'utf8')
  await rename(tempPath, targetPath)
}

export async function pruneOldState(repoRoot: string, maxAgeDays = 7): Promise<void> {
  const stateDir = path.join(repoRoot, '.adr-governance/state')
  if (!existsSync(stateDir)) return
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000
  const entries = await readdir(stateDir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === 'locks') continue
    await pruneStateEntry(path.join(stateDir, entry.name), cutoff)
  }
}

async function pruneStateEntry(entryPath: string, cutoff: number): Promise<void> {
  const entryStat = await lstat(entryPath)
  if (entryStat.isDirectory()) {
    const children = await readdir(entryPath)
    for (const child of children) {
      await pruneStateEntry(path.join(entryPath, child), cutoff)
    }
    return
  }

  if (entryStat.mtimeMs < cutoff) {
    await rm(entryPath, { force: true })
  }
}
