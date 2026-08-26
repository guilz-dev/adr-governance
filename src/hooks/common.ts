import type { AdrConfig, NoAdrReason, RiskLevel, TurnState } from '../core/types.js'

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

export function buildFullInstruction(config: AdrConfig, relevantAdrPaths: string[]): string {
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
    'Before finishing the turn, either update ADR/CONTEXT or record a no-ADR reason via turn-close.',
  ].join('\n')
}

export function buildHookContext(
  config: AdrConfig,
  risk: RiskLevel,
  signals: string[],
  relevantAdrPaths: string[],
): HookContext {
  const standingReminder = buildStandingReminder()
  const fullInstruction =
    risk === 'none' ? standingReminder : buildFullInstruction(config, relevantAdrPaths)

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
  /** Hook-recorded no-change receipt when audit follow-up would be poor UX. */
  silentCloseReason?: NoAdrReason
}

export const AUDIT_FOLLOWUP_MESSAGE =
  'ADR audit: this turn may have architectural impact but no ADR/CONTEXT update or no-ADR reason was recorded. Read `.agents/skills/managing-adrs/SKILL.md` and either document the decision or record a reason code.'

export function isAuditFollowUpPrompt(prompt: string): boolean {
  return prompt.trim() === AUDIT_FOLLOWUP_MESSAGE
}

export function decideAfterTurn(
  state: TurnState,
  docsUpdated: boolean,
  config: AdrConfig,
  conversationFollowUpCount = 0,
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
        followUpMessage: AUDIT_FOLLOWUP_MESSAGE,
      }
    }
    return {
      allowFinish: true,
      warning: 'ADR audit skipped after follow-up limit',
      silentCloseReason: 'implementation-detail',
    }
  }

  // Low-risk turns: record receipt in the hook; no user-visible follow-up turn.
  if (state.risk === 'none') {
    return { allowFinish: true, silentCloseReason: 'implementation-detail' }
  }

  if (state.risk === 'possible' || state.risk === 'likely') {
    return { allowFinish: true, silentCloseReason: 'reversible' }
  }

  return { allowFinish: true, silentCloseReason: 'reversible' }
}
