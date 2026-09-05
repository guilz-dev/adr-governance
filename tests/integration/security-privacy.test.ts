import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { lstat, mkdtemp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { buildEvidenceBundle } from '../../src/analysis/repository-scan.js'
import { defaultConfig } from '../../src/core/config.js'
import { hashPrompt } from '../../src/core/risk-signals.js'
import { applyPlanOperations, validatePlanPaths } from '../../src/installer/apply-plan.js'
import { runBeforeTurn } from '../../src/hooks/before-turn.js'
import { gitCommit, initTestGitRepo } from '../helpers/git-test-repo.js'

async function readAllFiles(dir: string): Promise<string> {
  const { readdir } = await import('node:fs/promises')
  const parts: string[] = []
  async function walk(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      const abs = path.join(current, entry.name)
      const info = await lstat(abs)
      if (info.isSymbolicLink()) continue
      if (info.isDirectory()) {
        await walk(abs)
        continue
      }
      parts.push(await readFile(abs, 'utf8'))
    }
  }
  await walk(dir)
  return parts.join('\n')
}

describe('security and privacy contracts', () => {
  it('does not persist prompt bodies in turn state', async () => {
    const repo = await mkdtemp(path.join(tmpdir(), 'adr-privacy-prompt-'))
    initTestGitRepo(repo)
    const config = defaultConfig({ hooks: { enabled: true, afterTurnAudit: true, maxFollowUps: 1, timeoutMs: 1500 } })
    await writeFile(path.join(repo, 'adr.config.json'), JSON.stringify(config, null, 2))
    await mkdir(path.join(repo, '.adr-governance/state'), { recursive: true })
    await writeFile(path.join(repo, '.adr-governance/manifest.json'), '{}\n')
    execFileSync('git', ['add', '.'], { cwd: repo })
    gitCommit(repo, 'init')

    const secretPrompt = 'PROMPT_SENTINEL_7f3a architecture secret'
    await runBeforeTurn({ cwd: repo, prompt: secretPrompt, sessionId: 'privacy-test' })
    const stateText = await readAllFiles(path.join(repo, '.adr-governance', 'state'))
    expect(stateText).not.toContain(secretPrompt)
    expect(stateText).toContain(hashPrompt(secretPrompt))
  })

  it('excludes secret paths from evidence bundle serialization', async () => {
    const repo = await mkdtemp(path.join(tmpdir(), 'adr-privacy-secrets-'))
    await writeFile(path.join(repo, '.env.production'), 'SENTINEL_SECRET=abc\n')
    await mkdir(path.join(repo, 'config'), { recursive: true })
    await writeFile(path.join(repo, 'config/client-secret.json'), '{"token":"SENTINEL_TOKEN"}\n')
    await mkdir(path.join(repo, 'keys'), { recursive: true })
    await writeFile(path.join(repo, 'keys/service.credential'), 'credential-sentinel\n')
    await writeFile(path.join(repo, 'package.json'), '{"name":"fixture"}\n')

    const config = defaultConfig()
    const bundle = await buildEvidenceBundle(
      repo,
      [
        '.env.production',
        'config/client-secret.json',
        'keys/service.credential',
        'package.json',
      ],
      null,
      config.analysis.exclude,
    )
    const serialized = JSON.stringify(bundle)
    expect(serialized).not.toContain('.env.production')
    expect(serialized).not.toContain('SENTINEL_SECRET')
    expect(serialized).not.toContain('SENTINEL_TOKEN')
    expect(serialized).not.toContain('credential-sentinel')
    expect(serialized).toContain('package.json')
  })

  it('rejects repo-escaping init plan operations', async () => {
    const repo = await mkdtemp(path.join(tmpdir(), 'adr-privacy-escape-'))
    const outsideDir = await mkdtemp(path.join(tmpdir(), 'adr-outside-'))
    const outsideFile = path.join(outsideDir, 'outside.txt')
    const linked = path.join(repo, 'linked')
    await symlink(outsideDir, linked)

    const operations = [
      { kind: 'create' as const, path: '../outside.txt', content: 'blocked' },
      { kind: 'create' as const, path: '/tmp/outside.txt', content: 'blocked' },
      { kind: 'create' as const, path: 'linked/outside.txt', content: 'blocked' },
    ]

    for (const operation of operations) {
      const errors = await validatePlanPaths(repo, {
        schemaVersion: 1,
        planId: 'test',
        repositoryRootHash: 'sha',
        sourceHeadSha: null,
        createdAt: new Date().toISOString(),
        detectedLayout: 'none',
        proposedConfig: defaultConfig(),
        operations: [operation],
        postApplySteps: [],
        evidenceReferences: [],
      })
      expect(errors.length).toBeGreaterThan(0)
      await expect(applyPlanOperations(repo, [operation])).rejects.toThrow()
    }

    expect(await readFile(outsideFile, 'utf8').catch(() => null)).toBeNull()
  })
})
