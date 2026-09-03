import { describe, expect, it } from 'vitest'

import { parseDecisionEvidence, serializeDecisionEvidence } from '../../src/core/decision-evidence.js'

describe('decision-evidence', () => {
  it('rejects empty accepted-adr refs', () => {
    expect(() =>
      parseDecisionEvidence({
        schemaVersion: 1,
        decisionCorpusHash: 'sha256:' + 'a'.repeat(64),
        outcome: { kind: 'accepted-adr', refs: [] },
        reviewedProposals: [],
      }),
    ).toThrow(/at least one accepted ADR/i)
  })

  it('rejects empty no-adr rationale', () => {
    expect(() =>
      parseDecisionEvidence({
        schemaVersion: 1,
        decisionCorpusHash: 'sha256:' + 'a'.repeat(64),
        outcome: { kind: 'no-adr', reason: 'reversible', rationale: '   ' },
        reviewedProposals: [],
      }),
    ).toThrow(/non-empty/i)
  })

  it('round-trips valid accepted evidence', () => {
    const raw = {
      schemaVersion: 1,
      decisionCorpusHash: 'sha256:' + 'b'.repeat(64),
      outcome: {
        kind: 'accepted-adr',
        refs: [{ id: 'ADR-0001', contentHash: 'sha256:' + 'c'.repeat(64) }],
      },
      reviewedProposals: [],
    }
    const parsed = parseDecisionEvidence(raw)
    expect(JSON.parse(serializeDecisionEvidence(parsed))).toEqual(parsed)
  })
})
