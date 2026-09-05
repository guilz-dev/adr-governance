import { describe, expect, it } from 'vitest'

import { hashDecisionCorpus } from '../../src/core/decision-corpus.js'
import { evaluateChangeGate } from '../../src/core/change-gate.js'
import { defaultConfig } from '../../src/core/config.js'
import type { DecisionEvidence } from '../../src/core/decision-evidence.js'

function codes(issues: ReturnType<typeof evaluateChangeGate>): string[] {
  return issues.map((issue) => issue.code)
}

describe('change-gate', () => {
  const config = defaultConfig()
  const baseCommit = 'a'.repeat(40)
  const digest = `sha256:${'d'.repeat(64)}`
  const corpusHash = `sha256:${'a'.repeat(64)}`

  const v2Evidence: DecisionEvidence = {
    schemaVersion: 2,
    baseCommit,
    decisionCorpusHash: corpusHash,
    changeSet: { algorithm: 'git-change-set-v1', digest },
    outcome: { kind: 'no-adr', reason: 'reversible', rationale: 'ok' },
    reviewedProposals: [],
  }

  const gateBase = {
    config,
    changedPaths: ['src/index.ts'],
    governancePaths: ['docs/adr'],
    changedProposedAdrs: [],
    adrContentHashes: new Map(),
    expectedDecisionCorpusHash: corpusHash,
    resolvedBaseCommit: baseCommit,
    currentChangeSetDigest: digest,
    evidence: v2Evidence,
  }

  it('passes a concrete ADR artifact without evidence', () => {
    const issues = evaluateChangeGate({
      config,
      changedPaths: ['docs/adr/0001-foo.md'],
      governancePaths: ['docs/adr/0001-foo.md', 'CONTEXT.md'],
      changedProposedAdrs: [],
      adrContentHashes: new Map(),
      expectedDecisionCorpusHash: corpusHash,
      resolvedBaseCommit: baseCommit,
      currentChangeSetDigest: digest,
      evidence: null,
    })
    expect(issues).toHaveLength(0)
  })

  it('requires evidence for a non-ADR file beneath an ADR directory', () => {
    const issues = evaluateChangeGate({
      ...gateBase,
      changedPaths: ['docs/adr/implementation.ts'],
      governancePaths: ['docs/adr/0001-foo.md', 'CONTEXT.md'],
      evidence: null,
    })
    expect(issues.some((i) => i.code === 'decision-evidence-required')).toBe(true)
  })

  it('requires evidence for code changes', () => {
    const issues = evaluateChangeGate({
      ...gateBase,
      evidence: null,
    })
    expect(issues.some((i) => i.code === 'decision-evidence-required')).toBe(true)
  })

  it('flags stale change set digest', () => {
    const issues = evaluateChangeGate({
      ...gateBase,
      currentChangeSetDigest: `sha256:${'e'.repeat(64)}`,
    })
    expect(codes(issues)).toContain('decision-changeset-stale')
  })

  it('flags stale base commit', () => {
    const issues = evaluateChangeGate({
      ...gateBase,
      resolvedBaseCommit: 'b'.repeat(40),
    })
    expect(codes(issues)).toContain('decision-base-stale')
  })

  it('warns for legacy v1 evidence', () => {
    const v1Evidence: DecisionEvidence = {
      schemaVersion: 1,
      decisionCorpusHash: corpusHash,
      outcome: { kind: 'no-adr', reason: 'reversible', rationale: 'ok' },
      reviewedProposals: [],
    }
    const issues = evaluateChangeGate({
      ...gateBase,
      evidence: v1Evidence,
    })
    expect(issues).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        code: 'decision-evidence-legacy',
      }),
    )
  })

  it('downgrades to warning in warn mode', () => {
    const warnConfig = defaultConfig({ changeGate: { mode: 'warn', exemptPaths: [] } })
    const issues = evaluateChangeGate({
      ...gateBase,
      config: warnConfig,
      evidence: null,
    })
    expect(issues.every((i) => i.severity === 'warning')).toBe(true)
  })
})

describe('decision-corpus hash', () => {
  it('is order-independent', () => {
    const a = { path: 'docs/adr/0001-a.md', contentHash: 'sha256:' + '1'.repeat(64) }
    const b = { path: 'docs/adr/0002-b.md', contentHash: 'sha256:' + '2'.repeat(64) }
    expect(hashDecisionCorpus([b, a])).toBe(hashDecisionCorpus([a, b]))
  })

  it('changes when content hash changes', () => {
    const a = { path: 'docs/adr/0001-a.md', contentHash: 'sha256:' + '1'.repeat(64) }
    expect(hashDecisionCorpus([a])).not.toBe(
      hashDecisionCorpus([{ ...a, contentHash: 'sha256:' + '9'.repeat(64) }]),
    )
  })
})
