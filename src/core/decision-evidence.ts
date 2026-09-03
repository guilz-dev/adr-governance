import type { NoAdrReason } from './types.js'
import { NO_ADR_REASONS } from './types.js'
import { sha256 } from './numbering.js'

export type DecisionEvidenceOutcome =
  | {
      kind: 'accepted-adr'
      refs: Array<{ id: string; contentHash: string }>
    }
  | {
      kind: 'no-adr'
      reason: NoAdrReason
      rationale: string
    }

export type DecisionEvidence = {
  schemaVersion: 1
  decisionCorpusHash: string
  outcome: DecisionEvidenceOutcome
  reviewedProposals: Array<{ id: string; relation: 'unrelated' }>
}

const HASH_RE = /^sha256:[a-f0-9]{64}$/
const ADR_ID_RE = /^ADR-\d{4,}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseRef(raw: unknown): { id: string; contentHash: string } {
  if (!isRecord(raw)) throw new Error('invalid ADR ref')
  const id = raw.id
  const contentHash = raw.contentHash
  if (typeof id !== 'string' || !ADR_ID_RE.test(id)) {
    throw new Error('invalid ADR id')
  }
  if (typeof contentHash !== 'string' || !HASH_RE.test(contentHash)) {
    throw new Error('invalid content hash')
  }
  return { id, contentHash }
}

function parseReviewedProposal(raw: unknown): { id: string; relation: 'unrelated' } {
  if (!isRecord(raw)) throw new Error('invalid reviewed proposal')
  const id = raw.id
  const relation = raw.relation
  if (typeof id !== 'string' || !ADR_ID_RE.test(id)) {
    throw new Error('invalid reviewed proposal id')
  }
  if (relation !== 'unrelated') {
    throw new Error('invalid reviewed proposal relation')
  }
  return { id, relation }
}

export function parseDecisionEvidence(raw: unknown): DecisionEvidence {
  if (!isRecord(raw)) throw new Error('decision evidence must be an object')
  if (raw.schemaVersion !== 1) throw new Error('unsupported decision evidence schema')

  const decisionCorpusHash = raw.decisionCorpusHash
  if (typeof decisionCorpusHash !== 'string' || !HASH_RE.test(decisionCorpusHash)) {
    throw new Error('invalid decision corpus hash')
  }

  const outcomeRaw = raw.outcome
  if (!isRecord(outcomeRaw) || typeof outcomeRaw.kind !== 'string') {
    throw new Error('invalid outcome')
  }

  let outcome: DecisionEvidenceOutcome
  if (outcomeRaw.kind === 'accepted-adr') {
    if (!Array.isArray(outcomeRaw.refs)) throw new Error('invalid refs')
    const refs = outcomeRaw.refs.map(parseRef)
    const ids = new Set<string>()
    for (const ref of refs) {
      if (ids.has(ref.id)) throw new Error('duplicate ADR ref')
      ids.add(ref.id)
    }
    if (refs.length === 0) throw new Error('at least one accepted ADR ref is required')
    outcome = { kind: 'accepted-adr', refs }
  } else if (outcomeRaw.kind === 'no-adr') {
    const reason = outcomeRaw.reason
    const rationale = outcomeRaw.rationale
    if (typeof reason !== 'string' || !(NO_ADR_REASONS as readonly string[]).includes(reason)) {
      throw new Error('invalid no-adr reason')
    }
    if (typeof rationale !== 'string' || rationale.trim().length === 0) {
      throw new Error('no-adr rationale must be non-empty')
    }
    outcome = { kind: 'no-adr', reason: reason as NoAdrReason, rationale: rationale.trim() }
  } else {
    throw new Error('unknown outcome kind')
  }

  if (!Array.isArray(raw.reviewedProposals)) {
    throw new Error('reviewedProposals must be an array')
  }
  const reviewedProposals = raw.reviewedProposals.map(parseReviewedProposal)
  const reviewedIds = new Set<string>()
  for (const item of reviewedProposals) {
    if (reviewedIds.has(item.id)) throw new Error('duplicate reviewed proposal')
    reviewedIds.add(item.id)
  }

  return {
    schemaVersion: 1,
    decisionCorpusHash,
    outcome,
    reviewedProposals,
  }
}

export function serializeDecisionEvidence(evidence: DecisionEvidence): string {
  const sorted =
    evidence.outcome.kind === 'accepted-adr'
      ? {
          ...evidence,
          outcome: {
            kind: 'accepted-adr' as const,
            refs: [...evidence.outcome.refs].sort((a, b) => a.id.localeCompare(b.id)),
          },
          reviewedProposals: [...evidence.reviewedProposals].sort((a, b) =>
            a.id.localeCompare(b.id),
          ),
        }
      : {
          ...evidence,
          reviewedProposals: [...evidence.reviewedProposals].sort((a, b) =>
            a.id.localeCompare(b.id),
          ),
        }
  return JSON.stringify(sorted)
}

export function contentHashForFile(content: string): string {
  return `sha256:${sha256(content)}`
}
