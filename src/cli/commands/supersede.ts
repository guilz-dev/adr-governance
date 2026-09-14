import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { updateFrontmatter } from '../../core/lifecycle.js'
import type { AdrConfig } from '../../core/types.js'
import { acquireLock, atomicWriteFile } from '../../core/locks.js'
import { listAdrFiles, loadAllAdrs } from '../../core/repository-state.js'
import { parseAdrFromPath } from '../../core/validation.js'
import { validateAdrTransitions } from '../../core/adr-transitions.js'

export async function runSupersede(options: {
  repoRoot: string
  config: AdrConfig
  oldAdrId: string
  newAdrId: string
  approval?: 'automatic' | 'human'
}): Promise<void> {
  if (options.approval !== 'human') {
    throw new Error(
      'ADR supersede requires explicit human intent: pass --approval human (AI agents must not supersede ADRs without user instruction).',
    )
  }

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

    const oldRel = path.join(options.config.layout.acceptedDir, oldFile)
    const newRel = path.join(options.config.layout.acceptedDir, newFile)
    const oldPath = path.join(options.repoRoot, oldRel)
    const newPath = path.join(options.repoRoot, newRel)
    const oldContent = await readFile(oldPath, 'utf8')
    const newContent = await readFile(newPath, 'utf8')
    const oldParsed = parseAdrFromPath(oldRel, oldContent, 'accepted', options.config)
    const newParsed = parseAdrFromPath(newRel, newContent, 'accepted', options.config)
    if (!oldParsed) throw new Error('Could not parse old ADR')
    if (!newParsed) throw new Error('Could not parse new ADR')
    if (oldParsed.id === newParsed.id) throw new Error('ADR cannot supersede itself')
    if (oldParsed.frontmatter.status !== 'accepted') {
      throw new Error(`Old ADR must be accepted before superseding: ${options.oldAdrId}`)
    }
    if (newParsed.frontmatter.status !== 'accepted') {
      throw new Error(`New ADR must be accepted before superseding: ${options.newAdrId}`)
    }

    const today = new Date().toISOString().slice(0, 10)
    const oldUpdated = updateFrontmatter(oldContent, {
      status: 'superseded',
      date: today,
      superseded_by: newParsed.id,
    })
    const newUpdated = updateFrontmatter(newContent, {
      supersedes: [...new Set([...(newParsed.frontmatter.supersedes ?? []), oldParsed.id])].join(', '),
    })
    const oldCandidate = parseAdrFromPath(oldRel, oldUpdated, 'accepted', options.config)
    const newCandidate = parseAdrFromPath(newRel, newUpdated, 'accepted', options.config)
    if (!oldCandidate || !newCandidate) throw new Error('Could not parse supersession candidates')

    const currentAdrs = await loadAllAdrs(options.repoRoot, options.config)
    const candidateAdrs = currentAdrs.map((adr) => {
      if (adr.id === oldParsed.id) return oldCandidate
      if (adr.id === newParsed.id) return newCandidate
      return adr
    })
    const candidateIssues = validateAdrTransitions(currentAdrs, candidateAdrs)
      .filter((issue) => issue.severity === 'error')
    if (candidateIssues.length > 0) {
      throw new Error(`Supersession validation failed: ${candidateIssues.map((issue) => issue.message).join('; ')}`)
    }

    let oldWritten = false
    try {
      await atomicWriteFile(oldPath, oldUpdated)
      oldWritten = true
      await atomicWriteFile(newPath, newUpdated)
    } catch (error) {
      if (oldWritten) await atomicWriteFile(oldPath, oldContent)
      throw error
    }
  } finally {
    await release()
  }
}
