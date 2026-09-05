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

export type ReviewedProposal = {
  id: string
  relation: 'unrelated'
}

export type DecisionEvidenceV1 = {
  schemaVersion: 1
  decisionCorpusHash: string
  outcome: DecisionEvidenceOutcome
  reviewedProposals: ReviewedProposal[]
}

export type DecisionEvidenceV2 = {
  schemaVersion: 2
  baseCommit: string
  decisionCorpusHash: string
  changeSet: {
    algorithm: 'git-change-set-v1'
    digest: string
  }
  outcome: DecisionEvidenceOutcome
  reviewedProposals: ReviewedProposal[]
}

export type DecisionEvidence = DecisionEvidenceV1 | DecisionEvidenceV2

const HASH_RE = /^sha256:[a-f0-9]{64}$/
const COMMIT_RE = /^[a-f0-9]{40}$|^[a-f0-9]{64}$/
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

function parseReviewedProposal(raw: unknown): ReviewedProposal {
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

function parseOutcome(raw: unknown): DecisionEvidenceOutcome {
  if (!isRecord(raw) || typeof raw.kind !== 'string') {
    throw new Error('invalid outcome')
  }

  if (raw.kind === 'accepted-adr') {
    if (!Array.isArray(raw.refs)) throw new Error('invalid refs')
    const refs = raw.refs.map(parseRef)
    const ids = new Set<string>()
    for (const ref of refs) {
      if (ids.has(ref.id)) throw new Error('duplicate ADR ref')
      ids.add(ref.id)
    }
    if (refs.length === 0) throw new Error('at least one accepted ADR ref is required')
    return { kind: 'accepted-adr', refs }
  }

  if (raw.kind === 'no-adr') {
    const reason = raw.reason
    const rationale = raw.rationale
    if (typeof reason !== 'string' || !(NO_ADR_REASONS as readonly string[]).includes(reason)) {
      throw new Error('invalid no-adr reason')
    }
    if (typeof rationale !== 'string' || rationale.trim().length === 0) {
      throw new Error('no-adr rationale must be non-empty')
    }
    return { kind: 'no-adr', reason: reason as NoAdrReason, rationale: rationale.trim() }
  }

  throw new Error('unknown outcome kind')
}

function parseReviewedProposals(raw: unknown): ReviewedProposal[] {
  if (!Array.isArray(raw)) {
    throw new Error('reviewedProposals must be an array')
  }
  const reviewedProposals = raw.map(parseReviewedProposal)
  const reviewedIds = new Set<string>()
  for (const item of reviewedProposals) {
    if (reviewedIds.has(item.id)) throw new Error('duplicate reviewed proposal')
    reviewedIds.add(item.id)
  }
  return reviewedProposals
}

function parseChangeSet(raw: unknown): DecisionEvidenceV2['changeSet'] {
  if (!isRecord(raw)) throw new Error('invalid change set')
  const algorithm = raw.algorithm
  const digest = raw.digest
  if (algorithm !== 'git-change-set-v1') {
    throw new Error('unsupported change set algorithm')
  }
  if (typeof digest !== 'string' || !HASH_RE.test(digest)) {
    throw new Error('invalid change set digest')
  }
  return { algorithm: 'git-change-set-v1', digest }
}

export function parseDecisionEvidence(raw: unknown): DecisionEvidence {
  if (!isRecord(raw)) throw new Error('decision evidence must be an object')

  const schemaVersion = raw.schemaVersion
  if (schemaVersion !== 1 && schemaVersion !== 2) {
    throw new Error('unsupported decision evidence schema')
  }

  const decisionCorpusHash = raw.decisionCorpusHash
  if (typeof decisionCorpusHash !== 'string' || !HASH_RE.test(decisionCorpusHash)) {
    throw new Error('invalid decision corpus hash')
  }

  const outcome = parseOutcome(raw.outcome)
  const reviewedProposals = parseReviewedProposals(raw.reviewedProposals)

  if (schemaVersion === 1) {
    return {
      schemaVersion: 1,
      decisionCorpusHash,
      outcome,
      reviewedProposals,
    }
  }

  const baseCommit = raw.baseCommit
  if (typeof baseCommit !== 'string' || !COMMIT_RE.test(baseCommit)) {
    throw new Error('invalid base commit')
  }

  const changeSet = parseChangeSet(raw.changeSet)

  return {
    schemaVersion: 2,
    baseCommit,
    decisionCorpusHash,
    changeSet,
    outcome,
    reviewedProposals,
  }
}

export function serializeDecisionEvidence(evidence: DecisionEvidence): string {
  const sortedReviewed = [...evidence.reviewedProposals].sort((a, b) => a.id.localeCompare(b.id))
  const sorted =
    evidence.outcome.kind === 'accepted-adr'
      ? {
          ...evidence,
          outcome: {
            kind: 'accepted-adr' as const,
            refs: [...evidence.outcome.refs].sort((a, b) => a.id.localeCompare(b.id)),
          },
          reviewedProposals: sortedReviewed,
        }
      : {
          ...evidence,
          reviewedProposals: sortedReviewed,
        }
  return JSON.stringify(sorted)
}

export function contentHashForFile(content: string): string {
  return `sha256:${sha256(content)}`
}

export function isDecisionEvidenceV1(evidence: DecisionEvidence): evidence is DecisionEvidenceV1 {
  return evidence.schemaVersion === 1
}

export function isDecisionEvidenceV2(evidence: DecisionEvidence): evidence is DecisionEvidenceV2 {
  return evidence.schemaVersion === 2
}
