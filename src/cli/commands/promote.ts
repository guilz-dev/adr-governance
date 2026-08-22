import { readFile } from 'node:fs/promises'
import path from 'node:path'

import type { AdrConfig } from '../../core/types.js'
import { buildAdrContent, canPromoteToAccepted } from '../../core/lifecycle.js'
import { acquireLock, atomicWriteFile } from '../../core/locks.js'
import { listAdrFiles } from '../../core/repository-state.js'
import { parseAdrFromPath } from '../../core/validation.js'
import { gitMv } from '../git.js'
import { appendAuditLog } from '../../core/audit-log.js'

export async function runPromote(options: {
  repoRoot: string
  config: AdrConfig
  adrId: string
  approval?: 'automatic' | 'human'
}): Promise<string> {
  const release = await acquireLock(options.repoRoot, 'promote', 'promote')
  try {
    const numMatch = /ADR-(\d+)/.exec(options.adrId)
    if (!numMatch) throw new Error(`Invalid ADR id: ${options.adrId}`)

    const proposedDir = path.join(options.repoRoot, options.config.layout.proposedDir)
    const files = await listAdrFiles(proposedDir)
    const digits = options.config.documents.idDigits
    const padded = numMatch[1]?.padStart(digits, '0')
    const matchFile = files.find((f) => f.startsWith(`${padded}-`))
    if (!matchFile) throw new Error(`Proposed ADR not found: ${options.adrId}`)

    const rel = path.join(options.config.layout.proposedDir, matchFile)
    const content = await readFile(path.join(options.repoRoot, rel), 'utf8')
    const parsed = parseAdrFromPath(rel, content, 'proposed', options.config)
    if (!parsed) throw new Error('Could not parse ADR')

    const check = canPromoteToAccepted(
      parsed,
      options.config.promotion.requireHumanAcceptance,
      options.approval ?? 'automatic',
    )
    if (!check.ok) throw new Error(check.reason ?? 'Cannot promote')

    const today = new Date().toISOString().slice(0, 10)
    const newContent = buildAdrContent(
      {
        status: 'accepted',
        date: today,
        acceptance: options.approval ?? 'automatic',
      },
      parsed.title,
      parsed.body,
    )

    if (options.config.layout.mode === 'split') {
      const destRel = path.join(options.config.layout.acceptedDir, matchFile)
      const destAbs = path.join(options.repoRoot, destRel)

      try {
        await gitMv(options.repoRoot, rel, destRel)
      } catch (error) {
        throw new Error(`Promote failed: ${String(error)}`)
      }

      try {
        await atomicWriteFile(destAbs, newContent)
        if ((options.approval ?? 'automatic') === 'human') {
          await appendAuditLog(options.repoRoot, {
            kind: 'promotion',
            adrId: options.adrId,
            approval: 'human',
            method: 'cli',
          })
        }
      } catch (error) {
        try {
          await gitMv(options.repoRoot, destRel, rel)
        } catch {
          throw new Error(
            `Promote failed after git mv; manual recovery may be required at ${destRel}: ${String(error)}`,
          )
        }
        throw new Error(`Promote failed: ${String(error)}`)
      }
      return destRel
    }

    await atomicWriteFile(path.join(options.repoRoot, rel), newContent)
    return rel
  } finally {
    await release()
  }
}
