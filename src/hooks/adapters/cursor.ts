import type { HookContext } from '../common.js'

export type CursorSessionStartOutput = {
  continue: boolean
  additional_context?: string
}

export type CursorBeforeSubmitOutput = {
  continue: boolean
}

export type CursorStopOutput = {
  followup_message?: string
}

export function toCursorSessionStart(ctx: HookContext | undefined): CursorSessionStartOutput {
  return {
    continue: true,
    additional_context: ctx?.standingReminder,
  }
}

export function toCursorBeforeSubmit(): CursorBeforeSubmitOutput {
  return { continue: true }
}

export function toCursorStop(followUpMessage?: string): CursorStopOutput {
  if (!followUpMessage) return {}
  return { followup_message: followUpMessage }
}

export function toClaudeUserPromptSubmit(ctx: HookContext | undefined): {
  continue: boolean
  additionalContext?: string
} {
  if (!ctx) return { continue: true }
  return {
    continue: true,
    additionalContext: ctx.fullInstruction,
  }
}

export function toClaudeStop(followUpMessage?: string): {
  continue: boolean
  stopReason?: string
} {
  if (!followUpMessage) return { continue: true }
  return { continue: false, stopReason: followUpMessage }
}

export function toCodexUserPromptSubmit(ctx: HookContext | undefined): {
  continue: boolean
  additionalContext?: string
} {
  return toClaudeUserPromptSubmit(ctx)
}

export function toGeminiBeforeAgent(ctx: HookContext | undefined): {
  decision: 'allow'
  additionalContext?: string
} {
  return {
    decision: 'allow',
    additionalContext: ctx?.fullInstruction,
  }
}

export function toGeminiAfterAgent(followUpMessage?: string): {
  decision: 'allow' | 'deny'
  reason?: string
} {
  if (!followUpMessage) return { decision: 'allow' }
  return { decision: 'deny', reason: followUpMessage }
}
