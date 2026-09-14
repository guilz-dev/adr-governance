import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { defaultConfig } from '../../src/core/config.js'
import { gitCommit, initTestGitRepo } from '../helpers/git-test-repo.js'

const packageRoot = path.resolve(import.meta.dirname, '../..')
const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})
const git = (repo: string, ...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim()
async function put(repo: string, relative: string, content: string) {
  await mkdir(path.dirname(path.join(repo, relative)), { recursive: true })
  await writeFile(path.join(repo, relative), content)
}
async function setup(single = false) {
  const repo = await mkdtemp(path.join(tmpdir(), 'adr-human-cli-'))
  roots.push(repo)
  initTestGitRepo(repo)
  const config = defaultConfig({ promotion: { requireHumanAcceptance: true } })
  if (single) config.layout = { ...config.layout, mode: 'single', proposedDir: 'docs/adr' }
  await put(repo, 'adr.config.json', JSON.stringify(config))
  await put(repo, '.gitignore', '.adr-governance/state/\n')
  await put(repo, 'docs/adr/0001-existing.md', '---\nstatus: accepted\ndate: 2026-09-14\nacceptance: human\n---\n# Existing decision\n\nExisting body.\n')
  await put(repo, '.adr-governance/bin/cli.mjs', await readFile(path.join(packageRoot, 'dist/bundle/cli.mjs'), 'utf8'))
  git(repo, 'add', '.')
  gitCommit(repo, 'base')
  return { repo, base: git(repo, 'rev-parse', 'HEAD'), proposedDir: config.layout.proposedDir }
}
function cli(repo: string, ...args: string[]) {
  const result = spawnSync(process.execPath, [path.join(repo, '.adr-governance/bin/cli.mjs'), ...args], { cwd: repo, encoding: 'utf8' })
  return { code: result.status, output: result.stdout + result.stderr, stdout: result.stdout }
}
async function create(f: Awaited<ReturnType<typeof setup>>) {
  await put(f.repo, '.adr-governance/state/body.md', '## Context\nHuman instruction.\n\n## Decision\nUse the approved option.\n')
  expect(cli(f.repo, 'create', '--status', 'proposed', '--title', 'New decision', '--body-file', '.adr-governance/state/body.md', '--approval', 'human').code).toBe(0)
}
async function evidence(f: Awaited<ReturnType<typeof setup>>, promoted = false) {
  const result = cli(f.repo, 'attest', '--base', f.base, '--adr', promoted ? 'ADR-0002' : 'ADR-0001', ...(promoted ? [] : ['--reviewed-proposal', 'ADR-0002']))
  expect(result.code, result.output).toBe(0)
  const relative = '.adr-governance/state/evidence.json'
  await put(f.repo, relative, result.stdout)
  return relative
}

describe('vendored human-intent CLI', () => {
  it('requires evidence for an ADR-only proposal and checks freshness and references', async () => {
    const f = await setup()
    await create(f)
    const missing = cli(f.repo, 'check', '--base', f.base)
    expect(missing.code, missing.output).toBe(1)
    expect(missing.output).toContain('decision-evidence-required')
    const ev = await evidence(f)
    expect(cli(f.repo, 'check', '--base', f.base, '--evidence', ev).code).toBe(0)
    const valid = await readFile(path.join(f.repo, ev), 'utf8')
    const raw = JSON.parse(valid)
    raw.outcome.refs[0].id = 'ADR-9999'
    await put(f.repo, ev, JSON.stringify(raw))
    expect(cli(f.repo, 'check', '--base', f.base, '--evidence', ev).output).toContain('decision-ref-not-accepted')
    await put(f.repo, ev, valid)
    const proposal = `${f.proposedDir}/0002-new-decision.md`
    await put(f.repo, proposal, (await readFile(path.join(f.repo, proposal), 'utf8')) + '\nChanged after attestation.\n')
    expect(cli(f.repo, 'check', '--base', f.base, '--evidence', ev).output).toContain('decision-changeset-stale')
  })

  it.each([false, true])('accepts same-PR create and human promote after a clean checkout (single=%s)', async single => {
    const f = await setup(single)
    await create(f)
    expect(cli(f.repo, 'promote', 'ADR-0002', '--approval', 'human').code).toBe(0)
    git(f.repo, 'add', '.')
    gitCommit(f.repo, 'create and promote in one commit')
    // Copy only committed files: local audit logs cannot authorize CI acceptance.
    const clean = await mkdtemp(path.join(tmpdir(), 'adr-human-clean-'))
    roots.push(clean)
    git(f.repo, 'clone', '--local', f.repo, clean)
    const ev = await evidence({ ...f, repo: clean }, true)
    const checked = cli(clean, 'check', '--base', f.base, '--evidence', ev)
    expect(checked.code, checked.output).toBe(0)
    const accepted = 'docs/adr/0002-new-decision.md'
    await put(clean, accepted, (await readFile(path.join(clean, accepted), 'utf8')).replace('approved option', 'unapproved option'))
    const stale = cli(clean, 'check', '--base', f.base, '--evidence', await evidence({ ...f, repo: clean }, true))
    expect(stale.code, stale.output).toBe(1)
    expect(stale.output).toContain('direct-accepted-add')
  })

  it('preserves promotion across Git CRLF normalization', async () => {
    const f = await setup()
    await put(f.repo, '.gitattributes', '*.md text eol=lf\n')
    await create(f)
    const proposal = `${f.proposedDir}/0002-new-decision.md`
    await put(f.repo, proposal, (await readFile(path.join(f.repo, proposal), 'utf8')).replace(/\n/g, '\r\n'))
    expect(cli(f.repo, 'promote', 'ADR-0002', '--approval', 'human').code).toBe(0)
    git(f.repo, 'add', '.')
    gitCommit(f.repo, 'promote CRLF proposal')
    const clean = await mkdtemp(path.join(tmpdir(), 'adr-human-lf-'))
    roots.push(clean)
    git(f.repo, 'clone', '--local', f.repo, clean)
    const result = cli(clean, 'check', '--base', f.base, '--evidence', await evidence({ ...f, repo: clean }, true))
    expect(result.code, result.output).toBe(0)
  })

  it('still rejects a directly added accepted ADR with human metadata', async () => {
    const f = await setup()
    await put(f.repo, 'docs/adr/0002-direct.md', '---\nstatus: accepted\ndate: 2026-09-15\nacceptance: human\n---\n# Direct add\n\nBody.\n')
    const result = cli(f.repo, 'check', '--base', f.base, '--evidence', await evidence(f, true))
    expect(result.code).toBe(1)
    expect(result.output).toContain('direct-accepted-add')
  })

  it('rolls back promotion when its portable record cannot be written', async () => {
    const f = await setup()
    await create(f)
    const proposal = `${f.proposedDir}/0002-new-decision.md`
    const before = await readFile(path.join(f.repo, proposal), 'utf8')
    await put(f.repo, '.adr-governance/promotions', 'not a directory')
    expect(cli(f.repo, 'promote', 'ADR-0002', '--approval', 'human').code).toBe(2)
    expect(await readFile(path.join(f.repo, proposal), 'utf8')).toBe(before)
    await expect(readFile(path.join(f.repo, 'docs/adr/0002-new-decision.md'))).rejects.toThrow()
  })

  it.each([false, true])('restores the proposal and record if audit logging fails (single=%s)', async single => {
    const f = await setup(single)
    await create(f)
    const proposal = `${f.proposedDir}/0002-new-decision.md`
    const before = await readFile(path.join(f.repo, proposal), 'utf8')
    git(f.repo, 'add', '.')
    gitCommit(f.repo, 'proposed decision')
    await put(f.repo, '.adr-governance/state/logs', 'not a directory')
    expect(cli(f.repo, 'promote', 'ADR-0002', '--approval', 'human').code).toBe(2)
    expect(await readFile(path.join(f.repo, proposal), 'utf8')).toBe(before)
    expect(git(f.repo, 'status', '--porcelain')).toBe('')
    await expect(readFile(path.join(f.repo, '.adr-governance/promotions/ADR-0002.json'))).rejects.toThrow()
  })

  it('keeps same-PR promotion evidence valid when the replacement supersedes an existing ADR', async () => {
    const f = await setup()
    await create(f)
    git(f.repo, 'add', '.')
    gitCommit(f.repo, 'propose replacement')
    expect(cli(f.repo, 'promote', 'ADR-0002', '--approval', 'human').code).toBe(0)
    expect(cli(f.repo, 'supersede', 'ADR-0001', '--by', 'ADR-0002', '--approval', 'human').code).toBe(0)
    const result = cli(f.repo, 'check', '--base', f.base, '--evidence', await evidence(f, true))
    expect(result.code, result.output).toBe(0)
  })

  it.each(['missing', 'malformed', 'wrong-approval', 'wrong-id'])('rejects an invalid portable promotion record (%s)', async mutation => {
    const f = await setup()
    await create(f)
    expect(cli(f.repo, 'promote', 'ADR-0002', '--approval', 'human').code).toBe(0)
    const relative = '.adr-governance/promotions/ADR-0002.json'
    const absolute = path.join(f.repo, relative)
    if (mutation === 'missing') await rm(absolute)
    else if (mutation === 'malformed') await put(f.repo, relative, '{')
    else {
      const record = JSON.parse(await readFile(absolute, 'utf8'))
      if (mutation === 'wrong-approval') record.approval = 'automatic'
      else record.adrId = 'ADR-9999'
      await put(f.repo, relative, JSON.stringify(record))
    }
    const result = cli(f.repo, 'check', '--base', f.base, '--evidence', await evidence(f, true))
    expect(result.code, result.output).toBe(1)
    expect(result.output).toContain('direct-accepted-add')
  })

  it('refreshes installed hashes without an upstream package directory', async () => {
    const f = await setup()
    await cp(path.join(packageRoot, 'skill/managing-adrs'), path.join(f.repo, '.agents/skills/managing-adrs'), { recursive: true })
    const result = cli(f.repo, 'manifest-refresh')
    expect(result.code, result.output).toBe(0)
    const content = await readFile(path.join(f.repo, '.agents/skills/managing-adrs/SKILL.md'))
    const manifest = JSON.parse(await readFile(path.join(f.repo, '.adr-governance/manifest.json'), 'utf8'))
    expect(manifest.files['.agents/skills/managing-adrs/SKILL.md']).toBe(createHash('sha256').update(content).digest('hex'))
  })
})
