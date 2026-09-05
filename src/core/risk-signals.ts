import type { AdrConfig, ParsedAdr, RepositoryFingerprint, RiskLevel } from './types.js'
import { hasOverflowWatchHash, hasWatchGitStatusHash } from './fingerprint-normalize.js'
import { sha256 } from './numbering.js'

const HIGH_SIGNAL_TERMS_EN = [
  'architecture',
  'boundary',
  'database',
  'storage',
  'migration',
  'auth',
  'permission',
  'api contract',
  'event',
  'queue',
  'provider',
  'deployment',
  'infrastructure',
  'dependency',
  'monorepo',
  'deprecation',
  'delete policy',
  'adr',
  'context',
  'design decision',
  'trade-off',
  'supersede',
]

const HIGH_SIGNAL_TERMS_JA = [
  'アーキテクチャ',
  '境界',
  'データベース',
  'マイグレーション',
  '認証',
  '権限',
  'API契約',
  'イベント',
  'キュー',
  'プロバイダ',
  'デプロイ',
  'インフラ',
  '依存',
  'モノレポ',
  '非推奨',
  '削除ポリシー',
  '設計判断',
  'トレードオフ',
]

const ENGLISH_TERM_ALIASES: Record<string, string[]> = {
  auth: ['auth', 'authentication', 'authorization'],
  adr: ['adr', 'adrs'],
  api: ['api'],
}

const DEFAULT_WATCH_PATH_PATTERNS: RegExp[] = [
  /package\.json$/i,
  /pnpm-workspace\.yaml$/i,
  /package-lock\.json$/i,
  /pnpm-lock\.yaml$/i,
  /pyproject\.toml$/i,
  /poetry\.lock$/i,
  /requirements\.txt$/i,
  /go\.mod$/i,
  /go\.sum$/i,
  /Cargo\.toml$/i,
  /Cargo\.lock$/i,
  /pom\.xml$/i,
  /build\.gradle(\.kts)?$/i,
  /Gemfile(\.lock)?$/i,
  /composer\.json$/i,
  /Dockerfile$/i,
  /docker-compose\.ya?ml$/i,
  /openapi\.ya?ml$/i,
  /schema\.ts$/i,
  /migrations?\//i,
  /drizzle\//i,
  /alembic\//i,
  /routes?\//i,
  /\.github\/workflows\//i,
  /wrangler\.toml$/i,
  /terraform/i,
  /infra\//i,
  /auth/i,
  /permission/i,
  /policy/i,
]

const LIKELY_RISK_THRESHOLD = 3

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isJapaneseTerm(term: string): boolean {
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(term)
}

function watchPathPatternFromConfig(entry: string): RegExp {
  const trimmed = entry.trim()
  if (!trimmed) return /$/
  if (trimmed.startsWith('^') || trimmed.includes('(') || trimmed.includes('[')) {
    return new RegExp(trimmed, 'i')
  }
  if (trimmed.endsWith('/')) {
    const escaped = escapeRegex(trimmed)
    return new RegExp(escaped, 'i')
  }
  const globbed = escapeRegex(trimmed).replace(/\\\*/g, '.*')
  return new RegExp(`${globbed}$`, 'i')
}

export function resolveHighSignalTerms(config: AdrConfig): string[] {
  const base =
    config.riskSignals?.highSignalTerms ??
    [...HIGH_SIGNAL_TERMS_EN, ...HIGH_SIGNAL_TERMS_JA]
  const additional = config.riskSignals?.additionalTerms ?? []
  return [...base, ...additional]
}

export function resolveWatchPathPatterns(config?: AdrConfig): RegExp[] {
  const patterns = [...DEFAULT_WATCH_PATH_PATTERNS]
  for (const entry of config?.riskSignals?.watchPaths ?? []) {
    patterns.push(watchPathPatternFromConfig(entry))
  }
  return patterns
}

function matchesEnglishTerm(normalized: string, term: string): boolean {
  const lower = term.toLowerCase()
  if (lower.includes(' ')) {
    return normalized.includes(lower)
  }

  const aliases = ENGLISH_TERM_ALIASES[lower] ?? [lower]
  return aliases.some((alias) => {
    const re = new RegExp(`\\b${escapeRegex(alias)}\\b`)
    return re.test(normalized)
  })
}

function matchesTerm(normalized: string, term: string): boolean {
  if (isJapaneseTerm(term)) {
    return normalized.includes(term.toLowerCase())
  }
  return matchesEnglishTerm(normalized, term)
}

export function assessPromptRisk(
  prompt: string,
  config: AdrConfig,
): { risk: RiskLevel; signals: string[] } {
  const normalized = prompt.toLowerCase()
  const signals: string[] = []

  for (const term of resolveHighSignalTerms(config)) {
    if (matchesTerm(normalized, term)) {
      signals.push(`term:${term}`)
    }
  }

  if (signals.length >= LIKELY_RISK_THRESHOLD) return { risk: 'likely', signals }
  if (signals.length >= 1) return { risk: 'possible', signals }
  return { risk: 'none', signals }
}

export function isWatchPath(relativePath: string, config?: AdrConfig): boolean {
  return resolveWatchPathPatterns(config).some((re) => re.test(relativePath))
}

export function rankRelevantAdrs(
  prompt: string,
  adrs: ParsedAdr[],
  limit = 5,
): ParsedAdr[] {
  const tokens = prompt
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 2)

  const scored = adrs.map((adr) => {
    const haystack = `${adr.title} ${adr.slug}`.toLowerCase()
    let score = 0
    for (const token of tokens) {
      if (haystack.includes(token)) score += 1
    }
    if (adr.frontmatter.status === 'proposed') score += 0.5
    return { adr, score }
  })

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.adr)
}

export function hashPrompt(prompt: string): string {
  return sha256(prompt)
}

export function watchPathsChanged(
  before: RepositoryFingerprint,
  after: RepositoryFingerprint,
  config?: AdrConfig,
): boolean {
  if (
    hasWatchGitStatusHash(before) &&
    hasWatchGitStatusHash(after) &&
    before.watchGitStatusHash !== after.watchGitStatusHash
  ) {
    return true
  }
  if (
    hasOverflowWatchHash(before) &&
    hasOverflowWatchHash(after) &&
    before.overflowWatchHash !== after.overflowWatchHash
  ) {
    return true
  }

  const allPaths = new Set([...before.paths, ...after.paths])
  for (const p of allPaths) {
    if (!isWatchPath(p, config)) continue
    if (before.contentHashes[p] !== after.contentHashes[p]) return true
  }
  return false
}
