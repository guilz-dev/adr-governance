import type { AdrConfig, RiskLevel, TurnState } from '../core/types.js'

export type HookContext = {
  risk: RiskLevel
  signals: string[]
  relevantAdrPaths: string[]
  config: AdrConfig
  standingReminder: string
  fullInstruction: string
}

export function buildStandingReminder(): string {
  return 'ADR governance is active. Consult existing ADRs and CONTEXT when design decisions arise. Do not create or edit ADR/CONTEXT without explicit user instruction; you may ask the user before writing.'
}

function receiptInstruction(sessionId: string): string {
  // POSIX shell quoting keeps runtime IDs literal, including quotes and substitutions.
  const quoted = "'" + sessionId.replace(/'/g, "'\"'\"'") + "'"
  return [
    'Record the actual outcome with turn-close; add --outcome docs-updated, or --outcome no-change --reason <reason-code> to:',
    `node .adr-governance/bin/cli.mjs turn-close --session-id ${quoted}`,
  ].join('\n')
}

export function buildFullInstruction(config: AdrConfig, relevantAdrPaths: string[], sessionId?: string): string {
  const paths =
    relevantAdrPaths.length > 0
      ? relevantAdrPaths.map((p) => `- ${p}`).join('\n')
      : '- (none matched)'
  return [
    'ADR governance: possible or likely architectural impact detected.',
    'Read `.agents/skills/managing-adrs/SKILL.md` completely and follow it.',
    '',
    'Three criteria (human judgment basis for whether a new ADR may be warranted — not an automatic trigger to create one):',
    '1. Hard to reverse',
    '2. Surprising without context',
    '3. Real trade-off',
    '',
    `Context file: ${config.layout.contextFile}`,
    `Accepted ADRs: ${config.layout.acceptedDir}`,
    `Proposed ADRs: ${config.layout.proposedDir}`,
    '',
    'Relevant ADRs:',
    paths,
    '',
    'Even when all three criteria match, confirm with the user before writing ADR/CONTEXT.',
    'For PR evidence when no new ADR is needed, use attest --no-adr; do not add a new ADR solely to satisfy CI.',
    'turn-close records a no-ADR receipt when no new ADR is required; it is not a substitute for ADR authoring.',
    'The after-turn hook may request one audit follow-up but never records a no-ADR reason on your behalf.',
    ...(sessionId ? ['', receiptInstruction(sessionId)] : []),
  ].join('\n')
}

export function buildHookContext(
  config: AdrConfig,
  risk: RiskLevel,
  signals: string[],
  relevantAdrPaths: string[],
  degradationReason?: 'untracked-count' | 'untracked-size' | 'git-unavailable',
  sessionId?: string,
): HookContext {
  const standingReminder = buildStandingReminder()
  let fullInstruction =
    risk === 'none'
      ? standingReminder + (sessionId ? `\n\n${receiptInstruction(sessionId)}` : '')
      : buildFullInstruction(config, relevantAdrPaths, sessionId)

  if (degradationReason) {
    const label = degradationReason === 'git-unavailable' ? 'unavailable' : degradationReason
    fullInstruction += `\n\nRepository change detection is using metadata fallback (${label}).\nThe CI decision gate remains authoritative.`
  }

  return {
    risk,
    signals,
    relevantAdrPaths,
    config,
    standingReminder,
    fullInstruction,
  }
}

export type AfterTurnDecision = {
  allowFinish: boolean
  followUpMessage?: string
  warning?: string
}

export const AUDIT_FOLLOWUP_MESSAGE =
  'ADR audit: this turn may have architectural impact but no ADR/CONTEXT update or no-ADR reason was recorded. Read `.agents/skills/managing-adrs/SKILL.md`, confirm compliance with existing ADRs or record a no-ADR reason via turn-close. Do not author ADR/CONTEXT without explicit user intent.'

export function isAuditFollowUpPrompt(prompt: string): boolean {
  const trimmed = prompt.trim()
  return trimmed === AUDIT_FOLLOWUP_MESSAGE ||
    trimmed.startsWith(`${AUDIT_FOLLOWUP_MESSAGE}\n\nRecord the actual outcome with turn-close;`)
}

export function decideAfterTurn(
  state: TurnState,
  docsUpdated: boolean,
  config: AdrConfig,
  conversationFollowUpCount = 0,
  repositoryChanged = false,
): AfterTurnDecision {
  if (docsUpdated || state.receipt !== null) {
    return { allowFinish: true }
  }

  const effectiveFollowUpCount = Math.max(state.followUpCount, conversationFollowUpCount)
  const auditEnabled =
    config.hooks.afterTurnAudit &&
    effectiveFollowUpCount < config.hooks.maxFollowUps

  if (state.isAuditFollowUp) {
    if (auditEnabled) {
      return {
        allowFinish: false,
        followUpMessage: `${AUDIT_FOLLOWUP_MESSAGE}\n\n${receiptInstruction(state.sessionId)}`,
      }
    }
    return {
      allowFinish: true,
      warning: 'ADR evaluation unresolved; CI decision gate remains authoritative',
    }
  }

  if (state.risk === 'none' && !repositoryChanged) {
    return { allowFinish: true }
  }

  if (repositoryChanged || state.risk === 'likely') {
    if (auditEnabled) {
      return {
        allowFinish: false,
        followUpMessage: `${AUDIT_FOLLOWUP_MESSAGE}\n\n${receiptInstruction(state.sessionId)}`,
      }
    }
    return {
      allowFinish: true,
      warning: 'ADR evaluation unresolved; CI decision gate remains authoritative',
    }
  }

  return { allowFinish: true }
}
