import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { runAttest } from '../../src/cli/commands/attest.js'
import { runCheck } from '../../src/cli/commands/check.js'
import { defaultConfig } from '../../src/core/config.js'
import { gitCommit, initTestGitRepo } from '../helpers/git-test-repo.js'

async function setupRepo(): Promise<{ repo: string; baseSha: string; config: ReturnType<typeof defaultConfig> }> {
  const repo = await mkdtemp(path.join(tmpdir(), 'adr-evidence-v2-'))
  initTestGitRepo(repo)
  const config = defaultConfig({ changeGate: { mode: 'enforce', exemptPaths: [], requireNoAdrRationale: true } })
  await mkdir(path.join(repo, 'docs/adr'), { recursive: true })
  await mkdir(path.join(repo, 'docs/proposed-adr'), { recursive: true })
  await mkdir(path.join(repo, 'src'), { recursive: true })
  await writeFile(path.join(repo, 'src/app.ts'), 'export const app = true\n')
  await writeFile(path.join(repo, 'adr.config.json'), JSON.stringify(config, null, 2))
  await writeFile(path.join(repo, '.gitignore'), '.adr-governance/state/\n')
  execFileSync('git', ['add', '.'], { cwd: repo })
  gitCommit(repo, 'base')
  const baseSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo }).toString().trim()
  return { repo, baseSha, config }
}

describe('decision evidence v2 integration', () => {
  it('flags post-attest content changes as stale', async () => {
    const { repo, baseSha, config } = await setupRepo()
    const evidence = await runAttest({
      repoRoot: repo,
      config,
      baseRef: baseSha,
      adrIds: [],
      noAdrReason: 'reversible',
      rationale: 'Local rollback is immediate.',
      reviewedProposalIds: [],
    })
    const evidencePath = path.join(repo, 'evidence.json')
    await writeFile(evidencePath, JSON.stringify(evidence, null, 2))

    await writeFile(path.join(repo, 'src/app.ts'), 'export const changedAgain = true\n')
    const result = await runCheck(repo, { baseRef: baseSha, evidencePath })
    expect(result.issues.map((issue) => issue.code)).toContain('decision-changeset-stale')
  })

  it('flags new paths after attestation', async () => {
    const { repo, baseSha, config } = await setupRepo()
    const evidence = await runAttest({
      repoRoot: repo,
      config,
      baseRef: baseSha,
      adrIds: [],
      noAdrReason: 'reversible',
      rationale: 'Local rollback is immediate.',
      reviewedProposalIds: [],
    })
    const evidencePath = path.join(repo, 'evidence.json')
    await writeFile(evidencePath, JSON.stringify(evidence, null, 2))
    await writeFile(path.join(repo, 'src/new.ts'), 'export const newFile = true\n')

    const result = await runCheck(repo, { baseRef: baseSha, evidencePath })
    expect(result.issues.map((issue) => issue.code)).toContain('decision-changeset-stale')
  })

  it('flags base SHA mismatch', async () => {
    const { repo, baseSha, config } = await setupRepo()
    const evidence = await runAttest({
      repoRoot: repo,
      config,
      baseRef: baseSha,
      adrIds: [],
      noAdrReason: 'reversible',
      rationale: 'Local rollback is immediate.',
      reviewedProposalIds: [],
    })
    const evidencePath = path.join(repo, 'evidence.json')
    const tampered = { ...evidence, baseCommit: 'b'.repeat(40) }
    await writeFile(evidencePath, JSON.stringify(tampered, null, 2))

    const result = await runCheck(repo, { baseRef: baseSha, evidencePath })
    expect(result.issues.map((issue) => issue.code)).toContain('decision-base-stale')
  })

  it('warns for legacy v1 evidence', async () => {
    const { repo, baseSha, config } = await setupRepo()
    const { hashDecisionCorpus, buildRefDecisionCorpus } = await import('../../src/core/decision-corpus.js')
    const v1 = {
      schemaVersion: 1,
      decisionCorpusHash: hashDecisionCorpus(await buildRefDecisionCorpus(repo, baseSha, config)),
      outcome: {
        kind: 'no-adr',
        reason: 'reversible',
        rationale: 'Local rollback is immediate.',
      },
      reviewedProposals: [],
    }
    const evidencePath = path.join(repo, 'evidence.json')
    await writeFile(evidencePath, JSON.stringify(v1, null, 2))

    const warnConfig = defaultConfig({ changeGate: { mode: 'warn', exemptPaths: [], requireNoAdrRationale: true } })
    await writeFile(path.join(repo, 'adr.config.json'), JSON.stringify(warnConfig, null, 2))
    const result = await runCheck(repo, { baseRef: baseSha, evidencePath })
    expect(result.issues.map((issue) => issue.code)).toContain('decision-evidence-legacy')
  })

  it('produces schemaVersion 2 from attest', async () => {
    const { repo, baseSha, config } = await setupRepo()
    const evidence = await runAttest({
      repoRoot: repo,
      config,
      baseRef: baseSha,
      adrIds: [],
      noAdrReason: 'reversible',
      rationale: 'Local rollback is immediate.',
      reviewedProposalIds: [],
    })
    expect(evidence.schemaVersion).toBe(2)
    if (evidence.schemaVersion === 2) {
      expect(evidence.changeSet.algorithm).toBe('git-change-set-v1')
      expect(evidence.baseCommit).toBe(baseSha)
    }
  })
})
