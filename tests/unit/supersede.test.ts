import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { runSupersede } from '../../src/cli/commands/supersede.js'
import { defaultConfig } from '../../src/core/config.js'
import { parseFrontmatter } from '../../src/core/lifecycle.js'

async function createSupersessionRepo(newListsOld = false): Promise<{
  repo: string
  oldPath: string
  newPath: string
  oldContent: string
  newContent: string
}> {
  const repo = await mkdtemp(path.join(tmpdir(), 'adr-supersede-'))
  const directory = path.join(repo, 'docs/adr')
  await mkdir(directory, { recursive: true })

  const oldPath = path.join(directory, '0001-old-decision.md')
  const oldContent = `---
status: accepted
date: 2026-01-01
acceptance: human
---
# Old decision

Old body.
`
  const newPath = path.join(directory, '0002-new-decision.md')
  const newContent = `---
status: accepted
date: 2026-02-01
acceptance: automatic
${newListsOld ? 'supersedes: ADR-0001\n' : ''}---
# New decision

New body.
`
  await writeFile(oldPath, oldContent, 'utf8')
  await writeFile(newPath, newContent, 'utf8')

  return { repo, oldPath, newPath, oldContent, newContent }
}

describe('runSupersede', () => {
  it('updates both ADRs while preserving their unrelated frontmatter metadata', async () => {
    const fixture = await createSupersessionRepo()
    try {
      await runSupersede({
        repoRoot: fixture.repo,
        config: defaultConfig(),
        oldAdrId: 'ADR-0001',
        newAdrId: 'ADR-0002',
      })

      const old = parseFrontmatter(await readFile(fixture.oldPath, 'utf8')).frontmatter
      const next = parseFrontmatter(await readFile(fixture.newPath, 'utf8')).frontmatter
      expect(old).toMatchObject({
        status: 'superseded',
        acceptance: 'human',
        superseded_by: 'ADR-0002',
      })
      expect(next).toMatchObject({
        status: 'accepted',
        acceptance: 'automatic',
        supersedes: ['ADR-0001'],
      })
    } finally {
      await rm(fixture.repo, { recursive: true, force: true })
    }
  })

  it('restores both ADRs when writing the second update fails', async () => {
    const fixture = await createSupersessionRepo(true)
    const blockedTempPath = `${fixture.newPath}.${process.pid}.tmp`
    try {
      await mkdir(blockedTempPath)

      await expect(
        runSupersede({
          repoRoot: fixture.repo,
          config: defaultConfig(),
          oldAdrId: 'ADR-0001',
          newAdrId: 'ADR-0002',
        }),
      ).rejects.toThrow()

      await expect(readFile(fixture.oldPath, 'utf8')).resolves.toBe(fixture.oldContent)
      await expect(readFile(fixture.newPath, 'utf8')).resolves.toBe(fixture.newContent)
    } finally {
      await rm(fixture.repo, { recursive: true, force: true })
    }
  })
})
