import { readFile, rm } from 'node:fs/promises'
import path from 'node:path'

import type { AdrConfig } from '../../core/types.js'
import { buildAdrContent, canPromoteToAccepted, parseFrontmatter, updateFrontmatter } from '../../core/lifecycle.js'
import { acquireLock, atomicWriteFile } from '../../core/locks.js'
import { listAdrFiles } from '../../core/repository-state.js'
import { parseAdrFromPath } from '../../core/validation.js'
import { gitMv, movePathInRepo } from '../git.js'
import { appendAuditLog } from '../../core/audit-log.js'
import { promotionRecordPath, type PromotionRecord } from '../../core/promotion-records.js'

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
    const updates = {
      status: 'accepted' as const,
      date: today,
      acceptance: options.approval ?? 'automatic',
    }
    const newContent = parseFrontmatter(content).frontmatter
      ? updateFrontmatter(content, updates)
      : buildAdrContent({ ...parsed.frontmatter, ...updates }, parsed.title, parsed.body)
    const recordPath = path.join(options.repoRoot, promotionRecordPath(parsed.id))
    const previousRecord = await readFile(recordPath, 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    const record: PromotionRecord = {
      schemaVersion: 1,
      adrId: parsed.id,
      proposedPath: rel.replace(/\\/g, '/'),
      proposedContent: content,
      approval: options.approval ?? 'automatic',
    }
    let recordWritten = false
    async function recordPromotion() {
      await atomicWriteFile(recordPath, JSON.stringify(record, null, 2) + '\n')
      recordWritten = true
      if (record.approval === 'human') {
        await appendAuditLog(options.repoRoot, {
          kind: 'promotion', adrId: record.adrId, approval: 'human', method: 'cli',
        })
      }
    }
    async function restoreRecord() {
      if (!recordWritten) return
      if (previousRecord === null) await rm(recordPath, { force: true })
      else await atomicWriteFile(recordPath, previousRecord)
    }

    if (options.config.layout.mode === 'split') {
      const destRel = path.join(options.config.layout.acceptedDir, matchFile)
      const destAbs = path.join(options.repoRoot, destRel)

      let moveKind: 'git' | 'fs'
      try {
        moveKind = await movePathInRepo(options.repoRoot, rel, destRel)
      } catch (error) {
        throw new Error(`Promote failed: ${String(error)}`)
      }

      try {
        await atomicWriteFile(destAbs, newContent)
        await recordPromotion()
      } catch (error) {
        try {
          await atomicWriteFile(destAbs, content)
          if (moveKind === 'git') {
            await gitMv(options.repoRoot, destRel, rel)
          } else {
            await movePathInRepo(options.repoRoot, destRel, rel)
          }
          await restoreRecord()
        } catch {
          throw new Error(
            `Promote failed after move; manual recovery may be required at ${destRel}: ${String(error)}`,
          )
        }
        throw new Error(`Promote failed: ${String(error)}`)
      }
      return destRel
    }

    try {
      await atomicWriteFile(path.join(options.repoRoot, rel), newContent)
      await recordPromotion()
    } catch (error) {
      await atomicWriteFile(path.join(options.repoRoot, rel), content)
      await restoreRecord()
      throw new Error(`Promote failed: ${String(error)}`)
    }
    return rel
  } finally {
    await release()
  }
}
