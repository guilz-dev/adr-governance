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
}

export const AUDIT_FOLLOWUP_MESSAGE =
  'ADR audit: this turn may have architectural impact but no ADR/CONTEXT update or no-ADR reason was recorded. Read `.agents/skills/managing-adrs/SKILL.md` and either document the decision or record a reason code.'

export function isAuditFollowUpPrompt(prompt: string): boolean {
  return prompt.trim() === AUDIT_FOLLOWUP_MESSAGE
}

export function decideAfterTurn(
  state: TurnState,
  docsUpdated: boolean,
  watchChanged: boolean,
  config: AdrConfig,
  conversationFollowUpCount = 0,
): AfterTurnDecision {
  if (docsUpdated || state.receipt !== null) {
    return { allowFinish: true }
  }

  if (state.risk === 'none' && !watchChanged && !state.isAuditFollowUp) {
    return { allowFinish: true }
  }

  const effectiveFollowUpCount = Math.max(state.followUpCount, conversationFollowUpCount)

  if (effectiveFollowUpCount < config.hooks.maxFollowUps && config.hooks.afterTurnAudit) {
    return {
      allowFinish: false,
      followUpMessage: AUDIT_FOLLOWUP_MESSAGE,
    }
  }

  return {
    allowFinish: true,
    warning: 'ADR audit skipped after follow-up limit',
  }
}
