import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { listChangedPaths, listSnapshotChangedPaths } from '../../src/cli/git-diff.js'
import { buildChangeSet } from '../../src/core/change-set.js'
import { gitCommit, initTestGitRepo } from '../helpers/git-test-repo.js'

const repos: string[] = []
afterEach(async () => {
  await Promise.all(repos.splice(0).map((repo) => rm(repo, { recursive: true, force: true })))
})

function git(repo: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: repo }).toString().trim()
}

async function setup(files: Record<string, string> = { 'src/my file.ts': 'original\n' }) {
  const repo = await mkdtemp(path.join(tmpdir(), 'adr-snapshot-regression-'))
  repos.push(repo)
  initTestGitRepo(repo)
  git(repo, 'config', 'core.filemode', 'true')
  git(repo, 'config', 'core.autocrlf', 'false')
  for (const [name, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(repo, name)), { recursive: true })
    await writeFile(path.join(repo, name), content)
  }
  git(repo, 'add', '.')
  gitCommit(repo, 'initial')
  return { repo, base: git(repo, 'rev-parse', 'HEAD') }
}

describe('canonical Git snapshots', () => {
  it.each(['staged', 'intent-to-add'] as const)('includes both sides of a %s rename with spaces', async (kind) => {
    const { repo, base } = await setup()
    if (kind === 'staged') git(repo, 'mv', 'src/my file.ts', 'src/renamed.ts')
    else {
      await rename(path.join(repo, 'src/my file.ts'), path.join(repo, 'src/renamed.ts'))
      git(repo, 'add', '-N', 'src/renamed.ts')
    }
    const result = await buildChangeSet(repo, base)
    expect(result.entries.map((entry) => entry.path)).toEqual(['src/my file.ts', 'src/renamed.ts'])
    expect(result.entries[0]?.current).toBeNull()
    expect(result.entries[1]?.base).toBeNull()
  })

  it('preserves Unicode, whitespace and rename source paths for classification', async () => {
    const { repo, base } = await setup({ 'src/日本語.ts': 'original\n' })
    git(repo, 'mv', 'src/日本語.ts', 'src/ next\tline\n.ts')
    gitCommit(repo, 'rename')
    const expected = ['src/ next\tline\n.ts', 'src/日本語.ts']
    expect(await listChangedPaths(repo, base)).toEqual(expected)
    expect(await listSnapshotChangedPaths(repo, base)).toEqual(expected)
  })

  it('has the same digest before and after a CRLF-normalized change is committed', async () => {
    const { repo, base } = await setup({ '.gitattributes': '*.txt text\n', 'file.txt': 'old\n' })
    await writeFile(path.join(repo, 'file.txt'), 'new\r\n')
    const before = await buildChangeSet(repo, base)
    expect(before.entries[0]?.current?.contentHash).toBe(`sha256:${createHash('sha256').update('new\n').digest('hex')}`)
    git(repo, 'add', 'file.txt')
    gitCommit(repo, 'change')
    await rm(path.join(repo, 'file.txt'))
    git(repo, '-c', 'core.autocrlf=false', '-c', 'core.eol=lf', 'checkout', '--', 'file.txt')
    expect(await readFile(path.join(repo, 'file.txt'), 'utf8')).toBe('new\n')
    expect((await buildChangeSet(repo, base)).digest).toBe(before.digest)
  })

  it('hashes clean-filter bytes without writing blobs into the repository', async () => {
    const { repo, base } = await setup({ '.gitattributes': '*.txt filter=canonical\n', 'file.txt': 'old\n' })
    git(repo, 'config', 'filter.canonical.clean', 'tr a-z A-Z')
    git(repo, 'config', 'filter.canonical.required', 'true')
    await writeFile(path.join(repo, 'file.txt'), 'new\n')
    const objectsBefore = git(repo, 'count-objects', '-v')
    const indexBefore = await readFile(path.join(repo, '.git/index'))
    const result = await buildChangeSet(repo, base)
    expect(result.entries[0]?.current?.contentHash).toBe(`sha256:${createHash('sha256').update('NEW\n').digest('hex')}`)
    expect(git(repo, 'count-objects', '-v')).toBe(objectsBefore)
    expect(await readFile(path.join(repo, '.git/index'))).toEqual(indexBefore)
  })

  it('hashes a current file larger than 10 MiB after a small base file grows', async () => {
    const { repo, base } = await setup({ 'large.bin': 'small base\n' })
    const content = Buffer.alloc(11 * 1024 * 1024, 0x61)
    await writeFile(path.join(repo, 'large.bin'), content)
    const result = await buildChangeSet(repo, base)
    expect(result.entries[0]?.base?.contentHash).toBe(`sha256:${createHash('sha256').update('small base\n').digest('hex')}`)
    expect(result.entries[0]?.current?.contentHash).toBe(`sha256:${createHash('sha256').update(content).digest('hex')}`)
  })

  it.each(['100644', '100755'] as const)('uses index mode %s when core.filemode is false', async (mode) => {
    const { repo, base } = await setup({ 'run.sh': 'old\n' })
    git(repo, 'config', 'core.filemode', 'false')
    if (mode === '100755') git(repo, 'update-index', '--chmod=+x', 'run.sh')
    await chmod(path.join(repo, 'run.sh'), mode === '100755' ? 0o644 : 0o755)
    await writeFile(path.join(repo, 'run.sh'), 'new\n')
    const result = await buildChangeSet(repo, base)
    expect(result.entries[0]?.current?.mode).toBe(mode)
  })

  it('preserves symlink mode for a checkout with core.symlinks disabled', async () => {
    const { repo, base } = await setup({ 'target.txt': 'target\n' })
    await symlink('target.txt', path.join(repo, 'link.txt'))
    git(repo, 'add', 'link.txt')
    gitCommit(repo, 'add link')
    const linked = await buildChangeSet(repo, base)
    git(repo, 'config', 'core.symlinks', 'false')
    await rm(path.join(repo, 'link.txt'))
    git(repo, 'checkout', '--', 'link.txt')
    expect((await buildChangeSet(repo, base)).digest).toBe(linked.digest)
  })

  it('uses only the owner executable bit like Git', async () => {
    const { repo, base } = await setup({ 'run.sh': 'old\n' })
    await chmod(path.join(repo, 'run.sh'), 0o654)
    await writeFile(path.join(repo, 'run.sh'), 'new\n')
    expect((await buildChangeSet(repo, base)).entries[0]?.current?.mode).toBe('100644')
  })
})
