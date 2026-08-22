import { readFile } from 'node:fs/promises'
import path from 'node:path'

import type { AdrConfig } from '../../core/types.js'
import { formatAdrId } from '../../core/numbering.js'
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
