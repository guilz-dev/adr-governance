import { parseDecisionEvidence, serializeDecisionEvidence, type DecisionEvidence } from '../core/decision-evidence.js'

const BLOCK_RE = /```adr-governance\s*\n([\s\S]*?)\n```/g

export function parseGitHubEventEvidence(raw: unknown): DecisionEvidence | null {
  if (typeof raw !== 'object' || raw === null) return null
  const body = (raw as { pull_request?: { body?: string } }).pull_request?.body
  if (typeof body !== 'string') return null

  const matches = [...body.matchAll(BLOCK_RE)]
  if (matches.length !== 1) return null

  const jsonText = matches[0]?.[1]?.trim()
  if (!jsonText) return null

  try {
    return parseDecisionEvidence(JSON.parse(jsonText))
  } catch {
    return null
  }
}

export function toGitHubMarkdown(evidence: DecisionEvidence): string {
  return ['```adr-governance', serializeDecisionEvidence(evidence), '```'].join('\n')
}
