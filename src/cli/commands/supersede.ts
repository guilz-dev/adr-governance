import { readFile } from 'node:fs/promises'
import path from 'node:path'

import type { AdrConfig } from '../../core/types.js'
import { buildAdrContent } from '../../core/lifecycle.js'
import { acquireLock, atomicWriteFile } from '../../core/locks.js'
import { listAdrFiles } from '../../core/repository-state.js'
import { parseAdrFromPath } from '../../core/validation.js'

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
    const oldUpdated = buildAdrContent(
      {
        ...oldParsed.frontmatter,
        status: 'superseded',
        date: today,
        superseded_by: newParsed.id,
      },
      oldParsed.title,
      oldParsed.body,
    )
    const newUpdated = buildAdrContent(
      {
        ...newParsed.frontmatter,
        supersedes: [...new Set([...(newParsed.frontmatter.supersedes ?? []), oldParsed.id])],
      },
      newParsed.title,
      newParsed.body,
    )

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
