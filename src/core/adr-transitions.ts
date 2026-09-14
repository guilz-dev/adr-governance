import type { AdrStatus, ParsedAdr } from './types.js'
import type { ValidationIssue } from './validation.js'

const ALLOWED_TRANSITIONS: Record<AdrStatus, ReadonlySet<AdrStatus>> = {
  proposed: new Set(['proposed', 'accepted', 'rejected']),
  accepted: new Set(['accepted', 'superseded', 'deprecated']),
  rejected: new Set(['rejected']),
  superseded: new Set(['superseded']),
  deprecated: new Set(['deprecated']),
}

function byId(adrs: ParsedAdr[]): Map<string, ParsedAdr> {
  return new Map(adrs.map((a) => [a.id, a]))
}

export function validateAuthorityMetadata(
  adr: ParsedAdr,
  isNewOrChanged: boolean,
  requireHumanAcceptance = false,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const { status, acceptance } = adr.frontmatter

  if (status === 'proposed' && acceptance) {
    issues.push({
      severity: 'error',
      code: 'proposed-with-acceptance',
      message: 'Proposed ADR must not include acceptance metadata',
      path: adr.path,
    })
  }

  if (
    isNewOrChanged &&
    status === 'accepted' &&
    !acceptance
  ) {
    issues.push({
      severity: 'error',
      code: 'accepted-without-acceptance',
      message: 'New or changed accepted ADR requires acceptance metadata',
      path: adr.path,
    })
  }

  if (isNewOrChanged && status === 'accepted' && acceptance && requireHumanAcceptance && acceptance !== 'human') {
    issues.push({ severity: 'error', code: 'human-acceptance-required', message: 'Trusted policy requires acceptance: human for new or changed accepted ADRs', path: adr.path })
  }

  return issues
}

export function validateAdrTransitions(
  base: ParsedAdr[],
  head: ParsedAdr[],
  requireHumanAcceptance = false,
  promotedIds: ReadonlySet<string> = new Set(),
): ValidationIssue[] {
  const baseById = byId(base)
  const issues: ValidationIssue[] = []

  for (const headAdr of head) {
    const baseAdr = baseById.get(headAdr.id)
    const contentChanged =
      baseAdr !== undefined &&
      (baseAdr.body !== headAdr.body ||
        JSON.stringify(baseAdr.frontmatter) !== JSON.stringify(headAdr.frontmatter))
    const isNewOrChanged =
      !baseAdr || baseAdr.frontmatter.status !== headAdr.frontmatter.status || contentChanged

    issues.push(...validateAuthorityMetadata(headAdr, isNewOrChanged, requireHumanAcceptance))

    if (!baseAdr) {
      if (headAdr.frontmatter.status === 'accepted' && !promotedIds.has(headAdr.id)) {
        issues.push({
          severity: 'error',
          code: 'direct-accepted-add',
          message: 'New accepted ADR requires a matching promotion record from proposed + promote; commit .adr-governance/promotions/ with the ADR',
          path: headAdr.path,
        })
      }
      continue
    }

    const from = baseAdr.frontmatter.status
    const to = headAdr.frontmatter.status
    const allowed = ALLOWED_TRANSITIONS[from]
    if (!allowed?.has(to)) {
      issues.push({
        severity: 'error',
        code: 'invalid-status-transition',
        message: `Invalid status transition for ${headAdr.id}: ${from} -> ${to}`,
        path: headAdr.path,
      })
    }
  }

  const headById = byId(head)
  for (const adr of head) {
    const supersedes = adr.frontmatter.supersedes ?? []
    for (const targetId of supersedes) {
      const target = headById.get(targetId)
      if (!target) {
        issues.push({
          severity: 'error',
          code: 'invalid-supersession',
          message: `${adr.id} supersedes missing ADR ${targetId}`,
          path: adr.path,
        })
        continue
      }
      if (adr.frontmatter.status !== 'accepted') {
        issues.push({
          severity: 'error',
          code: 'invalid-supersession',
          message: `${adr.id} must be accepted before superseding ${targetId}`,
          path: adr.path,
        })
      }
      if (target.frontmatter.status !== 'superseded') {
        issues.push({
          severity: 'error',
          code: 'invalid-supersession',
          message: `${adr.id} supersedes ${targetId} but target is not superseded`,
          path: adr.path,
        })
      }
      if (target.frontmatter.superseded_by !== adr.id) {
        issues.push({
          severity: 'error',
          code: 'invalid-supersession',
          message: `Supersession is not reciprocal between ${adr.id} and ${targetId}`,
          path: adr.path,
        })
      }
    }

    const supersededBy = adr.frontmatter.superseded_by
    if (!supersededBy) continue

    const replacement = headById.get(supersededBy)
    if (!replacement) {
      issues.push({
        severity: 'error',
        code: 'invalid-supersession',
        message: `${adr.id} is superseded by missing ADR ${supersededBy}`,
        path: adr.path,
      })
      continue
    }
    if (adr.frontmatter.status !== 'superseded') {
      issues.push({
        severity: 'error',
        code: 'invalid-supersession',
        message: `${adr.id} must be superseded before naming ${supersededBy} as its replacement`,
        path: adr.path,
      })
    }
    if (replacement.frontmatter.status !== 'accepted') {
      issues.push({
        severity: 'error',
        code: 'invalid-supersession',
        message: `${adr.id} is superseded by ${supersededBy} but its replacement is not accepted`,
        path: adr.path,
      })
    }
    if (!(replacement.frontmatter.supersedes ?? []).includes(adr.id)) {
      issues.push({
        severity: 'error',
        code: 'invalid-supersession',
        message: `Supersession is not reciprocal between ${adr.id} and ${supersededBy}`,
        path: adr.path,
      })
    }
  }

  return issues
}
