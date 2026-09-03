import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'

import { runCheck } from '../../src/cli/commands/check.js'
import { defaultConfig } from '../../src/core/config.js'
import { buildRefDecisionCorpus, hashDecisionCorpus } from '../../src/core/decision-corpus.js'

const exec = promisify(execFile)

const acceptedAdr = (status: 'accepted' | 'proposed' | 'rejected', body = 'Decision body') => `---
status: ${status}
date: 2026-09-03
${status === 'accepted' ? 'acceptance: human\n' : ''}---
# Decision

${body}
`

async function initRepo(config = defaultConfig()): Promise<string> {
  const repo = await mkdtemp(path.join(tmpdir(), 'adr-gate-classification-'))
  await exec('git', ['init'], { cwd: repo })
  await exec('git', ['config', 'user.email', 'test@example.com'], { cwd: repo })
  await exec('git', ['config', 'user.name', 'Test'], { cwd: repo })
  await mkdir(path.join(repo, 'docs/adr'), { recursive: true })
  await mkdir(path.join(repo, 'docs/proposed-adr'), { recursive: true })
  await writeFile(path.join(repo, 'adr.config.json'), JSON.stringify(config, null, 2))
  await exec('git', ['add', '.'], { cwd: repo })
  await exec('git', ['commit', '-m', 'base'], { cwd: repo })
  return repo
}

async function evidenceFor(repo: string, config = defaultConfig()) {
  return {
    schemaVersion: 1 as const,
    decisionCorpusHash: hashDecisionCorpus(await buildRefDecisionCorpus(repo, 'HEAD', config)),
    outcome: {
      kind: 'no-adr' as const,
      reason: 'no-decision' as const,
      rationale: 'The implementation does not introduce an architectural decision.',
    },
    reviewedProposals: [],
  }
}

describe('decision gate classification', () => {
  it('requires evidence for a non-ADR file inside the accepted ADR directory', async () => {
    const repo = await initRepo()
    await writeFile(path.join(repo, 'docs/adr/implementation.ts'), 'export const implementation = true\n')

    const result = await runCheck(repo, { baseRef: 'HEAD' })

    expect(result.issues.some((issue) => issue.code === 'decision-evidence-required')).toBe(true)
  })

  it('exempts a concrete current ADR Markdown artifact without evidence', async () => {
    const repo = await initRepo()
    const adrPath = path.join(repo, 'docs/adr/0001-decision.md')
    await writeFile(adrPath, acceptedAdr('accepted'))
    await exec('git', ['add', '.'], { cwd: repo })
    await exec('git', ['commit', '-m', 'add adr'], { cwd: repo })
    await writeFile(adrPath, acceptedAdr('accepted', 'Updated decision body'))

    const result = await runCheck(repo, { baseRef: 'HEAD' })

    expect(result.issues.some((issue) => issue.code === 'decision-evidence-required')).toBe(false)
  })

  it('exempts a deleted ADR Markdown artifact identified from the base tree', async () => {
    const repo = await initRepo()
    const adrPath = path.join(repo, 'docs/adr/0001-decision.md')
    await writeFile(adrPath, acceptedAdr('accepted'))
    await exec('git', ['add', '.'], { cwd: repo })
    await exec('git', ['commit', '-m', 'add adr'], { cwd: repo })
    await unlink(adrPath)

    const result = await runCheck(repo, { baseRef: 'HEAD' })

    expect(result.issues.some((issue) => issue.code === 'decision-evidence-required')).toBe(false)
  })

  it('exempts manifest-managed generated files without config exemptions', async () => {
    const repo = await initRepo()
    const generatedPath = '.generated/adr-governance.js'
    const generatedContent = 'export const generated = true\n'
    await mkdir(path.join(repo, '.adr-governance'), { recursive: true })
    await mkdir(path.join(repo, '.generated'), { recursive: true })
    await writeFile(path.join(repo, generatedPath), generatedContent)
    await writeFile(
      path.join(repo, '.adr-governance/manifest.json'),
      JSON.stringify({
        files: {
          [generatedPath]: createHash('sha256').update(generatedContent).digest('hex'),
        },
      }),
    )

    const result = await runCheck(repo, { baseRef: 'HEAD' })

    expect(result.issues.some((issue) => issue.code === 'decision-evidence-required')).toBe(false)
  })

  it('uses proposed status in a single layout and excludes rejected ADRs', async () => {
    const config = defaultConfig({
      layout: {
        mode: 'single',
        acceptedDir: 'docs/adr',
        proposedDir: 'docs/adr',
        contextFile: 'CONTEXT.md',
        contextMapFile: 'CONTEXT-MAP.md',
      },
    })
    const repo = await initRepo(config)
    const proposalPath = path.join(repo, 'docs/adr/0001-decision.md')
    await writeFile(proposalPath, acceptedAdr('proposed'))
    await exec('git', ['add', '.'], { cwd: repo })
    await exec('git', ['commit', '-m', 'add proposal'], { cwd: repo })
    await writeFile(proposalPath, acceptedAdr('proposed', 'Changed proposal body'))
    await mkdir(path.join(repo, 'src'), { recursive: true })
    await writeFile(path.join(repo, 'src/implementation.ts'), 'export const implementation = true\n')
    await writeFile(path.join(repo, 'evidence.json'), JSON.stringify(await evidenceFor(repo, config)))

    const proposedResult = await runCheck(repo, { baseRef: 'HEAD', evidencePath: path.join(repo, 'evidence.json') })
    expect(proposedResult.issues.some((issue) => issue.code === 'changed-proposal-unreviewed')).toBe(true)
    expect(proposedResult.issues.some((issue) => issue.code === 'status-path-mismatch')).toBe(false)

    await writeFile(proposalPath, acceptedAdr('rejected', 'Rejected alternative'))
    await writeFile(path.join(repo, 'evidence.json'), JSON.stringify(await evidenceFor(repo, config)))
    const rejectedResult = await runCheck(repo, { baseRef: 'HEAD', evidencePath: path.join(repo, 'evidence.json') })
    expect(rejectedResult.issues.some((issue) => issue.code === 'changed-proposal-unreviewed')).toBe(false)
    expect(rejectedResult.issues.some((issue) => issue.code === 'status-path-mismatch')).toBe(false)
  })
})
