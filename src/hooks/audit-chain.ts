import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { sanitizeSessionId } from './turn-pointer.js'

export const AUDIT_CHAIN_DIR = '.adr-governance/state/audit-chain'

/** Used when the runtime omits a stable conversation/session id. */
export const PENDING_AUDIT_CONVERSATION_ID = '__pending__'

export type AuditChainState = {
  schemaVersion: 1
  conversationId: string
  followUpCount: number
  updatedAt: string
  lastTurnId?: string
  pendingAudit?: boolean
}

export function auditChainScope(conversationId?: string): string {
  const trimmed = conversationId?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : PENDING_AUDIT_CONVERSATION_ID
}

export function auditChainRelPath(conversationId: string): string {
  return path.join(AUDIT_CHAIN_DIR, `${sanitizeSessionId(conversationId)}.json`)
}

export async function loadAuditChain(
  repoRoot: string,
  conversationId: string,
): Promise<AuditChainState | null> {
  try {
    const raw = await readFile(path.join(repoRoot, auditChainRelPath(conversationId)), 'utf8')
    return JSON.parse(raw) as AuditChainState
  } catch {
    return null
  }
}

export async function loadAuditChainForScope(
  repoRoot: string,
  conversationId?: string,
): Promise<AuditChainState | null> {
  return loadAuditChain(repoRoot, auditChainScope(conversationId))
}

export async function writeAuditChain(
  repoRoot: string,
  state: AuditChainState,
): Promise<void> {
  const rel = auditChainRelPath(state.conversationId)
  const abs = path.join(repoRoot, rel)
  await mkdir(path.dirname(abs), { recursive: true })
  await writeFile(abs, JSON.stringify(state, null, 2))
}

export async function clearAuditChain(repoRoot: string, conversationId: string): Promise<void> {
  try {
    await unlink(path.join(repoRoot, auditChainRelPath(conversationId)))
  } catch {
    // missing chain is fine
  }
}

export async function incrementAuditChainFollowUp(
  repoRoot: string,
  conversationId: string,
  turnId: string,
): Promise<AuditChainState> {
  const existing = await loadAuditChain(repoRoot, conversationId)
  const next: AuditChainState = {
    schemaVersion: 1,
    conversationId,
    followUpCount: (existing?.followUpCount ?? 0) + 1,
    updatedAt: new Date().toISOString(),
    lastTurnId: turnId,
    pendingAudit: true,
  }
  await writeAuditChain(repoRoot, next)
  return next
}

export async function incrementAuditChainFollowUpForScope(
  repoRoot: string,
  conversationId: string | undefined,
  turnId: string,
): Promise<AuditChainState> {
  return incrementAuditChainFollowUp(repoRoot, auditChainScope(conversationId), turnId)
}

export async function markAuditChainResolved(
  repoRoot: string,
  conversationId: string,
): Promise<void> {
  await clearAuditChain(repoRoot, conversationId)
}

export async function markAuditChainResolvedForScope(
  repoRoot: string,
  conversationId?: string,
): Promise<void> {
  await clearAuditChain(repoRoot, auditChainScope(conversationId))
}
