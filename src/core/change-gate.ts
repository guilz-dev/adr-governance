import type { AdrConfig, ParsedAdr } from './types.js'
import type { ValidationIssue } from './validation.js'
import { parseDecisionEvidence, type DecisionEvidence } from './decision-evidence.js'

export type ChangeGateInput = {
  config: AdrConfig
  changedPaths: string[]
  governancePaths: string[]
  changedProposedAdrs: ParsedAdr[]
  adrContentHashes: Map<string, string>
  expectedDecisionCorpusHash: string
  evidence: DecisionEvidence | null
}

const CHANGE_GATE_CODES = new Set([
  'decision-evidence-required',
  'decision-evidence-invalid',
  'decision-baseline-stale',
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

function severityFor(config: AdrConfig, code: string): 'error' | 'warning' {
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

export function evaluateChangeGate(input: ChangeGateInput): ValidationIssue[] {
  const { config } = input
  if (config.changeGate.mode === 'off') return []

  const nonGovernanceChanges = input.changedPaths.filter(
    (p) => !isGovernancePath(p, input.governancePaths) && !isExempt(p, config.changeGate.exemptPaths),
  )

  if (nonGovernanceChanges.length === 0) return []

  if (!input.evidence) {
    return [
      issue(
        config,
        'decision-evidence-required',
        'Non-governance changes require decision evidence',
      ),
    ]
  }

  let evidence: DecisionEvidence
  try {
    evidence = parseDecisionEvidence(input.evidence)
  } catch (e) {
    return [
      issue(
        config,
        'decision-evidence-invalid',
        `Decision evidence failed schema validation: ${String(e)}`,
      ),
    ]
  }

  const issues: ValidationIssue[] = []

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

  const reviewed = new Set(evidence.reviewedProposals.map((p) => p.id))
  for (const proposed of input.changedProposedAdrs) {
    if (!reviewed.has(proposed.id)) {
      issues.push(
        issue(
          config,
          'changed-proposal-unreviewed',
          `Changed proposed ADR requires reviewedProposals declaration: ${proposed.id}`,
          proposed.path,
        ),
      )
    }
  }

  return issues
}
