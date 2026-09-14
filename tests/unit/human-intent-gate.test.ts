import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'

import { runCheck } from '../../src/cli/commands/check.js'
import { runCreate } from '../../src/cli/commands/create.js'
import { runManifestRefresh } from '../../src/cli/commands/manifest-refresh.js'
import { defaultConfig } from '../../src/core/config.js'

const exec = promisify(execFile)
const PACKAGE_ROOT = path.resolve(import.meta.dirname, '../..')

async function initRepo(): Promise<string> {
  const repo = await mkdtemp(path.join(tmpdir(), 'adr-human-intent-'))
  await exec('git', ['init', '-b', 'main'], { cwd: repo })
  await exec('git', ['config', 'user.email', 'test@example.com'], { cwd: repo })
  await exec('git', ['config', 'user.name', 'Test User'], { cwd: repo })
  await mkdir(path.join(repo, 'docs/adr'), { recursive: true })
  await mkdir(path.join(repo, 'docs/proposed-adr'), { recursive: true })
  await mkdir(path.join(repo, '.adr-governance/state/locks'), { recursive: true })
  await writeFile(path.join(repo, 'adr.config.json'), JSON.stringify(defaultConfig(), null, 2))
  await exec('git', ['add', '.'], { cwd: repo })
  await exec('git', ['commit', '-m', 'base'], { cwd: repo })
  return repo
}

describe('human intent gate', () => {
  it('rejects create without --approval human', async () => {
    const repo = await initRepo()

    await expect(
      runCreate({
        repoRoot: repo,
        config: defaultConfig(),
        status: 'proposed',
        title: 'Test decision',
        body: '# Test\n\nBody',
      }),
    ).rejects.toThrow(/--approval human/)

    await expect(
      runCreate({
        repoRoot: repo,
        config: defaultConfig(),
        status: 'proposed',
        title: 'Test decision',
        body: '# Test\n\nBody',
        approval: 'automatic',
      }),
    ).rejects.toThrow(/--approval human/)
  })

  it('allows create with --approval human', async () => {
    const repo = await initRepo()

    const rel = await runCreate({
      repoRoot: repo,
      config: defaultConfig(),
      status: 'proposed',
      title: 'Test decision',
      body: '# Test\n\nBody',
      approval: 'human',
    })

    expect(rel).toMatch(/^docs\/proposed-adr\/\d{4}-test-decision\.md$/)
  })

  it('manifest-refresh writes manifest.json', async () => {
    const repo = await initRepo()
    await mkdir(path.join(repo, '.agents/skills/managing-adrs'), { recursive: true })
    await mkdir(path.join(repo, '.adr-governance/bin'), { recursive: true })
    await writeFile(path.join(repo, '.agents/skills/managing-adrs/SKILL.md'), '# skill\n')
    await writeFile(path.join(repo, '.adr-governance/bin/cli.mjs'), '// bundle\n')

    const manifestPath = await runManifestRefresh({ repoRoot: repo, packageRoot: PACKAGE_ROOT })
    expect(manifestPath).toBe('.adr-governance/manifest.json')

    const raw = await readFile(path.join(repo, manifestPath), 'utf8')
    const manifest = JSON.parse(raw) as { files?: Record<string, string> }
    expect(manifest.files?.['.agents/skills/managing-adrs/SKILL.md']).toBeTruthy()
  })

  it('fails check when a new accepted ADR is added directly', async () => {
    const repo = await initRepo()
    const adrPath = path.join(repo, 'docs/adr/0001-direct-accepted.md')
    await writeFile(
      adrPath,
      `---
status: accepted
date: 2026-09-14
acceptance: human
---
# Direct accepted add

Should fail check.
`,
    )
    await exec('git', ['add', '.'], { cwd: repo })
    await exec('git', ['commit', '-m', 'direct accepted add'], { cwd: repo })

    const result = await runCheck(repo, { baseRef: 'HEAD~1' })

    expect(result.issues.some((issue) => issue.code === 'direct-accepted-add')).toBe(true)
  })
})
