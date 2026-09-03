import type { ParsedAdr } from './types.js'
import type { ValidationIssue } from './validation.js'

const ALLOWED_TRANSITIONS: Record<string, Set<string>> = {
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
    !adr.legacy &&
    !acceptance
  ) {
    issues.push({
      severity: 'error',
      code: 'accepted-without-acceptance',
      message: 'New or changed accepted ADR requires acceptance metadata',
      path: adr.path,
    })
  }

  return issues
}

export function validateAdrTransitions(
  base: ParsedAdr[],
  head: ParsedAdr[],
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

    issues.push(...validateAuthorityMetadata(headAdr, isNewOrChanged))

    if (!baseAdr) continue

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
      if (target.frontmatter.status !== 'superseded') {
        issues.push({
          severity: 'error',
          code: 'invalid-supersession',
          message: `${adr.id} supersedes ${targetId} but target is not superseded`,
          path: adr.path,
        })
      }
      const reciprocal = target.frontmatter.supersedes ?? []
      if (!reciprocal.includes(adr.id)) {
        issues.push({
          severity: 'error',
          code: 'invalid-supersession',
          message: `Supersession is not reciprocal between ${adr.id} and ${targetId}`,
          path: adr.path,
        })
      }
    }
  }

  return issues
}
