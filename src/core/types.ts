export type AdrStatus =
  | 'proposed'
  | 'accepted'
  | 'rejected'
  | 'superseded'
  | 'deprecated'

export type Acceptance = 'automatic' | 'human'

export type RiskLevel = 'none' | 'possible' | 'likely'

export type NoAdrReason =
  | 'no-decision'
  | 'reversible'
  | 'obvious'
  | 'no-tradeoff'
  | 'implementation-detail'
  | 'already-recorded'

export type LayoutMode = 'split' | 'single'

export type ChangeGateConfig = {
  mode: 'off' | 'warn' | 'enforce'
  exemptPaths: string[]
  requireNoAdrRationale: boolean
}

export type AdrConfig = {
  $schema?: string
  version: number
  layout: {
    mode: LayoutMode
    acceptedDir: string
    proposedDir: string
    contextFile: string
    contextMapFile: string
  }
  promotion: {
    requireHumanAcceptance: boolean
  }
  documents: {
    language: 'ja' | 'en'
    idDigits: number
    allowAcceptedClarifications: boolean
    legacyFrontmatter?: boolean
  }
  hooks: {
    enabled: boolean
    afterTurnAudit: boolean
    maxFollowUps: number
  }
  changeGate: ChangeGateConfig
  analysis: {
    maxFiles: number
    maxBytesPerFile: number
    exclude: string[]
  }
}

export type EvidenceBundle = {
  schemaVersion: 1
  repository: {
    rootHash: string
    headSha: string | null
    trackedFileCount: number
  }
  existingLayout: {
    acceptedDirs: string[]
    proposedDirs: string[]
    contextFiles: string[]
    agentConfigFiles: string[]
  }
  manifests: Array<{
    path: string
    kind: 'package' | 'workspace' | 'build' | 'deploy' | 'ci' | 'infra'
    headingsOrKeys: string[]
  }>
  candidateEvidence: Array<{
    category: 'term' | 'boundary' | 'technology' | 'integration' | 'constraint'
    path: string
    line: number | null
    excerptHash: string
    summary: string
  }>
  warnings: string[]
}

export type JsoncEdit = {
  path: (string | number)[]
  value: unknown
}

export type InitPlanOperation =
  | {
      kind: 'create'
      path: string
      content: string
    }
  | {
      kind: 'replace-generated'
      path: string
      expectedCurrentHash: string | null
      content: string
    }
  | {
      kind: 'merge-jsonc'
      path: string
      expectedCurrentHash: string | null
      edits: JsoncEdit[]
    }

export type InitPlanPostApplyStep = 'write-manifest'

export type InitPlan = {
  schemaVersion: 1
  planId: string
  repositoryRootHash: string
  sourceHeadSha: string | null
  createdAt: string
  detectedLayout: 'none' | 'split' | 'single' | 'custom'
  proposedConfig: AdrConfig
  operations: InitPlanOperation[]
  postApplySteps: InitPlanPostApplyStep[]
  evidenceReferences: Array<{
    operationIndex: number
    sourcePaths: string[]
    rationale: string
  }>
  reviewQuestions?: string[]
}

export type RepositoryFingerprint = {
  paths: string[]
  gitStatusHash: string
  watchGitStatusHash: string
  overflowWatchHash: string
  contentHashes: Record<string, string>
}

export type TurnReceipt = {
  outcome: 'docs-updated' | 'no-change'
  reason?: NoAdrReason
  timestamp: string
}

export type TurnState = {
  schemaVersion: 1
  sessionId: string
  turnId: string
  conversationId?: string
  isAuditFollowUp?: boolean
  promptHash: string
  risk: RiskLevel
  signals: string[]
  beforeFingerprint: RepositoryFingerprint
  relevantAdrPaths: string[]
  followUpCount: number
  receipt: TurnReceipt | null
  createdAt: string
}

export type AdrFrontmatter = {
  status: AdrStatus
  date: string
  acceptance?: Acceptance
  superseded_by?: string
  supersedes?: string[]
}

export type ParsedAdr = {
  id: string
  number: number
  slug: string
  path: string
  directory: 'accepted' | 'proposed'
  frontmatter: AdrFrontmatter
  title: string
  body: string
  hasOpenPoints: boolean
  legacy?: boolean
}

export const NO_ADR_REASONS: readonly NoAdrReason[] = [
  'no-decision',
  'reversible',
  'obvious',
  'no-tradeoff',
  'implementation-detail',
  'already-recorded',
] as const

export const SUPPORTED_CONFIG_VERSION = 2
export const SUPPORTED_CONFIG_VERSIONS = [1, 2] as const
