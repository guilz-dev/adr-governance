import type { AdrFrontmatter, AdrStatus, ParsedAdr } from './types.js'

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/
const TITLE_RE = /^#\s+(.+)$/m
const OPEN_POINTS_RE = /^##\s+Open Points\b/im

export function parseFrontmatter(content: string): {
  frontmatter: AdrFrontmatter | null
  body: string
} {
  const match = FRONTMATTER_RE.exec(content)
  if (!match) {
    return { frontmatter: null, body: content }
  }

  const yaml = match[1] ?? ''
  const body = match[2] ?? ''
  const fields: Record<string, string> = {}

  for (const line of yaml.split('\n')) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    const value = line.slice(idx + 1).trim()
    fields[key] = value
  }

  const status = fields.status as AdrStatus | undefined
  const date = fields.date
  if (!status || !date) {
    return { frontmatter: null, body: content }
  }

  const frontmatter: AdrFrontmatter = { status, date }
  if (fields.acceptance === 'automatic' || fields.acceptance === 'human') {
    frontmatter.acceptance = fields.acceptance
  }
  if (fields.superseded_by) {
    frontmatter.superseded_by = fields.superseded_by
  }

  return { frontmatter, body }
}

export function serializeFrontmatter(fm: AdrFrontmatter): string {
  const lines = ['---', `status: ${fm.status}`, `date: ${fm.date}`]
  if (fm.acceptance) lines.push(`acceptance: ${fm.acceptance}`)
  if (fm.superseded_by) lines.push(`superseded_by: ${fm.superseded_by}`)
  lines.push('---', '')
  return lines.join('\n')
}

export function extractTitle(body: string): string {
  const match = TITLE_RE.exec(body)
  return match?.[1]?.trim() ?? 'Untitled ADR'
}

export function hasOpenPoints(body: string): boolean {
  return OPEN_POINTS_RE.test(body)
}

export function statusDirectory(
  status: AdrStatus,
  layout: { mode: 'split' | 'single'; acceptedDir: string; proposedDir: string },
): string {
  if (layout.mode === 'single') {
    return layout.acceptedDir
  }
  switch (status) {
    case 'accepted':
    case 'superseded':
    case 'deprecated':
      return layout.acceptedDir
    case 'proposed':
    case 'rejected':
      return layout.proposedDir
  }
}

export function canPromoteToAccepted(adr: ParsedAdr, requireHumanAcceptance: boolean, approval?: 'automatic' | 'human'): {
  ok: boolean
  reason?: string
} {
  if (adr.hasOpenPoints) {
    return { ok: false, reason: 'Open Points must be resolved before acceptance' }
  }
  if (adr.frontmatter.status !== 'proposed') {
    return { ok: false, reason: `Cannot promote ADR with status ${adr.frontmatter.status}` }
  }
  if (requireHumanAcceptance && approval !== 'human') {
    return { ok: false, reason: 'Human approval required by config' }
  }
  return { ok: true }
}

export function shouldSupersede(oldDecisionChanged: boolean): boolean {
  return oldDecisionChanged
}

export function buildAdrContent(
  frontmatter: AdrFrontmatter,
  title: string,
  body: string,
): string {
  const normalizedBody = body.startsWith('#') ? body : `# ${title}\n\n${body}`
  return serializeFrontmatter(frontmatter) + normalizedBody.replace(/^\n+/, '')
}
