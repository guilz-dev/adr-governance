import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  buildChangeSet,
  hashChangeSetEntries,
  type ChangeSetEntry,
} from '../../src/core/change-set.js'
import { gitCommit, initTestGitRepo } from '../helpers/git-test-repo.js'

const hashA = `sha256:${'a'.repeat(64)}` as `sha256:${string}`
const hashB = `sha256:${'b'.repeat(64)}` as `sha256:${string}`
const hashC = `sha256:${'c'.repeat(64)}` as `sha256:${string}`

const modified: ChangeSetEntry = {
  path: 'src/index.ts',
  base: { mode: '100644', contentHash: hashA },
  current: { mode: '100644', contentHash: hashB },
}

const added: ChangeSetEntry = {
  path: 'src/new.ts',
  base: null,
  current: { mode: '100644', contentHash: hashC },
}

async function setupRepo(): Promise<{ repo: string; baseSha: string }> {
  const repo = await mkdtemp(path.join(tmpdir(), 'adr-changeset-'))
  initTestGitRepo(repo)
  await mkdir(path.join(repo, 'src'), { recursive: true })
  await writeFile(path.join(repo, 'src/index.ts'), 'export const value = 1\n')
  await writeFile(path.join(repo, '.gitignore'), '.adr-governance/state/\n')
  execFileSync('git', ['add', '.'], { cwd: repo })
  gitCommit(repo, 'initial')
  const baseSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo }).toString().trim()
  return { repo, baseSha }
}

describe('hashChangeSetEntries', () => {
  it('is independent of entry enumeration order', () => {
    expect(hashChangeSetEntries([modified, added])).toBe(hashChangeSetEntries([added, modified]))
  })

  it('changes when the same path receives new content', () => {
    expect(hashChangeSetEntries([modified])).not.toBe(
      hashChangeSetEntries([
        {
          ...modified,
          current: { mode: '100644', contentHash: `sha256:${'c'.repeat(64)}` },
        },
      ]),
    )
  })

  it('normalizes Windows-style paths', () => {
    const windowsPath: ChangeSetEntry = {
      path: 'src\\index.ts',
      base: null,
      current: { mode: '100644', contentHash: hashA },
    }
    const posixPath: ChangeSetEntry = {
      path: 'src/index.ts',
      base: null,
      current: { mode: '100644', contentHash: hashA },
    }
    expect(hashChangeSetEntries([windowsPath])).toBe(hashChangeSetEntries([posixPath]))
  })

  it('rejects duplicate paths', () => {
    expect(() => hashChangeSetEntries([added, added])).toThrow(/invalid change-set path/)
  })

  it('rejects NUL in path', () => {
    expect(() =>
      hashChangeSetEntries([{ path: 'src\0bad.ts', base: null, current: added.current }]),
    ).toThrow(/invalid change-set path/)
  })

  it('represents delete as null current side', () => {
    const deleted: ChangeSetEntry = {
      path: 'src/removed.ts',
      base: { mode: '100644', contentHash: hashA },
      current: null,
    }
    expect(hashChangeSetEntries([deleted])).toMatch(/^sha256:[a-f0-9]{64}$/)
  })

  it('includes mode changes in digest', () => {
    const modeChange: ChangeSetEntry = {
      path: 'bin/run.sh',
      base: { mode: '100644', contentHash: hashA },
      current: { mode: '100755', contentHash: hashA },
    }
    expect(hashChangeSetEntries([modified])).not.toBe(hashChangeSetEntries([modeChange]))
  })
})

describe('buildChangeSet', () => {
  it('changes digest when working tree content changes', async () => {
    const { repo, baseSha } = await setupRepo()
    const before = await buildChangeSet(repo, baseSha)
    await writeFile(path.join(repo, 'src/index.ts'), 'export const value = 2\n')
    const after = await buildChangeSet(repo, baseSha)
    expect(after.digest).not.toBe(before.digest)
  })

  it('detects staged changes', async () => {
    const { repo, baseSha } = await setupRepo()
    await writeFile(path.join(repo, 'src/staged.ts'), 'export const staged = true\n')
    execFileSync('git', ['add', 'src/staged.ts'], { cwd: repo })
    const result = await buildChangeSet(repo, baseSha)
    expect(result.entries.some((entry) => entry.path === 'src/staged.ts')).toBe(true)
  })

  it('detects untracked files', async () => {
    const { repo, baseSha } = await setupRepo()
    await writeFile(path.join(repo, 'src/untracked.ts'), 'export const untracked = true\n')
    const result = await buildChangeSet(repo, baseSha)
    expect(result.entries.some((entry) => entry.path === 'src/untracked.ts')).toBe(true)
  })

  it('detects deletes', async () => {
    const { repo, baseSha } = await setupRepo()
    execFileSync('git', ['rm', 'src/index.ts'], { cwd: repo })
    const result = await buildChangeSet(repo, baseSha)
    const deleted = result.entries.find((entry) => entry.path === 'src/index.ts')
    expect(deleted?.current).toBeNull()
    expect(deleted?.base).not.toBeNull()
  })

  it('represents git mv as delete and add', async () => {
    const { repo, baseSha } = await setupRepo()
    execFileSync('git', ['mv', 'src/index.ts', 'src/renamed.ts'], { cwd: repo })
    const result = await buildChangeSet(repo, baseSha)
    expect(result.entries.some((entry) => entry.path === 'src/index.ts' && entry.current === null)).toBe(
      true,
    )
    expect(result.entries.some((entry) => entry.path === 'src/renamed.ts' && entry.base === null)).toBe(
      true,
    )
  })

  it('hashes executable bit changes', async () => {
    const { repo, baseSha } = await setupRepo()
    await writeFile(path.join(repo, 'run.sh'), '#!/bin/sh\necho hi\n')
    execFileSync('git', ['add', 'run.sh'], { cwd: repo })
    gitCommit(repo, 'add script')
    const scriptBase = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo }).toString().trim()
    execFileSync('git', ['update-index', '--chmod=+x', 'run.sh'], { cwd: repo })
    execFileSync('chmod', ['+x', path.join(repo, 'run.sh')], { cwd: repo })
    const result = await buildChangeSet(repo, scriptBase)
    const entry = result.entries.find((e) => e.path === 'run.sh')
    expect(entry?.base?.mode).toBe('100644')
    expect(entry?.current?.mode).toBe('100755')
  })

  it('hashes binary bytes', async () => {
    const { repo, baseSha } = await setupRepo()
    const binary = Buffer.from([0x00, 0x01, 0xff, 0xfe])
    await writeFile(path.join(repo, 'data.bin'), binary)
    const result = await buildChangeSet(repo, baseSha)
    const entry = result.entries.find((e) => e.path === 'data.bin')
    expect(entry?.current?.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/)
  })

  it('hashes symlink target text', async () => {
    const { repo, baseSha } = await setupRepo()
    await writeFile(path.join(repo, 'target.txt'), 'hello\n')
    await symlink('target.txt', path.join(repo, 'link.txt'))
    const result = await buildChangeSet(repo, baseSha)
    const entry = result.entries.find((e) => e.path === 'link.txt')
    expect(entry?.current?.mode).toBe('120000')
    expect(entry?.current?.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/)
  })

  it('excludes state directory paths', async () => {
    const { repo, baseSha } = await setupRepo()
    await mkdir(path.join(repo, '.adr-governance/state/turns'), { recursive: true })
    await writeFile(path.join(repo, '.adr-governance/state/turns/test.json'), '{"ok":true}\n')
    const result = await buildChangeSet(repo, baseSha)
    expect(result.entries.some((entry) => entry.path.startsWith('.adr-governance/state/'))).toBe(
      false,
    )
  })

  it('excludes gitignored files', async () => {
    const { repo, baseSha } = await setupRepo()
    await writeFile(path.join(repo, '.gitignore'), '.adr-governance/state/\nignored.log\n')
    await writeFile(path.join(repo, 'ignored.log'), 'secret\n')
    const result = await buildChangeSet(repo, baseSha)
    expect(result.entries.some((entry) => entry.path === 'ignored.log')).toBe(false)
  })
})
