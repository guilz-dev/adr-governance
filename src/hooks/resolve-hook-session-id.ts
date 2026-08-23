import { randomUUID } from 'node:crypto'

/** Returns undefined when the runtime did not provide a stable session/generation id. */
export function resolveHookTurnKeyOptional(payload: Record<string, unknown>): string | undefined {
  const generationId = readNonEmptyString(payload.generation_id ?? payload.generationId)
  if (generationId) return generationId

  return readNonEmptyString(
    payload.conversation_id ?? payload.session_id ?? payload.conversationId ?? payload.sessionId,
  )
}

/** Correlate before-turn and after-turn within one agent generation. */
export function resolveHookTurnKey(payload: Record<string, unknown>): string {
  return resolveHookTurnKeyOptional(payload) ?? randomUUID()
}

/** Stable conversation key for audit follow-up limits across generations. */
export function resolveHookConversationKeyOptional(
  payload: Record<string, unknown>,
): string | undefined {
  return readNonEmptyString(
    payload.conversation_id ?? payload.conversationId ?? payload.session_id ?? payload.sessionId,
  )
}

/** Stable conversation key only; never falls back to generation_id. */
export function resolveHookConversationKey(payload: Record<string, unknown>): string | undefined {
  return resolveHookConversationKeyOptional(payload)
}

function readNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}
