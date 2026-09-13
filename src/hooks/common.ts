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
  return 'ADR governance is active. Record architectural decisions in ADR/CONTEXT when the three criteria apply.'
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
    'Three criteria (all required for a new ADR):',
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
    'Before finishing, update ADR/CONTEXT or explicitly record a no-ADR reason via turn-close when no ADR is required.',
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
  'ADR audit: this turn may have architectural impact but no ADR/CONTEXT update or no-ADR reason was recorded. Read `.agents/skills/managing-adrs/SKILL.md` and either document the decision or record a reason code.'

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
