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

const WATCH_PATH_PATTERNS = [
  /package\.json$/i,
  /pnpm-workspace\.yaml$/i,
  /package-lock\.json$/i,
  /pnpm-lock\.yaml$/i,
  /schema\.ts$/i,
  /migrations?\//i,
  /drizzle\//i,
  /routes?\//i,
  /\.github\/workflows\//i,
  /wrangler\.toml$/i,
  /terraform/i,
  /infra\//i,
  /auth/i,
  /permission/i,
  /policy/i,
]

export function assessPromptRisk(
  prompt: string,
  config: AdrConfig,
): { risk: RiskLevel; signals: string[] } {
  const normalized = prompt.toLowerCase()
  const signals: string[] = []
  const terms =
    config.documents.language === 'ja'
      ? [...HIGH_SIGNAL_TERMS_EN, ...HIGH_SIGNAL_TERMS_JA]
      : HIGH_SIGNAL_TERMS_EN

  for (const term of terms) {
    if (normalized.includes(term.toLowerCase())) {
      signals.push(`term:${term}`)
    }
  }

  if (signals.length >= 3) return { risk: 'likely', signals }
  if (signals.length >= 1) return { risk: 'possible', signals }
  return { risk: 'none', signals }
}

export function isWatchPath(relativePath: string): boolean {
  return WATCH_PATH_PATTERNS.some((re) => re.test(relativePath))
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
    if (!isWatchPath(p)) continue
    if (before.contentHashes[p] !== after.contentHashes[p]) return true
  }
  return false
}
