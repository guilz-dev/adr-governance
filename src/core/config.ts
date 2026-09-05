import type { AdrConfig, RiskSignalsConfig } from './types.js'
import { SUPPORTED_CONFIG_VERSION, SUPPORTED_CONFIG_VERSIONS } from './types.js'

function defaultChangeGate(
  overrides: Partial<AdrConfig['changeGate']> = {},
): AdrConfig['changeGate'] {
  return {
    mode: 'enforce',
    exemptPaths: [],
    ...overrides,
  }
}

function parseRiskSignals(raw: unknown): RiskSignalsConfig | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const obj = raw as Record<string, unknown>
  const riskSignals: RiskSignalsConfig = {}

  if (Array.isArray(obj.highSignalTerms)) {
    riskSignals.highSignalTerms = obj.highSignalTerms.filter(
      (x): x is string => typeof x === 'string' && x.trim().length > 0,
    )
  }
  if (Array.isArray(obj.additionalTerms)) {
    riskSignals.additionalTerms = obj.additionalTerms.filter(
      (x): x is string => typeof x === 'string' && x.trim().length > 0,
    )
  }
  if (Array.isArray(obj.watchPaths)) {
    riskSignals.watchPaths = obj.watchPaths.filter(
      (x): x is string => typeof x === 'string' && x.trim().length > 0,
    )
  }

  if (
    riskSignals.highSignalTerms === undefined &&
    riskSignals.additionalTerms === undefined &&
    riskSignals.watchPaths === undefined
  ) {
    return undefined
  }

  return riskSignals
}

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
      legacyFrontmatter: false,
    },
    hooks: {
      enabled: true,
      afterTurnAudit: true,
      maxFollowUps: 1,
      timeoutMs: 1500,
    },
    changeGate: defaultChangeGate(),
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
    changeGate: { ...base.changeGate, ...overrides.changeGate },
    analysis: { ...base.analysis, ...overrides.analysis },
    riskSignals: overrides.riskSignals,
  }
}

function parseChangeGate(raw: unknown, version: number): AdrConfig['changeGate'] {
  const gate = defaultChangeGate(version === 1 ? { mode: 'off' } : {})
  if (!raw || typeof raw !== 'object') return gate
  const obj = raw as Record<string, unknown>
  if (version !== 1 && (obj.mode === 'off' || obj.mode === 'warn' || obj.mode === 'enforce')) {
    gate.mode = obj.mode
  }
  if (Array.isArray(obj.exemptPaths)) {
    gate.exemptPaths = obj.exemptPaths.filter((x): x is string => typeof x === 'string')
  }
  return gate
}

function warnUnknownNestedKeys(
  warnings: string[],
  section: string,
  raw: unknown,
  knownKeys: readonly string[],
): void {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return
  const known = new Set(knownKeys)
  for (const key of Object.keys(raw as Record<string, unknown>)) {
    if (!known.has(key)) warnings.push(`Unknown config key: ${section}.${key}`)
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
    'changeGate',
    'analysis',
    'riskSignals',
  ])

  for (const key of Object.keys(obj)) {
    if (!knownKeys.has(key)) {
      warnings.push(`Unknown config key: ${key}`)
    }
  }

  const version = obj.version
  if (
    typeof version !== 'number' ||
    !(SUPPORTED_CONFIG_VERSIONS as readonly number[]).includes(version)
  ) {
    throw new Error(`Unsupported config version: ${String(version)}`)
  }

  if (version === 1) {
    warnings.push('Config v1 detected; changeGate defaults to off until migration to v2')
  }

  warnUnknownNestedKeys(warnings, 'layout', obj.layout, [
    'mode',
    'acceptedDir',
    'proposedDir',
    'contextFile',
    'contextMapFile',
  ])
  warnUnknownNestedKeys(warnings, 'promotion', obj.promotion, ['requireHumanAcceptance'])
  warnUnknownNestedKeys(warnings, 'documents', obj.documents, [
    'language',
    'idDigits',
    'allowAcceptedClarifications',
    'legacyFrontmatter',
  ])
  warnUnknownNestedKeys(warnings, 'hooks', obj.hooks, [
    'enabled',
    'afterTurnAudit',
    'maxFollowUps',
    'timeoutMs',
  ])
  warnUnknownNestedKeys(warnings, 'changeGate', obj.changeGate, ['mode', 'exemptPaths'])
  warnUnknownNestedKeys(warnings, 'analysis', obj.analysis, [
    'maxFiles',
    'maxBytesPerFile',
    'exclude',
  ])
  warnUnknownNestedKeys(warnings, 'riskSignals', obj.riskSignals, [
    'highSignalTerms',
    'additionalTerms',
    'watchPaths',
  ])

  const config = defaultConfig({ version })
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
    if (typeof d.legacyFrontmatter === 'boolean') {
      config.documents.legacyFrontmatter = d.legacyFrontmatter
    }
  }

  const hooks = obj.hooks
  if (hooks && typeof hooks === 'object') {
    const h = hooks as Record<string, unknown>
    if (typeof h.enabled === 'boolean') config.hooks.enabled = h.enabled
    if (typeof h.afterTurnAudit === 'boolean') config.hooks.afterTurnAudit = h.afterTurnAudit
    if (typeof h.maxFollowUps === 'number') config.hooks.maxFollowUps = h.maxFollowUps
  if (typeof h.timeoutMs === 'number') {
    if (h.timeoutMs < 100 || h.timeoutMs > 1900) {
      throw new Error('hooks.timeoutMs must be between 100 and 1900')
    }
    config.hooks.timeoutMs = h.timeoutMs
  }
  }

  config.changeGate = parseChangeGate(obj.changeGate, version)

  const analysis = obj.analysis
  if (analysis && typeof analysis === 'object') {
    const a = analysis as Record<string, unknown>
    if (typeof a.maxFiles === 'number') config.analysis.maxFiles = a.maxFiles
    if (typeof a.maxBytesPerFile === 'number') config.analysis.maxBytesPerFile = a.maxBytesPerFile
    if (Array.isArray(a.exclude)) {
      config.analysis.exclude = a.exclude.filter((x): x is string => typeof x === 'string')
    }
  }

  config.riskSignals = parseRiskSignals(obj.riskSignals)

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
