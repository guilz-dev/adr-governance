import { describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, unlink } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { defaultConfig } from '../../src/core/config.js'
import { parseAdrFromPath } from '../../src/core/validation.js'
import { mergeCursorHooks } from '../../src/installer/hook-merge.js'
import { fingerprintWatchPathsChanged } from '../../src/core/fingerprint.js'
import { watchPathsChanged } from '../../src/core/risk-signals.js'
import type { RepositoryFingerprint } from '../../src/core/types.js'
import { runCheck } from '../../src/cli/commands/check.js'
import { runTurnClose } from '../../src/cli/commands/turn-close.js'
import { loadCurrentTurnState } from '../../src/hooks/before-turn.js'
import type { TurnState } from '../../src/core/types.js'

const exec = promisify(execFile)

function fingerprint(
  paths: string[],
  contentHashes: Record<string, string>,
  gitStatusHash = 'same',
): RepositoryFingerprint {
  return { paths, gitStatusHash, contentHashes }
}

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

describe('fingerprint watch paths', () => {
  it('does not treat git status-only changes as watch path updates', () => {
    const before = fingerprint(['docs/adr/0001-a.md'], { 'docs/adr/0001-a.md': 'hash-a' }, 'before')
    const after = fingerprint(['docs/adr/0001-a.md'], { 'docs/adr/0001-a.md': 'hash-a' }, 'after')

    expect(watchPathsChanged(before, after)).toBe(false)
    expect(fingerprintWatchPathsChanged(before, after)).toBe(false)
  })

  it('detects content changes on watched paths', () => {
    const before = fingerprint(['packages/db/src/schema.ts'], {
      'packages/db/src/schema.ts': 'hash-a',
    })
    const after = fingerprint(['packages/db/src/schema.ts'], {
      'packages/db/src/schema.ts': 'hash-b',
    })

    expect(watchPathsChanged(before, after)).toBe(true)
    expect(fingerprintWatchPathsChanged(before, after)).toBe(true)
  })

  it('ignores content changes outside watch paths', () => {
    const before = fingerprint(['src/app.ts'], { 'src/app.ts': 'hash-a' })
    const after = fingerprint(['src/app.ts'], { 'src/app.ts': 'hash-b' })

    expect(watchPathsChanged(before, after)).toBe(false)
    expect(fingerprintWatchPathsChanged(before, after)).toBe(false)
  })
})

describe('check --base number collisions', () => {
  it('flags duplicate ADR numbers in the current tree', async () => {
    const repo = await mkdtemp(path.join(tmpdir(), 'adr-base-ref-'))
    await exec('git', ['init'], { cwd: repo })
    await exec('git', ['config', 'user.email', 'test@example.com'], { cwd: repo })
    await exec('git', ['config', 'user.name', 'Test'], { cwd: repo })

    await mkdir(path.join(repo, 'docs/adr'), { recursive: true })
    await writeFile(path.join(repo, 'docs/adr/0001-base-slug.md'), '# Base\n')
    await writeFile(path.join(repo, 'adr.config.json'), JSON.stringify(defaultConfig(), null, 2))
    await exec('git', ['add', '.'], { cwd: repo })
    await exec('git', ['commit', '-m', 'base'], { cwd: repo })

    await writeFile(path.join(repo, 'docs/adr/0001-other-slug.md'), '# Other\n')
    await exec('git', ['add', 'docs/adr/0001-other-slug.md'], { cwd: repo })

    const result = await runCheck(repo, 'HEAD')
    expect(result.ok).toBe(false)
    expect(result.issues.some((i) => i.code === 'duplicate-number')).toBe(true)
  })

  it('flags ADR number reuse with a different slug versus base ref', async () => {
    const repo = await mkdtemp(path.join(tmpdir(), 'adr-base-ref-'))
    await exec('git', ['init'], { cwd: repo })
    await exec('git', ['config', 'user.email', 'test@example.com'], { cwd: repo })
    await exec('git', ['config', 'user.name', 'Test'], { cwd: repo })

    await mkdir(path.join(repo, 'docs/adr'), { recursive: true })
    await writeFile(path.join(repo, 'docs/adr/0001-base-slug.md'), '# Base\n')
    await writeFile(path.join(repo, 'adr.config.json'), JSON.stringify(defaultConfig(), null, 2))
    await exec('git', ['add', '.'], { cwd: repo })
    await exec('git', ['commit', '-m', 'base'], { cwd: repo })

    await unlink(path.join(repo, 'docs/adr/0001-base-slug.md'))
    await writeFile(path.join(repo, 'docs/adr/0001-other-slug.md'), '# Other\n')

    const result = await runCheck(repo, 'HEAD')
    expect(result.ok).toBe(false)
    expect(result.issues.some((i) => i.code === 'base-ref-number-collision')).toBe(true)
  })
})

describe('turn-close pointer', () => {
  it('writes receipt to the current turn state file', async () => {
    const repo = await mkdtemp(path.join(tmpdir(), 'adr-turn-close-'))
    const turnId = 'turn-test-id'
    const stateDir = path.join(repo, '.adr-governance/state/turns')
    await mkdir(stateDir, { recursive: true })
    await mkdir(path.join(repo, '.adr-governance/state'), { recursive: true })

    const turnState: TurnState = {
      schemaVersion: 1,
      sessionId: 'session-1',
      turnId,
      promptHash: 'abc',
      risk: 'none',
      signals: [],
      beforeFingerprint: { paths: [], gitStatusHash: '', contentHashes: {} },
      relevantAdrPaths: [],
      followUpCount: 0,
      receipt: null,
      createdAt: new Date().toISOString(),
    }

    const turnRel = `.adr-governance/state/turns/${turnId}.json`
    await writeFile(path.join(repo, turnRel), JSON.stringify(turnState, null, 2))
    await writeFile(
      path.join(repo, '.adr-governance/state/current-turn.json'),
      JSON.stringify({ turnId, turnStatePath: turnRel }, null, 2),
    )

    await runTurnClose({ repoRoot: repo, outcome: 'no-change', reason: 'no-decision' })

    const updated = await loadCurrentTurnState(repo)
    expect(updated?.receipt?.outcome).toBe('no-change')
    expect(updated?.receipt?.reason).toBe('no-decision')
  })
})
