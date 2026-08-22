import { appendFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

export async function appendAuditLog(
  repoRoot: string,
  entry: Record<string, unknown>,
): Promise<void> {
  const logDir = path.join(repoRoot, '.adr-governance/state/logs')
  await mkdir(logDir, { recursive: true })
  const line = JSON.stringify({ ...entry, timestamp: new Date().toISOString() }) + '\n'
  await appendFile(path.join(logDir, 'audit.ndjson'), line, 'utf8')
}

export async function appendHookLog(
  repoRoot: string,
  level: 'info' | 'warning' | 'error',
  message: string,
  meta: Record<string, unknown> = {},
): Promise<void> {
  await appendAuditLog(repoRoot, { kind: 'hook-log', level, message, ...meta })
}
