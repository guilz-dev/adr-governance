import type { AdrConfig, ParsedAdr } from './types.js'
import type { ValidationIssue } from './validation.js'
import {
  isDecisionEvidenceV1,
  parseDecisionEvidence,
  type DecisionEvidence,
} from './decision-evidence.js'

export type ChangeGateInput = {
  config: AdrConfig
  changedPaths: string[]
  governancePaths: string[]
  changedNewAdrFiles: string[]
  changedProposedAdrs: ParsedAdr[]
  adrContentHashes: Map<string, string>
  expectedDecisionCorpusHash: string
  resolvedBaseCommit: string
  currentChangeSetDigest: string
  evidence: DecisionEvidence | null
}

const CHANGE_GATE_CODES = new Set([
  'decision-evidence-required',
  'decision-evidence-invalid',
  'decision-evidence-legacy',
  'decision-baseline-stale',
  'decision-base-stale',
  'decision-changeset-stale',
  'decision-ref-not-accepted',
  'decision-ref-stale',
  'changed-proposal-unreviewed',
])

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/')
}

function isGovernancePath(relativePath: string, governancePaths: string[]): boolean {
  const normalized = normalizePath(relativePath)
  for (const gov of governancePaths) {
    const g = normalizePath(gov)
    if (normalized === g) return true
  }
  return false
}

function isExempt(relativePath: string, exemptPaths: string[]): boolean {
  const normalized = normalizePath(relativePath)
  for (const exempt of exemptPaths) {
    const e = normalizePath(exempt)
    if (e.endsWith('/')) {
      if (normalized.startsWith(e)) return true
    } else if (normalized === e) {
      return true
    }
  }
  return false
}

export function nonGovernancePaths(changedPaths: string[], governancePaths: string[], config: AdrConfig): string[] {
  return changedPaths.filter(p => !isGovernancePath(p, governancePaths) && !isExempt(p, config.changeGate.exemptPaths))
}

function severityFor(config: AdrConfig, code: string): 'error' | 'warning' {
  if (code === 'decision-evidence-legacy') return 'warning'
  if (config.changeGate.mode === 'warn' && CHANGE_GATE_CODES.has(code)) {
    return 'warning'
  }
  return 'error'
}

function issue(
  config: AdrConfig,
  code: string,
  message: string,
  path?: string,
): ValidationIssue {
  return { severity: severityFor(config, code), code, message, path }
}

function reviewedProposalIssues(input: ChangeGateInput, evidence: DecisionEvidence): ValidationIssue[] {
  const reviewed = new Set(evidence.reviewedProposals.map((p) => p.id))
  const issues: ValidationIssue[] = []
  for (const proposed of input.changedProposedAdrs) {
    if (!reviewed.has(proposed.id)) {
      issues.push(
        issue(
          input.config,
          'changed-proposal-unreviewed',
          `Changed proposed ADR requires reviewedProposals declaration: ${proposed.id}`,
          proposed.path,
        ),
      )
    }
  }
  return issues
}

export function evaluateChangeGate(input: ChangeGateInput): ValidationIssue[] {
  const { config } = input
  if (config.changeGate.mode === 'off') return []

  const issues: ValidationIssue[] = []
  const hasNewAdrs = input.changedNewAdrFiles.length > 0
  const nonGovernanceChanges = nonGovernancePaths(input.changedPaths, input.governancePaths, config)

  if (!hasNewAdrs && nonGovernanceChanges.length === 0) return issues

  if (!input.evidence) {
    issues.push(
      issue(
        config,
        'decision-evidence-required',
        hasNewAdrs ? 'New ADR files require decision evidence' : 'Non-governance changes require decision evidence',
      ),
    )
    return issues
  }

  let evidence: DecisionEvidence
  try {
    evidence = parseDecisionEvidence(input.evidence)
  } catch (e) {
    issues.push(
      issue(
        config,
        'decision-evidence-invalid',
        `Decision evidence failed schema validation: ${String(e)}`,
      ),
    )
    return issues
  }

  if (hasNewAdrs && evidence.outcome.kind === 'no-adr') {
    issues.push(issue(config, 'decision-evidence-required', 'New ADR files require decision evidence; no-adr attestations cannot authorize ADR authoring'))
  }

  if (isDecisionEvidenceV1(evidence)) {
    issues.push(
      issue(
        config,
        'decision-evidence-legacy',
        'Decision evidence schema v1 is deprecated; re-run attest to produce v2',
      ),
    )
  } else if (evidence.baseCommit !== input.resolvedBaseCommit) {
    issues.push(
      issue(
        config,
        'decision-base-stale',
        'Decision evidence base commit does not match the attested base',
      ),
    )
  } else if (evidence.changeSet.digest !== input.currentChangeSetDigest) {
    issues.push(
      issue(
        config,
        'decision-changeset-stale',
        'Repository changes after attestation invalidate the decision evidence',
      ),
    )
  }

  if (evidence.decisionCorpusHash !== input.expectedDecisionCorpusHash) {
    issues.push(
      issue(
        config,
        'decision-baseline-stale',
        'Decision corpus hash does not match the attested base',
      ),
    )
  }

  if (evidence.outcome.kind === 'accepted-adr') {
    for (const ref of evidence.outcome.refs) {
      const currentHash = input.adrContentHashes.get(ref.id)
      if (!currentHash) {
        issues.push(
          issue(
            config,
            'decision-ref-not-accepted',
            `Referenced ADR is not accepted or missing: ${ref.id}`,
          ),
        )
        continue
      }
      if (ref.contentHash !== currentHash) {
        issues.push(
          issue(
            config,
            'decision-ref-stale',
            `Referenced ADR content hash mismatch: ${ref.id}`,
          ),
        )
      }
    }
  }

  issues.push(...reviewedProposalIssues(input, evidence))

  return issues
}
