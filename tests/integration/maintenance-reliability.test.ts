import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { runSync } from '../../src/cli/commands/sync.js'
import { runPromote } from '../../src/cli/commands/promote.js'
import { defaultConfig, configForSingleDir } from '../../src/core/config.js'
import { parseFrontmatter } from '../../src/core/lifecycle.js'
import { sha256 } from '../../src/core/numbering.js'
import type { InitPlan } from '../../src/core/types.js'
import { buildManifest } from '../../src/installer/generated-files.js'
import { mergeAllRuntimeHooks, verifyAllRuntimeHookEntries } from '../../src/installer/hook-merge.js'
import { initTestGitRepo } from '../helpers/git-test-repo.js'

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '../..')
const USER_FILES = ['adr.config.json', '.cursor/hooks.json', '.claude/settings.json', '.codex/hooks.json', '.gemini/settings.json']
const repos: string[] = []
afterEach(async () => {
  await Promise.all(repos.splice(0).map(repo => rm(repo, { recursive: true, force: true })))
})

async function makeRepo(): Promise<string> {
  const repo = await mkdtemp(path.join(tmpdir(), 'adr-maintenance-'))
  repos.push(repo)
  initTestGitRepo(repo)
  return repo
}

function syncPlan(): InitPlan {
  return {
    schemaVersion: 1, planId: 'sync', repositoryRootHash: '', sourceHeadSha: null,
    createdAt: '2026-09-13T00:00:00Z', detectedLayout: 'split',
    proposedConfig: defaultConfig(), operations: [], postApplySteps: ['write-manifest'],
    evidenceReferences: [],
  }
}

async function installedRepo(): Promise<string> {
  const repo = await makeRepo()
  await mkdir(path.join(repo, '.adr-governance/bin'), { recursive: true })
  await writeFile(path.join(repo, '.adr-governance/bin/cli.mjs'), 'original generated bundle\n')
  await writeFile(path.join(repo, 'adr.config.json'), JSON.stringify(defaultConfig()))
  await mergeAllRuntimeHooks(repo)
  // Reproduce a manifest made by old releases, including user-owned JSON hashes.
  const manifest = await buildManifest(repo, PACKAGE_ROOT)
  for (const file of USER_FILES) manifest.files[file] = sha256(await readFile(path.join(repo, file), 'utf8'))
  await writeFile(path.join(repo, '.adr-governance/manifest.json'), JSON.stringify(manifest))
  return repo
}

describe('mutable configuration sync', () => {
  it('preserves current configuration bytes and uses its layout despite an obsolete manifest hash', async () => {
    const repo = await installedRepo()
    const config = configForSingleDir('decisions')
    config.changeGate.mode = 'warn'
    const raw = JSON.stringify({ ...config, userExtension: { preserved: true } }, null, 4) + '\n'
    await writeFile(path.join(repo, 'adr.config.json'), raw)

    await runSync({ repoRoot: repo, packageRoot: PACKAGE_ROOT, plan: syncPlan() })

    expect(await readFile(path.join(repo, 'adr.config.json'), 'utf8')).toBe(raw)
    expect(await readFile(path.join(repo, 'decisions/README.md'), 'utf8')).toContain('decisions/')
    const manifest = JSON.parse(await readFile(path.join(repo, '.adr-governance/manifest.json'), 'utf8'))
    for (const file of USER_FILES) expect(manifest.files).not.toHaveProperty(file)
    expect(manifest.files['.adr-governance/bin/cli.mjs']).toBeTruthy()
  })

  it('preserves additional runtime settings and custom hooks across sync', async () => {
    const repo = await installedRepo()
    for (const file of USER_FILES.slice(1)) {
      const abs = path.join(repo, file)
      const doc = JSON.parse(await readFile(abs, 'utf8'))
      doc.permissions = { allow: ['user-owned-permission'] }
      doc.hooks.CustomEvent = [{ command: 'echo custom-user-hook' }]
      await writeFile(abs, JSON.stringify(doc))
    }

    await runSync({ repoRoot: repo, packageRoot: PACKAGE_ROOT, plan: syncPlan() })

    for (const file of USER_FILES.slice(1)) {
      const doc = JSON.parse(await readFile(path.join(repo, file), 'utf8'))
      expect(doc.permissions).toEqual({ allow: ['user-owned-permission'] })
      expect(doc.hooks.CustomEvent).toEqual([{ command: 'echo custom-user-hook' }])
    }
    expect(await verifyAllRuntimeHookEntries(repo)).toEqual([])
  })

  it('still rejects hand-edited generated bundles', async () => {
    const repo = await installedRepo()
    await writeFile(path.join(repo, '.adr-governance/bin/cli.mjs'), 'user changed bundle\n')
    await expect(runSync({ repoRoot: repo, packageRoot: PACKAGE_ROOT, plan: syncPlan() }))
      .rejects.toThrow(/Sync conflict: .adr-governance\/bin\/cli.mjs/)
  })

  it('still rejects duplicate managed hook registrations when ignoring obsolete JSON hashes', async () => {
    const repo = await installedRepo()
    const abs = path.join(repo, '.cursor/hooks.json')
    const doc = JSON.parse(await readFile(abs, 'utf8'))
    doc.hooks.stop.push(doc.hooks.stop[0])
    await writeFile(abs, JSON.stringify(doc))
    await expect(runSync({ repoRoot: repo, packageRoot: PACKAGE_ROOT, plan: syncPlan() }))
      .rejects.toThrow(/Multiple managed ADR hook entries/)
  })

  it('does not overwrite invalid current config with defaults', async () => {
    const repo = await makeRepo()
    await writeFile(path.join(repo, 'adr.config.json'), '{ invalid json')
    await expect(runSync({ repoRoot: repo, packageRoot: PACKAGE_ROOT, plan: syncPlan() })).rejects.toThrow()
    expect(await readFile(path.join(repo, 'adr.config.json'), 'utf8')).toBe('{ invalid json')
  })
})

describe('ADR promotion preservation', () => {
  it('preserves a legacy body with a leading blank line when adding acceptance metadata', async () => {
    const repo = await makeRepo()
    const config = defaultConfig()
    config.documents.legacyFrontmatter = true
    const dir = path.join(repo, config.layout.proposedDir)
    await mkdir(dir, { recursive: true })
    const body = '\n# Legacy proposal\n\nOriginal body.\n'
    await writeFile(path.join(dir, '0001-legacy.md'), body)

    const rel = await runPromote({ repoRoot: repo, config, adrId: 'ADR-0001' })

    const content = await readFile(path.join(repo, rel), 'utf8')
    expect(content.match(/^# /gm)).toHaveLength(1)
    expect(parseFrontmatter(content).body).toBe(body)
  })

  it.each(['split', 'single'] as const)('retains one H1, body bytes and metadata in %s layout', async mode => {
    const repo = await makeRepo()
    const config = mode === 'single' ? configForSingleDir('docs/adr') : defaultConfig()
    const dir = path.join(repo, config.layout.proposedDir)
    await mkdir(dir, { recursive: true })
    const body = '\n# Replacement decision\n\n## Decision\n\nOriginal body.\n'
    await writeFile(path.join(dir, '0003-replacement.md'), '---\nstatus: proposed\ndate: 2026-01-01\nsupersedes: ADR-0001, ADR-0002\nowner: architecture-team\n---\n' + body)

    const rel = await runPromote({ repoRoot: repo, config, adrId: 'ADR-0003', approval: 'automatic' })

    const content = await readFile(path.join(repo, rel), 'utf8')
    const parsed = parseFrontmatter(content)
    expect(content.match(/^# /gm)).toHaveLength(1)
    expect(parsed.body).toBe(body)
    expect(parsed.frontmatter).toMatchObject({ status: 'accepted', acceptance: 'automatic', supersedes: ['ADR-0001', 'ADR-0002'] })
    expect(parsed.frontmatter?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(parsed.frontmatter?.date).not.toBe('2026-01-01')
    expect(content).toContain('owner: architecture-team\n')
  })
})
