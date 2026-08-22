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

export function toClaudeUserPromptSubmit(ctx: HookContext | undefined): Record<string, unknown> {
  if (!ctx?.fullInstruction) return {}
  return {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: ctx.fullInstruction,
    },
  }
}

export function toClaudeStop(followUpMessage?: string): Record<string, unknown> {
  if (!followUpMessage) return {}
  return {
    decision: 'block',
    reason: followUpMessage,
  }
}

export function toCodexUserPromptSubmit(ctx: HookContext | undefined): Record<string, unknown> {
  return toClaudeUserPromptSubmit(ctx)
}

export function toGeminiBeforeAgent(ctx: HookContext | undefined): Record<string, unknown> {
  if (!ctx?.fullInstruction) return { decision: 'allow' }
  return {
    decision: 'allow',
    hookSpecificOutput: {
      additionalContext: ctx.fullInstruction,
    },
  }
}

export function toGeminiAfterAgent(followUpMessage?: string): Record<string, unknown> {
  if (!followUpMessage) return { decision: 'allow' }
  return { decision: 'deny', reason: followUpMessage }
}
