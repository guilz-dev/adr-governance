import path from 'node:path'

import type { AdrConfig, AdrStatus } from '../../core/types.js'
import {
  formatAdrFilename,
  nextAdrNumber,
  parseAdrFilename,
  slugifyTitle,
} from '../../core/numbering.js'
import { buildAdrContent } from '../../core/lifecycle.js'
import { acquireLock, atomicWriteFile } from '../../core/locks.js'
import { listAdrFiles } from '../../core/repository-state.js'

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
