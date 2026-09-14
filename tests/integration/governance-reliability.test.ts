import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { runAttest } from '../../src/cli/commands/attest.js'
import { runCheck } from '../../src/cli/commands/check.js'
import { toGitHubMarkdown } from '../../src/cli/github-evidence.js'
import { defaultConfig } from '../../src/core/config.js'
import { buildRefDecisionCorpus, buildWorkingDecisionCorpus, hashDecisionCorpus } from '../../src/core/decision-corpus.js'
import { loadAllAdrs } from '../../src/core/repository-state.js'
import { buildManifest } from '../../src/installer/generated-files.js'
import { mergeAllRuntimeHooks } from '../../src/installer/hook-merge.js'
import { gitCommit, initTestGitRepo } from '../helpers/git-test-repo.js'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
const git = (repo: string, ...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim()
async function put(repo: string, relative: string, content: string) {
  await mkdir(path.dirname(path.join(repo, relative)), { recursive: true })
  await writeFile(path.join(repo, relative), content)
}
const adr = (status = 'accepted', acceptance = 'human') => `---\nstatus: ${status}\ndate: 2026-09-13\n${status === 'accepted' ? `acceptance: ${acceptance}\n` : ''}---\n\n# Decision\n\nBody\n`
async function setup(config = defaultConfig(), files: Record<string, string> = {}) {
  const repo = await mkdtemp(path.join(tmpdir(), 'adr-reliability-'))
  roots.push(repo)
  initTestGitRepo(repo)
  git(repo, 'config', 'core.quotePath', 'true')
  await put(repo, 'adr.config.json', JSON.stringify(config))
  await put(repo, '.gitignore', '.adr-governance/state/\n')
  for (const [file, content] of Object.entries(files)) await put(repo, file, content)
  await mergeAllRuntimeHooks(repo)
  await put(repo, '.adr-governance/manifest.json', JSON.stringify(await buildManifest(repo, repo)))
  git(repo, 'add', '.')
  gitCommit(repo, 'base')
  const baseRef = git(repo, 'rev-parse', 'HEAD')
  return { repo, config, baseRef }
}
async function event(repo: string, body = '') {
  const relative = '.adr-governance/state/event.json'
  await put(repo, relative, JSON.stringify({ pull_request: { body } }))
  return path.join(repo, relative)
}
async function attest(f: Awaited<ReturnType<typeof setup>>) {
  return runAttest({ repoRoot: f.repo, config: f.config, baseRef: f.baseRef, adrIds: [], noAdrReason: 'reversible', rationale: 'The fixture is a reversible implementation change.', reviewedProposalIds: [] })
}

describe('trusted base policy', () => {
  it.each(['off', 'warn'] as const)('fails closed for a missing named base even with head mode %s', async mode => {
    const f = await setup(defaultConfig({ changeGate: { mode, exemptPaths: [] } }))
    const result = await runCheck(f.repo, { baseRef: 'missing-base' })
    expect(result.exitCode).toBe(1)
    expect(result.issues).toContainEqual(expect.objectContaining({ severity: 'error', code: 'base-ref-unavailable' }))
  })

  it('fails closed when the base contains no governance policy, even if head turns it off', async () => {
    const f = await setup()
    git(f.repo, 'rm', 'adr.config.json')
    gitCommit(f.repo, 'base without policy')
    f.config.changeGate.mode = 'off'
    await put(f.repo, 'adr.config.json', JSON.stringify(f.config))
    expect((await runCheck(f.repo, { baseRef: 'HEAD' })).issues.map(i => i.code)).toContain('base-policy-unavailable')
  })

  it('downgrades a failed comparison when the trusted policy is warn', async () => {
    const f = await setup(defaultConfig({ changeGate: { mode: 'warn', exemptPaths: [] } }))
    git(f.repo, 'checkout', '--orphan', 'unrelated')
    git(f.repo, 'rm', '-rf', '.')
    await put(f.repo, 'adr.config.json', JSON.stringify(f.config))
    git(f.repo, 'add', '.')
    gitCommit(f.repo, 'unrelated policy')
    git(f.repo, 'checkout', 'main')
    const result = await runCheck(f.repo, { baseRef: 'unrelated' })
    expect(result.issues).toEqual([expect.objectContaining({ severity: 'warning', code: 'base-ref-unavailable' })])
    expect(result.exitCode).toBe(0)
  })

  it.each(['off', 'warn', 'exempt', 'layout'] as const)('does not accept a head-only %s policy override', async override => {
    const f = await setup()
    await put(f.repo, 'src/evil.ts', 'export const evil = true\n')
    if (override === 'off' || override === 'warn') f.config.changeGate.mode = override
    if (override === 'exempt') f.config.changeGate.exemptPaths = ['src/']
    if (override === 'layout') f.config.layout.contextFile = 'src/evil.ts'
    await put(f.repo, 'adr.config.json', JSON.stringify(f.config))
    await put(f.repo, '.adr-governance/manifest.json', JSON.stringify(await buildManifest(f.repo, f.repo)))
    const result = await runCheck(f.repo, { baseRef: f.baseRef })
    expect(result.issues).toContainEqual(expect.objectContaining({ severity: 'error', code: 'decision-evidence-required' }))
  })

  it('does not allow a head manifest entry to exempt an implementation file', async () => {
    const f = await setup()
    const stale = await attest(f)
    const content = 'export const evil = true\n'
    await put(f.repo, 'src/evil.ts', content)
    const manifest = JSON.parse(await readFile(path.join(f.repo, '.adr-governance/manifest.json'), 'utf8'))
    manifest.files['src/evil.ts'] = createHash('sha256').update(content).digest('hex')
    await put(f.repo, '.adr-governance/manifest.json', JSON.stringify(manifest))
    const result = await runCheck(f.repo, { baseRef: f.baseRef, githubEventPath: await event(f.repo, toGitHubMarkdown(stale)) })
    expect(result.issues.map(i => i.code)).toContain('decision-changeset-stale')
  })

  it('requires evidence for config and generated executable changes', async () => {
    const f = await setup(defaultConfig(), { '.adr-governance/bin/cli.mjs': 'export const cli = 1\n' })
    await put(f.repo, '.adr-governance/bin/cli.mjs', 'export const cli = 2\n')
    await put(f.repo, '.adr-governance/manifest.json', JSON.stringify(await buildManifest(f.repo, f.repo)))
    expect((await runCheck(f.repo, { baseRef: f.baseRef })).issues.map(i => i.code)).toContain('decision-evidence-required')
  })

  it('uses the base corpus layout in both attest and check', async () => {
    const f = await setup(defaultConfig(), { 'docs/adr/0001-one.md': adr() })
    f.config.layout.acceptedDir = 'decisions'
    await put(f.repo, 'adr.config.json', JSON.stringify(f.config))
    await put(f.repo, 'src/x.ts', 'export const x = 1\n')
    const evidence = await attest(f)
    const result = await runCheck(f.repo, { baseRef: f.baseRef, githubEventPath: await event(f.repo, toGitHubMarkdown(evidence)) })
    expect(result.issues.filter(i => i.code.startsWith('decision-'))).toEqual([])
    expect(evidence.decisionCorpusHash).toBe(hashDecisionCorpus(await buildRefDecisionCorpus(f.repo, f.baseRef, defaultConfig())))
  })
})

describe('classification and evidence diagnostics', () => {
  it('retains a file deletion when an exempt directory replaces it', async () => {
    const f = await setup(defaultConfig({ changeGate: { mode: 'enforce', exemptPaths: ['implementation.js/note.md'] } }), { 'implementation.js': 'implementation\n' })
    await rm(path.join(f.repo, 'implementation.js'))
    await put(f.repo, 'implementation.js/note.md', 'note\n')
    git(f.repo, 'add', '.')
    gitCommit(f.repo, 'replace implementation with directory')
    expect((await runCheck(f.repo, { baseRef: f.baseRef })).issues.map(i => i.code)).toContain('decision-evidence-required')
  })

  it.each(['add', 'update', 'delete'] as const)('explicitly rejects an unsupported gitlink %s under enforce policy', async change => {
    const f = await setup()
    git(f.repo, 'update-index', '--add', '--cacheinfo', `160000,${f.baseRef},dependency`)
    gitCommit(f.repo, 'add gitlink')
    let baseRef = f.baseRef
    if (change !== 'add') {
      baseRef = git(f.repo, 'rev-parse', 'HEAD')
      if (change === 'delete') git(f.repo, 'update-index', '--force-remove', 'dependency')
      else git(f.repo, 'update-index', '--cacheinfo', `160000,${baseRef},dependency`)
      gitCommit(f.repo, `${change} gitlink`)
    }
    // Default CI checkout leaves an uninitialized submodule directory.
    await mkdir(path.join(f.repo, 'dependency'), { recursive: true })
    const result = await runCheck(f.repo, { baseRef })
    expect(result.exitCode).toBe(1)
    expect(result.issues).toContainEqual(expect.objectContaining({ severity: 'error', message: expect.stringContaining('unsupported gitlink snapshot: dependency') }))
  })

  it('checks a deleted source path when its rename destination is exempt', async () => {
    const f = await setup(defaultConfig({ changeGate: { mode: 'enforce', exemptPaths: ['docs/'] } }), { 'src/core.ts': 'export const core = 1\n' })
    await mkdir(path.join(f.repo, 'docs'), { recursive: true })
    git(f.repo, 'mv', 'src/core.ts', 'docs/core.ts')
    expect((await runCheck(f.repo, { baseRef: f.baseRef })).issues.map(i => i.code)).toContain('decision-evidence-required')
  })

  it('allows an exempt Unicode path without a PR evidence block', async () => {
    const f = await setup(defaultConfig({ changeGate: { mode: 'enforce', exemptPaths: ['docs/'] } }))
    await put(f.repo, 'docs/設計 メモ.md', 'memo\n')
    expect((await runCheck(f.repo, { baseRef: f.baseRef, githubEventPath: await event(f.repo) })).issues).toEqual([])
  })

  it('allows governance-only changes without parsing an evidence file', async () => {
    const f = await setup(defaultConfig(), { 'docs/adr/0001-one.md': adr() })
    await put(f.repo, 'docs/adr/0001-one.md', adr() + '\nClarification.\n')
    expect((await runCheck(f.repo, { baseRef: f.baseRef, githubEventPath: await event(f.repo) })).issues).toEqual([])
    expect((await runCheck(f.repo, { baseRef: f.baseRef, evidencePath: '/missing/evidence.json' })).issues).toEqual([])
  })

  it('reports absent evidence once, and invalid evidence with its own diagnostic', async () => {
    const f = await setup()
    await put(f.repo, 'src/x.ts', 'x\n')
    const missing = await runCheck(f.repo, { baseRef: f.baseRef, githubEventPath: await event(f.repo) })
    expect(missing.issues.filter(i => i.code === 'decision-evidence-required')).toHaveLength(1)
    const invalid = await runCheck(f.repo, { baseRef: f.baseRef, evidencePath: '/missing/evidence.json' })
    expect(invalid.issues.filter(i => i.code.startsWith('decision-evidence-')).map(i => i.code)).toEqual(['decision-evidence-invalid'])
  })
})

describe('ADR scope and metadata', () => {
  it('does not collide with unrelated RFCs and recognizes five-digit ADR numbers', async () => {
    const config = defaultConfig({ documents: { ...defaultConfig().documents, idDigits: 5 } })
    const f = await setup(config, { 'docs/rfc/0001-rfc.md': '# RFC\n', 'docs/adr/10000-old.md': adr() })
    await put(f.repo, 'docs/proposed-adr/00001-new.md', adr('proposed'))
    expect((await runCheck(f.repo, { baseRef: f.baseRef })).issues).toEqual([])
    await rm(path.join(f.repo, 'docs/adr/10000-old.md'))
    await put(f.repo, 'docs/adr/10000-new.md', adr())
    expect((await runCheck(f.repo, { baseRef: f.baseRef })).issues.map(i => i.code)).toContain('base-ref-number-collision')
  })

  it('reports each duplicate number only once', async () => {
    const f = await setup()
    await put(f.repo, 'docs/proposed-adr/0001-a.md', adr('proposed'))
    await put(f.repo, 'docs/proposed-adr/0001-b.md', adr('proposed'))
    expect((await runCheck(f.repo, { baseRef: f.baseRef })).issues.filter(i => i.code === 'duplicate-number')).toHaveLength(1)
  })

  it('shares recursive corpus scope and preserves the nested proposed kind', async () => {
    const config = defaultConfig({ layout: { ...defaultConfig().layout, proposedDir: 'docs/adr/proposed' }, documents: { ...defaultConfig().documents, legacyFrontmatter: true } })
    const f = await setup(config, { 'docs/adr/team/0001-one.md': adr(), 'docs/adr/proposed/0002-two.md': '# Legacy proposal\n', 'docs/adr/設計.md': 'Context notes\n' })
    const current = await buildWorkingDecisionCorpus(f.repo, config)
    const base = await buildRefDecisionCorpus(f.repo, f.baseRef, config)
    expect(current.map(e => e.path).sort()).toEqual(['docs/adr/proposed/0002-two.md', 'docs/adr/team/0001-one.md', 'docs/adr/設計.md'])
    expect(current).toEqual(base)
    expect((await loadAllAdrs(f.repo, config)).map(a => a.frontmatter.status)).toEqual(['accepted', 'proposed'])
    expect((await runCheck(f.repo, { baseRef: f.baseRef })).issues).toEqual([])
  })

  it('blocks direct accepted ADR adds even with human metadata under trusted human policy', async () => {
    const f = await setup(defaultConfig({ promotion: { requireHumanAcceptance: true } }))
    await put(f.repo, 'docs/adr/0001-self.md', adr('accepted', 'automatic'))
    const automaticCodes = (await runCheck(f.repo, { baseRef: f.baseRef })).issues.map(i => i.code)
    expect(automaticCodes).toContain('human-acceptance-required')
    expect(automaticCodes).toContain('direct-accepted-add')
    await put(f.repo, 'docs/adr/0001-self.md', adr('accepted', 'human'))
    expect((await runCheck(f.repo, { baseRef: f.baseRef })).issues.map(i => i.code)).toContain('direct-accepted-add')
  })

  it('uses byte ordering for the decision corpus payload', () => {
    const entries = [{ path: 'z.md', contentHash: 'sha256:1' }, { path: 'A.md', contentHash: 'sha256:2' }, { path: 'ä.md', contentHash: 'sha256:3' }]
    const payload = 'A.md\0sha256:2\nz.md\0sha256:1\nä.md\0sha256:3\n'
    expect(hashDecisionCorpus(entries)).toBe(`sha256:${createHash('sha256').update(payload).digest('hex')}`)
  })
})
