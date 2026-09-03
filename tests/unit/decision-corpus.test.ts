import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { describe, expect, it, vi } from 'vitest'

const gitReadFailure = vi.hoisted(() => ({ path: '' }))

vi.mock('../../src/cli/git-diff.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/cli/git-diff.js')>()
  return {
    ...actual,
    readFileAtRef: async (repoRoot: string, ref: string, relativePath: string) => {
      if (relativePath === gitReadFailure.path) return null
      return actual.readFileAtRef(repoRoot, ref, relativePath)
    },
  }
})

import { BaseRefUnavailableError, buildRefDecisionCorpus } from '../../src/core/decision-corpus.js'
import { runCheck } from '../../src/cli/commands/check.js'
import { defaultConfig } from '../../src/core/config.js'

const exec = promisify(execFile)

describe('base decision corpus', () => {
  it('fails closed when an enumerated base ADR cannot be read', async () => {
    const repo = await mkdtemp(path.join(tmpdir(), 'adr-base-corpus-'))
    const adrPath = 'docs/adr/0001-decision.md'
    await exec('git', ['init'], { cwd: repo })
    await exec('git', ['config', 'user.email', 'test@example.com'], { cwd: repo })
    await exec('git', ['config', 'user.name', 'Test'], { cwd: repo })
    await mkdir(path.join(repo, 'docs/adr'), { recursive: true })
    await writeFile(path.join(repo, adrPath), '# Decision\n')
    await exec('git', ['add', '.'], { cwd: repo })
    await exec('git', ['commit', '-m', 'base'], { cwd: repo })
    gitReadFailure.path = adrPath

    await expect(buildRefDecisionCorpus(repo, 'HEAD', defaultConfig())).rejects.toBeInstanceOf(
      BaseRefUnavailableError,
    )
  })

  it('reports an unreadable base corpus as a policy error from check', async () => {
    const repo = await mkdtemp(path.join(tmpdir(), 'adr-check-base-corpus-'))
    const adrPath = 'docs/adr/0001-decision.md'
    await exec('git', ['init'], { cwd: repo })
    await exec('git', ['config', 'user.email', 'test@example.com'], { cwd: repo })
    await exec('git', ['config', 'user.name', 'Test'], { cwd: repo })
    await mkdir(path.join(repo, 'docs/adr'), { recursive: true })
    await writeFile(path.join(repo, adrPath), '# Decision\n')
    await writeFile(path.join(repo, 'adr.config.json'), JSON.stringify(defaultConfig()))
    await exec('git', ['add', '.'], { cwd: repo })
    await exec('git', ['commit', '-m', 'base'], { cwd: repo })
    gitReadFailure.path = adrPath

    const result = await runCheck(repo, { baseRef: 'HEAD' })

    expect(result.exitCode).toBe(1)
    expect(result.issues).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'base-ref-unavailable' }),
    )
  })
})
