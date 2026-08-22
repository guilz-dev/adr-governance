import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { AdrConfig, AdrStatus, NoAdrReason } from '../../core/types.js'
import { NO_ADR_REASONS } from '../../core/types.js'
import {
  formatAdrFilename,
  formatAdrId,
  nextAdrNumber,
  parseAdrFilename,
  slugifyTitle,
} from '../../core/numbering.js'
import { buildAdrContent, canPromoteToAccepted } from '../../core/lifecycle.js'
import { acquireLock, atomicWriteFile } from '../../core/locks.js'
import { listAdrFiles } from '../../core/repository-state.js'
import { parseAdrFromPath } from '../../core/validation.js'
import { gitMv } from '../git.js'
import { appendAuditLog } from '../../core/audit-log.js'

export async function runCreate(options: {
  repoRoot: string
  config: AdrConfig
  status: AdrStatus
  title: string
  body: string
}): Promise<string> {
  const release = await acquireLock(options.repoRoot, 'create', 'create')
  try {
    const acceptedDir = path.join(options.repoRoot, options.config.layout.acceptedDir)
    const proposedDir = path.join(options.repoRoot, options.config.layout.proposedDir)

    const numbers: number[] = []
    for (const dir of [acceptedDir, proposedDir]) {
      for (const name of await listAdrFiles(dir)) {
        const parsed = parseAdrFilename(name)
        if (parsed) numbers.push(parsed.number)
      }
    }

    const number = nextAdrNumber(numbers)
    const slug = slugifyTitle(options.title) || 'decision'
    const filename = formatAdrFilename(number, slug, options.config.documents.idDigits)
    const targetDir =
      options.status === 'accepted' ||
      options.status === 'superseded' ||
      options.status === 'deprecated'
        ? options.config.layout.acceptedDir
        : options.config.layout.proposedDir

    if (options.status === 'accepted' && options.body.match(/^##\s+Open Points/im)) {
      throw new Error('Accepted ADR cannot contain Open Points')
    }

    const today = new Date().toISOString().slice(0, 10)
    const content = buildAdrContent(
      {
        status: options.status,
        date: today,
        acceptance: options.status === 'accepted' ? 'automatic' : undefined,
      },
      options.title,
      options.body,
    )

    const relPath = path.join(targetDir, filename)
    const absPath = path.join(options.repoRoot, relPath)
    await atomicWriteFile(absPath, content)
    return relPath
  } finally {
    await release()
  }
}

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

export async function runSupersede(options: {
  repoRoot: string
  config: AdrConfig
  oldAdrId: string
  newAdrId: string
}): Promise<void> {
  const release = await acquireLock(options.repoRoot, 'supersede', 'supersede')
  try {
    const oldNum = /ADR-(\d+)/.exec(options.oldAdrId)?.[1]
    const newNum = /ADR-(\d+)/.exec(options.newAdrId)?.[1]
    if (!oldNum || !newNum) throw new Error('Invalid ADR ids')

    const acceptedDir = path.join(options.repoRoot, options.config.layout.acceptedDir)
    const files = await listAdrFiles(acceptedDir)
    const digits = options.config.documents.idDigits
    const oldFile = files.find((f) => f.startsWith(`${oldNum.padStart(digits, '0')}-`))
    if (!oldFile) throw new Error(`Old ADR not found: ${options.oldAdrId}`)

    const newFile = files.find((f) => f.startsWith(`${newNum.padStart(digits, '0')}-`))
    if (!newFile) throw new Error(`New ADR not found: ${options.newAdrId}`)

    const newRel = path.join(options.config.layout.acceptedDir, newFile)
    const newContent = await readFile(path.join(options.repoRoot, newRel), 'utf8')
    const newParsed = parseAdrFromPath(newRel, newContent, 'accepted', options.config)
    if (!newParsed) throw new Error('Could not parse new ADR')
    if (newParsed.frontmatter.status !== 'accepted') {
      throw new Error(`New ADR must be accepted before superseding: ${options.newAdrId}`)
    }
    const oldId = formatAdrId(Number.parseInt(oldNum, 10), digits)
    if (
      !newContent.includes(oldId) &&
      !newContent.includes(oldFile.replace('.md', '')) &&
      !newContent.toLowerCase().includes(`adr-${oldNum}`)
    ) {
      throw new Error(`New ADR must reference the superseded ADR (${oldId})`)
    }

    const rel = path.join(options.config.layout.acceptedDir, oldFile)
    const content = await readFile(path.join(options.repoRoot, rel), 'utf8')
    const parsed = parseAdrFromPath(rel, content, 'accepted', options.config)
    if (!parsed) throw new Error('Could not parse old ADR')

    const today = new Date().toISOString().slice(0, 10)
    const updated = buildAdrContent(
      {
        status: 'superseded',
        date: today,
        superseded_by: options.newAdrId,
      },
      parsed.title,
      parsed.body,
    )
    await atomicWriteFile(path.join(options.repoRoot, rel), updated)
  } finally {
    await release()
  }
}

export async function runTurnClose(options: {
  repoRoot: string
  outcome: 'docs-updated' | 'no-change'
  reason?: string
}): Promise<void> {
  if (options.outcome === 'no-change') {
    if (!options.reason) {
      throw new Error('--reason is required when outcome is no-change')
    }
    if (!NO_ADR_REASONS.includes(options.reason as NoAdrReason)) {
      throw new Error(`Invalid reason code: ${options.reason}`)
    }
  }

  const { mkdir, writeFile, readdir } = await import('node:fs/promises')
  const stateDir = path.join(options.repoRoot, '.adr-governance/state/turns')
  await mkdir(stateDir, { recursive: true })

  const receipt = {
    outcome: options.outcome,
    reason: options.reason,
    timestamp: new Date().toISOString(),
  }

  const files = await readdir(stateDir).catch(() => [] as string[])
  const latest = files.filter((f) => f.endsWith('.json')).sort().at(-1)
  if (latest) {
    const raw = JSON.parse(await readFile(path.join(stateDir, latest), 'utf8')) as {
      receipt?: unknown
    }
    raw.receipt = receipt
    await writeFile(path.join(stateDir, latest), JSON.stringify(raw, null, 2))
  } else {
    await writeFile(
      path.join(stateDir, `receipt-${Date.now()}.json`),
      JSON.stringify({ receipt }, null, 2),
    )
  }
}
