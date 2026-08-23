import { createHash, randomUUID } from 'node:crypto'

const PENDING_SCOPE_WARNING =
  '[adr-governance] Hook payload has no conversation_id, session_id, or transcript_path; using a repository-wide pending audit scope. Parallel sessions are not isolated.'

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
  const runtimeId = readNonEmptyString(
    payload.conversation_id ?? payload.conversationId ?? payload.session_id ?? payload.sessionId,
  )
  if (runtimeId) return runtimeId

  const transcriptPath = readNonEmptyString(payload.transcript_path ?? payload.transcriptPath)
  if (!transcriptPath) return undefined

  return `transcript-${createHash('sha256').update(transcriptPath).digest('hex')}`
}

/** Stable conversation key only; never falls back to generation_id. */
export function resolveHookConversationKey(payload: Record<string, unknown>): string | undefined {
  return resolveHookConversationKeyOptional(payload)
}

export function pendingConversationScopeWarning(
  payload: Record<string, unknown>,
): string | undefined {
  return resolveHookConversationKeyOptional(payload) ? undefined : PENDING_SCOPE_WARNING
}

function readNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}
