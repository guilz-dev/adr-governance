import type { AdrConfig } from './types.js'
import { SUPPORTED_CONFIG_VERSION } from './types.js'

export function defaultConfig(overrides: Partial<AdrConfig> = {}): AdrConfig {
  const base: AdrConfig = {
    $schema: '.adr-governance/schema/adr-config.schema.json',
    version: SUPPORTED_CONFIG_VERSION,
    layout: {
      mode: 'split',
      acceptedDir: 'docs/adr',
      proposedDir: 'docs/proposed-adr',
      contextFile: 'CONTEXT.md',
      contextMapFile: 'CONTEXT-MAP.md',
    },
    promotion: {
      requireHumanAcceptance: false,
    },
    documents: {
      language: 'ja',
      idDigits: 4,
      allowAcceptedClarifications: true,
    },
    hooks: {
      enabled: true,
      afterTurnAudit: true,
      maxFollowUps: 1,
    },
    analysis: {
      maxFiles: 2000,
      maxBytesPerFile: 262_144,
      exclude: [
        '.git/**',
        'node_modules/**',
        'vendor/**',
        'dist/**',
        'build/**',
        '**/.env*',
        '**/*secret*',
        '**/*credential*',
      ],
    },
  }

  return {
    ...base,
    ...overrides,
    layout: { ...base.layout, ...overrides.layout },
    promotion: { ...base.promotion, ...overrides.promotion },
    documents: { ...base.documents, ...overrides.documents },
    hooks: { ...base.hooks, ...overrides.hooks },
    analysis: { ...base.analysis, ...overrides.analysis },
  }
}

export function parseConfig(raw: unknown): { config: AdrConfig; warnings: string[] } {
  const warnings: string[] = []
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('adr.config.json must be a JSON object')
  }

  const obj = raw as Record<string, unknown>
  const knownKeys = new Set([
    '$schema',
    'version',
    'layout',
    'promotion',
    'documents',
    'hooks',
    'analysis',
  ])

  for (const key of Object.keys(obj)) {
    if (!knownKeys.has(key)) {
      warnings.push(`Unknown config key: ${key}`)
    }
  }

  const version = obj.version
  if (version !== SUPPORTED_CONFIG_VERSION) {
    throw new Error(`Unsupported config version: ${String(version)}`)
  }

  const config = defaultConfig()
  if (obj.$schema !== undefined) {
    config.$schema = String(obj.$schema)
  }

  const layout = obj.layout
  if (layout && typeof layout === 'object') {
    const l = layout as Record<string, unknown>
    if (l.mode === 'split' || l.mode === 'single') config.layout.mode = l.mode
    if (typeof l.acceptedDir === 'string') config.layout.acceptedDir = l.acceptedDir
    if (typeof l.proposedDir === 'string') config.layout.proposedDir = l.proposedDir
    if (typeof l.contextFile === 'string') config.layout.contextFile = l.contextFile
    if (typeof l.contextMapFile === 'string') config.layout.contextMapFile = l.contextMapFile
  }

  const promotion = obj.promotion
  if (promotion && typeof promotion === 'object') {
    const p = promotion as Record<string, unknown>
    if (typeof p.requireHumanAcceptance === 'boolean') {
      config.promotion.requireHumanAcceptance = p.requireHumanAcceptance
    }
  }

  const documents = obj.documents
  if (documents && typeof documents === 'object') {
    const d = documents as Record<string, unknown>
    if (d.language === 'ja' || d.language === 'en') config.documents.language = d.language
    if (typeof d.idDigits === 'number') config.documents.idDigits = d.idDigits
    if (typeof d.allowAcceptedClarifications === 'boolean') {
      config.documents.allowAcceptedClarifications = d.allowAcceptedClarifications
    }
  }

  const hooks = obj.hooks
  if (hooks && typeof hooks === 'object') {
    const h = hooks as Record<string, unknown>
    if (typeof h.enabled === 'boolean') config.hooks.enabled = h.enabled
    if (typeof h.afterTurnAudit === 'boolean') config.hooks.afterTurnAudit = h.afterTurnAudit
    if (typeof h.maxFollowUps === 'number') config.hooks.maxFollowUps = h.maxFollowUps
  }

  const analysis = obj.analysis
  if (analysis && typeof analysis === 'object') {
    const a = analysis as Record<string, unknown>
    if (typeof a.maxFiles === 'number') config.analysis.maxFiles = a.maxFiles
    if (typeof a.maxBytesPerFile === 'number') config.analysis.maxBytesPerFile = a.maxBytesPerFile
    if (Array.isArray(a.exclude)) {
      config.analysis.exclude = a.exclude.filter((x): x is string => typeof x === 'string')
    }
  }

  return { config, warnings }
}

export function configForSingleDir(dir: string): AdrConfig {
  return defaultConfig({
    layout: {
      mode: 'single',
      acceptedDir: dir,
      proposedDir: dir,
      contextFile: 'CONTEXT.md',
      contextMapFile: 'CONTEXT-MAP.md',
    },
  })
}
