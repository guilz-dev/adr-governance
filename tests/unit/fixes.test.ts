import { describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { defaultConfig } from '../../src/core/config.js'
import { parseAdrFromPath } from '../../src/core/validation.js'
import { mergeCursorHooks } from '../../src/installer/hook-merge.js'

describe('legacy ADR parsing', () => {
  it('indexes frontmatter-less accepted ADRs', () => {
    const content = `# Facet naming\n\nLegacy body without frontmatter.`
    const parsed = parseAdrFromPath(
      'docs/adr/0001-facet-names.md',
      content,
      'accepted',
      defaultConfig(),
    )
    expect(parsed?.legacy).toBe(true)
    expect(parsed?.frontmatter.status).toBe('accepted')
    expect(parsed?.title).toContain('Facet naming')
  })
})

describe('cursor hook merge', () => {
  it('appends managed hooks without removing existing entries', async () => {
    const repo = await mkdtemp(path.join(tmpdir(), 'adr-hook-merge-'))
    await mkdir(path.join(repo, '.cursor'), { recursive: true })
    await writeFile(
      path.join(repo, '.cursor/hooks.json'),
      JSON.stringify(
        {
          version: 1,
          hooks: {
            beforeSubmitPrompt: [{ command: '.cursor/hooks/existing.py' }],
            stop: [{ command: '.cursor/hooks/existing-stop.py' }],
          },
        },
        null,
        2,
      ),
    )

    const result = await mergeCursorHooks(repo)
    expect(result.conflict).toBeUndefined()

    const merged = JSON.parse(await readFile(path.join(repo, '.cursor/hooks.json'), 'utf8')) as {
      hooks: Record<string, Array<{ command: string }>>
    }
    expect(merged.hooks.beforeSubmitPrompt).toHaveLength(2)
    expect(merged.hooks.beforeSubmitPrompt?.some((h) => h.command.includes('adr-governance'))).toBe(
      true,
    )
    expect(merged.hooks.sessionStart?.some((h) => h.command.includes('adr-governance'))).toBe(true)
  })
})
