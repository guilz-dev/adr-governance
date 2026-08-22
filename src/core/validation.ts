import type { AdrConfig, ParsedAdr } from './types.js'
import { formatAdrId } from './numbering.js'
import {
  hasOpenPoints,
  parseFrontmatter,
  extractTitle,
  serializeFrontmatter,
} from './lifecycle.js'
import { parseAdrFilename } from './numbering.js'

export type ValidationIssue = {
  severity: 'error' | 'warning'
  code: string
  message: string
  path?: string
}

export function validateAdrFile(
  relativePath: string,
  content: string,
  config: AdrConfig,
  directory: 'accepted' | 'proposed',
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const filename = relativePath.split('/').pop() ?? relativePath
  const parsedName = parseAdrFilename(filename)

  if (!parsedName) {
    issues.push({
      severity: 'error',
      code: 'invalid-filename',
      message: `Invalid ADR filename: ${filename}`,
      path: relativePath,
    })
    return issues
  }

  const { frontmatter, body } = parseFrontmatter(content)
  if (!frontmatter) {
    issues.push({
      severity: 'warning',
      code: 'missing-frontmatter',
      message: 'ADR has no frontmatter (legacy mode)',
      path: relativePath,
    })
    return issues
  }

  const openPoints = hasOpenPoints(body)
  const acceptedStatuses = new Set(['accepted', 'superseded', 'deprecated'])
  const proposedStatuses = new Set(['proposed', 'rejected'])

  if (directory === 'accepted' && !acceptedStatuses.has(frontmatter.status)) {
    issues.push({
      severity: 'error',
      code: 'status-path-mismatch',
      message: `Status ${frontmatter.status} must not live in accepted directory`,
      path: relativePath,
    })
  }

  if (directory === 'proposed' && !proposedStatuses.has(frontmatter.status)) {
    issues.push({
      severity: 'error',
      code: 'status-path-mismatch',
      message: `Status ${frontmatter.status} must not live in proposed directory`,
      path: relativePath,
    })
  }

  if (acceptedStatuses.has(frontmatter.status) && openPoints) {
    issues.push({
      severity: 'error',
      code: 'accepted-open-points',
      message: 'Accepted ADR must not contain Open Points',
      path: relativePath,
    })
  }

  if (frontmatter.status === 'superseded' && !frontmatter.superseded_by) {
    issues.push({
      severity: 'error',
      code: 'missing-superseded-by',
      message: 'Superseded ADR must reference superseded_by',
      path: relativePath,
    })
  }

  if (frontmatter.superseded_by && !frontmatter.superseded_by.startsWith('ADR-')) {
    issues.push({
      severity: 'error',
      code: 'invalid-superseded-by',
      message: `Invalid superseded_by reference: ${frontmatter.superseded_by}`,
      path: relativePath,
    })
  }

  return issues
}

export function validateNumberUniqueness(adrs: ParsedAdr[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const byNumber = new Map<number, ParsedAdr[]>()

  for (const adr of adrs) {
    const list = byNumber.get(adr.number) ?? []
    list.push(adr)
    byNumber.set(adr.number, list)
  }

  for (const [number, group] of byNumber) {
    if (group.length > 1) {
      issues.push({
        severity: 'error',
        code: 'duplicate-number',
        message: `Duplicate ADR number ${number}: ${group.map((a) => a.path).join(', ')}`,
      })
    }
  }

  return issues
}

export function validateSupersededReferences(
  adrs: ParsedAdr[],
  config: AdrConfig,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const ids = new Set(adrs.map((a) => formatAdrId(a.number, config.documents.idDigits)))

  for (const adr of adrs) {
    const ref = adr.frontmatter.superseded_by
    if (ref && !ids.has(ref)) {
      issues.push({
        severity: 'error',
        code: 'broken-superseded-ref',
        message: `${formatAdrId(adr.number, config.documents.idDigits)} references missing ${ref}`,
        path: adr.path,
      })
    }
  }

  return issues
}

export function parseAdrFromPath(
  relativePath: string,
  content: string,
  directory: 'accepted' | 'proposed',
  config: AdrConfig,
): ParsedAdr | null {
  const filename = relativePath.split('/').pop() ?? relativePath
  const parsedName = parseAdrFilename(filename)
  if (!parsedName) return null

  const { frontmatter, body } = parseFrontmatter(content)

  if (!frontmatter) {
    const inferredStatus = directory === 'accepted' ? 'accepted' : 'proposed'
    return {
      id: formatAdrId(parsedName.number, config.documents.idDigits),
      number: parsedName.number,
      slug: parsedName.slug,
      path: relativePath,
      directory,
      frontmatter: { status: inferredStatus, date: 'legacy' },
      title: extractTitle(body || content),
      body: body || content,
      hasOpenPoints: hasOpenPoints(body || content),
      legacy: true,
    }
  }

  return {
    id: formatAdrId(parsedName.number, config.documents.idDigits),
    number: parsedName.number,
    slug: parsedName.slug,
    path: relativePath,
    directory,
    frontmatter,
    title: extractTitle(body),
    body,
    hasOpenPoints: hasOpenPoints(body),
  }
}

export function collectValidationIssues(
  adrs: ParsedAdr[],
  config: AdrConfig,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const adr of adrs) {
    issues.push(
      ...validateAdrFile(
        adr.path,
        serializeFrontmatter(adr.frontmatter) + adr.body,
        config,
        adr.directory,
      ),
    )
  }
  issues.push(...validateNumberUniqueness(adrs))
  issues.push(...validateSupersededReferences(adrs, config))
  return issues
}
