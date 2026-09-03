import { describe, expect, it } from 'vitest'

import { hashDecisionCorpus } from '../../src/core/decision-corpus.js'
import { evaluateChangeGate } from '../../src/core/change-gate.js'
import { defaultConfig } from '../../src/core/config.js'
import type { DecisionEvidence } from '../../src/core/decision-evidence.js'

describe('change-gate', () => {
  const config = defaultConfig()

  it('passes a concrete ADR artifact without evidence', () => {
    const issues = evaluateChangeGate({
      config,
      changedPaths: ['docs/adr/0001-foo.md'],
      governancePaths: ['docs/adr/0001-foo.md', 'CONTEXT.md'],
      changedProposedAdrs: [],
      adrContentHashes: new Map(),
      expectedDecisionCorpusHash: 'sha256:' + 'a'.repeat(64),
      evidence: null,
    })
    expect(issues).toHaveLength(0)
  })

  it('requires evidence for a non-ADR file beneath an ADR directory', () => {
    const issues = evaluateChangeGate({
      config,
      changedPaths: ['docs/adr/implementation.ts'],
      governancePaths: ['docs/adr/0001-foo.md', 'CONTEXT.md'],
      changedProposedAdrs: [],
      adrContentHashes: new Map(),
      expectedDecisionCorpusHash: 'sha256:' + 'a'.repeat(64),
      evidence: null,
    })
    expect(issues.some((i) => i.code === 'decision-evidence-required')).toBe(true)
  })

  it('requires evidence for code changes', () => {
    const issues = evaluateChangeGate({
      config,
      changedPaths: ['src/index.ts'],
      governancePaths: ['docs/adr'],
      changedProposedAdrs: [],
      adrContentHashes: new Map(),
      expectedDecisionCorpusHash: 'sha256:' + 'a'.repeat(64),
      evidence: null,
    })
    expect(issues.some((i) => i.code === 'decision-evidence-required')).toBe(true)
  })

  it('downgrades to warning in warn mode', () => {
    const warnConfig = defaultConfig({ changeGate: { mode: 'warn', exemptPaths: [], requireNoAdrRationale: true } })
    const issues = evaluateChangeGate({
      config: warnConfig,
      changedPaths: ['src/index.ts'],
      governancePaths: ['docs/adr'],
      changedProposedAdrs: [],
      adrContentHashes: new Map(),
      expectedDecisionCorpusHash: 'sha256:' + 'a'.repeat(64),
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
