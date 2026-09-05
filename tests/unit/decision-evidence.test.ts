import { describe, expect, it } from 'vitest'

import {
  parseDecisionEvidence,
  serializeDecisionEvidence,
} from '../../src/core/decision-evidence.js'

describe('decision-evidence', () => {
  it('parses schemaVersion 2 evidence', () => {
    const parsed = parseDecisionEvidence({
      schemaVersion: 2,
      baseCommit: 'a'.repeat(40),
      decisionCorpusHash: `sha256:${'b'.repeat(64)}`,
      changeSet: {
        algorithm: 'git-change-set-v1',
        digest: `sha256:${'c'.repeat(64)}`,
      },
      outcome: {
        kind: 'no-adr',
        reason: 'reversible',
        rationale: 'Rollback is local and immediate.',
      },
      reviewedProposals: [],
    })
    expect(parsed.schemaVersion).toBe(2)
  })

  it('rejects invalid base commit', () => {
    expect(() =>
      parseDecisionEvidence({
        schemaVersion: 2,
        baseCommit: 'not-a-sha',
        decisionCorpusHash: `sha256:${'b'.repeat(64)}`,
        changeSet: {
          algorithm: 'git-change-set-v1',
          digest: `sha256:${'c'.repeat(64)}`,
        },
        outcome: {
          kind: 'no-adr',
          reason: 'reversible',
          rationale: 'ok',
        },
        reviewedProposals: [],
      }),
    ).toThrow(/invalid base commit/i)
  })

  it('rejects unknown change set algorithm', () => {
    expect(() =>
      parseDecisionEvidence({
        schemaVersion: 2,
        baseCommit: 'a'.repeat(40),
        decisionCorpusHash: `sha256:${'b'.repeat(64)}`,
        changeSet: {
          algorithm: 'unknown',
          digest: `sha256:${'c'.repeat(64)}`,
        },
        outcome: {
          kind: 'no-adr',
          reason: 'reversible',
          rationale: 'ok',
        },
        reviewedProposals: [],
      }),
    ).toThrow(/unsupported change set algorithm/i)
  })

  it('rejects invalid digest', () => {
    expect(() =>
      parseDecisionEvidence({
        schemaVersion: 2,
        baseCommit: 'a'.repeat(40),
        decisionCorpusHash: `sha256:${'b'.repeat(64)}`,
        changeSet: {
          algorithm: 'git-change-set-v1',
          digest: 'bad',
        },
        outcome: {
          kind: 'no-adr',
          reason: 'reversible',
          rationale: 'ok',
        },
        reviewedProposals: [],
      }),
    ).toThrow(/invalid change set digest/i)
  })

  it('rejects duplicate reviewed proposals', () => {
    expect(() =>
      parseDecisionEvidence({
        schemaVersion: 2,
        baseCommit: 'a'.repeat(40),
        decisionCorpusHash: `sha256:${'b'.repeat(64)}`,
        changeSet: {
          algorithm: 'git-change-set-v1',
          digest: `sha256:${'c'.repeat(64)}`,
        },
        outcome: {
          kind: 'no-adr',
          reason: 'reversible',
          rationale: 'ok',
        },
        reviewedProposals: [
          { id: 'ADR-0001', relation: 'unrelated' },
          { id: 'ADR-0001', relation: 'unrelated' },
        ],
      }),
    ).toThrow(/duplicate reviewed proposal/i)
  })

  it('still accepts schemaVersion 1 evidence', () => {
    const parsed = parseDecisionEvidence({
      schemaVersion: 1,
      decisionCorpusHash: `sha256:${'b'.repeat(64)}`,
      outcome: {
        kind: 'no-adr',
        reason: 'reversible',
        rationale: 'Rollback is local and immediate.',
      },
      reviewedProposals: [],
    })
    expect(parsed.schemaVersion).toBe(1)
  })

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

  it('round-trips valid accepted evidence with stable key order', () => {
    const raw = {
      schemaVersion: 2,
      baseCommit: 'a'.repeat(40),
      decisionCorpusHash: 'sha256:' + 'b'.repeat(64),
      changeSet: {
        algorithm: 'git-change-set-v1',
        digest: 'sha256:' + 'c'.repeat(64),
      },
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
