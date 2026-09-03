import { describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, unlink } from 'node:fs/promises'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { defaultConfig } from '../../src/core/config.js'
import { parseAdrFromPath } from '../../src/core/validation.js'
import { mergeCursorHooks, mergeClaudeHooks } from '../../src/installer/hook-merge.js'
import { mergeNestedHookGroups } from '../../src/installer/nested-hook-merge.js'
import { MANAGED_MARKER } from '../../src/installer/hook-merge-types.js'
import { turnPointerRelPath } from '../../src/hooks/turn-pointer.js'
import { runCreate } from '../../src/cli/commands/create.js'
import { buildRepositoryFingerprint } from '../../src/core/fingerprint.js'
import { fingerprintWatchPathsChanged } from '../../src/core/fingerprint.js'
import { watchPathsChanged } from '../../src/core/risk-signals.js'
import type { RepositoryFingerprint } from '../../src/core/types.js'
import { runCheck } from '../../src/cli/commands/check.js'
import { runTurnClose } from '../../src/cli/commands/turn-close.js'
import { loadCurrentTurnState } from '../../src/hooks/before-turn.js'
import { resolvePackageRoot } from '../../src/cli/resolve-package-root.js'
import type { TurnState } from '../../src/core/types.js'

const exec = promisify(execFile)

function fingerprint(
  paths: string[],
  contentHashes: Record<string, string>,
  gitStatusHash = 'same',
  watchGitStatusHash = gitStatusHash,
  overflowWatchHash = 'same',
): RepositoryFingerprint {
  return { paths, gitStatusHash, watchGitStatusHash, overflowWatchHash, contentHashes }
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

describe('nested hook merge', () => {
  it('preserves matcher wrapper when merging managed hooks', () => {
    const existing = [
      {
        matcher: 'Write|Edit',
        hooks: [{ type: 'command', command: 'echo keep' }],
      },
    ]
    const managed = [{ type: 'command', command: 'node .claude/hooks/adr-governance.mjs before-turn' }]
    const { merged } = mergeNestedHookGroups(existing, managed, MANAGED_MARKER)
    expect(merged).toHaveLength(2)
    expect((merged[0] as { matcher?: string }).matcher).toBe('Write|Edit')
  })

  it('merges claude settings without flattening matcher groups', async () => {
    const repo = await mkdtemp(path.join(tmpdir(), 'adr-claude-hook-'))
    await mkdir(path.join(repo, '.claude'), { recursive: true })
    await writeFile(
      path.join(repo, '.claude/settings.json'),
      JSON.stringify(
        {
          hooks: {
            UserPromptSubmit: [
              {
                matcher: 'deploy',
                hooks: [{ type: 'command', command: 'echo scoped' }],
              },
            ],
          },
        },
        null,
        2,
      ),
    )

    const result = await mergeClaudeHooks(repo)
    expect(result.conflict).toBeUndefined()
    const merged = JSON.parse(await readFile(path.join(repo, '.claude/settings.json'), 'utf8')) as {
      hooks: { UserPromptSubmit: Array<{ matcher?: string }> }
    }
    expect(merged.hooks.UserPromptSubmit.some((g) => g.matcher === 'deploy')).toBe(true)
  })
  it('upgrades flat managed hook entry without duplicating managed groups', () => {
    const existing = [
      {
        type: 'command',
        command: 'node .claude/hooks/adr-governance.mjs before-turn',
      },
    ]
    const managed = [{ type: 'command', command: 'node .claude/hooks/adr-governance.mjs after-turn' }]
    const { merged, conflict } = mergeNestedHookGroups(existing, managed, MANAGED_MARKER)
    expect(conflict).toBeUndefined()
    expect(merged).toHaveLength(1)
    expect((merged[0] as { hooks: unknown[] }).hooks).toHaveLength(2)
  })
})

describe('create human acceptance guard', () => {
  it('rejects create --status accepted when requireHumanAcceptance is true', async () => {
    const repo = await mkdtemp(path.join(tmpdir(), 'adr-create-guard-'))
    await mkdir(path.join(repo, 'docs/adr'), { recursive: true })
    await mkdir(path.join(repo, 'docs/proposed-adr'), { recursive: true })
    await mkdir(path.join(repo, '.adr-governance/state/locks'), { recursive: true })

    const config = defaultConfig({ promotion: { requireHumanAcceptance: true } })
    await writeFile(path.join(repo, 'adr.config.json'), JSON.stringify(config, null, 2))

    await expect(
      runCreate({
        repoRoot: repo,
        config,
        status: 'accepted',
        title: 'Test',
        body: '# Test\n\nBody',
      }),
    ).rejects.toThrow(/requireHumanAcceptance/)
  })
})

describe('fingerprint truncation', () => {
  it('still hashes sampled watch paths when file count exceeds cap', async () => {
    const repo = await mkdtemp(path.join(tmpdir(), 'adr-fingerprint-'))
    const paths = Array.from({ length: 510 }, (_, i) => `packages/db/src/mod-${i}/schema.ts`)
    for (const rel of paths) {
      const abs = path.join(repo, rel)
      await mkdir(path.dirname(abs), { recursive: true })
      await writeFile(abs, `export const v${rel} = 1\n`)
    }

    const fp = await buildRepositoryFingerprint(repo, paths)
    expect(fp.paths.length).toBeGreaterThan(500)
    expect(Object.keys(fp.contentHashes).length).toBeGreaterThan(0)
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
  it('does not treat git status-only changes on non-watch paths as watch path updates', () => {
    const before = fingerprint(
      ['docs/adr/0001-a.md'],
      { 'docs/adr/0001-a.md': 'hash-a' },
      'global-before',
      'watch-same',
    )
    const after = fingerprint(
      ['docs/adr/0001-a.md'],
      { 'docs/adr/0001-a.md': 'hash-a' },
      'global-after',
      'watch-same',
    )

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
      beforeFingerprint: {
        paths: [],
        gitStatusHash: '',
        watchGitStatusHash: '',
        overflowWatchHash: '',
        contentHashes: {},
      },
      relevantAdrPaths: [],
      followUpCount: 0,
      receipt: null,
      createdAt: new Date().toISOString(),
    }

    const turnRel = `.adr-governance/state/turns/${turnId}.json`
    await writeFile(path.join(repo, turnRel), JSON.stringify(turnState, null, 2))
    await mkdir(path.join(repo, '.adr-governance/state/current-turn'), { recursive: true })
    await writeFile(
      path.join(repo, turnPointerRelPath('session-1')),
      JSON.stringify({ turnId, turnStatePath: turnRel }, null, 2),
    )

    await runTurnClose({
      repoRoot: repo,
      outcome: 'no-change',
      reason: 'no-decision',
      sessionId: 'session-1',
    })

    const updated = await loadCurrentTurnState(repo, 'session-1')
    expect(updated?.receipt?.outcome).toBe('no-change')
    expect(updated?.receipt?.reason).toBe('no-decision')
  })
})

describe('resolvePackageRoot', () => {
  const packageRoot = path.resolve(import.meta.dirname, '../..')

  it('accepts the adr-governance repository root', () => {
    expect(resolvePackageRoot(packageRoot)).toBe(packageRoot)
  })

  it('rejects a target repo root without skill and bundles', () => {
    expect(() => resolvePackageRoot('/tmp/not-a-package')).toThrow(/Requires the adr-governance package root/)
  })
})

describe('CLI flags', () => {
  const cli = path.resolve(import.meta.dirname, '../../dist/cli/main.js')

  it('emits JSON when --json is the last argument', async () => {
    const repo = await mkdtemp(path.join(tmpdir(), 'adr-json-flag-'))
    const { stdout, stderr } = await exec(process.execPath, [cli, 'check', '--repo', repo, '--json'], {
      encoding: 'utf8',
    }).catch((error: { stdout?: string; stderr?: string }) => error)

    const raw = stdout ?? stderr ?? ''
    expect(raw.trim().startsWith('{')).toBe(true)
    const parsed = JSON.parse(raw) as { issues: Array<{ code: string }> }
    expect(parsed.issues.some((i) => i.code === 'missing-config')).toBe(true)
  })
})

describe('cursor hook wrapper stdin', () => {
  it('forwards prompt JSON to the bundled hook', async () => {
    const repo = await mkdtemp(path.join(tmpdir(), 'adr-hook-stdin-'))
    await writeFile(path.join(repo, 'adr.config.json'), JSON.stringify(defaultConfig(), null, 2))
    await mkdir(path.join(repo, '.adr-governance/bin'), { recursive: true })
    await mkdir(path.join(repo, '.cursor/hooks'), { recursive: true })
    await writeFile(path.join(repo, '.adr-governance/manifest.json'), '{}\n')

    const hookSrc = path.resolve(import.meta.dirname, '../../dist/bundle/hook.mjs')
    const wrapperSrc = path.resolve(
      import.meta.dirname,
      '../../templates/cursor/hooks/adr-governance.mjs',
    )
    await writeFile(
      path.join(repo, '.adr-governance/bin/hook.mjs'),
      await readFile(hookSrc, 'utf8'),
    )
    await writeFile(
      path.join(repo, '.cursor/hooks/adr-governance.mjs'),
      await readFile(wrapperSrc, 'utf8'),
    )

    const hookPayload = {
      prompt: 'We need a new database migration for auth architecture',
      cwd: repo,
      conversation_id: 'conv-hook-test',
      generation_id: 'gen-hook-test',
    }

    const stdout = await new Promise<string>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      const child = spawn(
        process.execPath,
        [path.join(repo, '.cursor/hooks/adr-governance.mjs'), 'before-turn'],
        { cwd: repo, stdio: ['pipe', 'pipe', 'pipe'] },
      )
      const chunks: Buffer[] = []
      child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
      child.stderr.on('data', (chunk: Buffer) => chunks.push(chunk))
      child.on('error', reject)
      child.on('exit', (code) => {
        if (timer) clearTimeout(timer)
        const text = Buffer.concat(chunks).toString('utf8')
        if (code === 0) resolve(text)
        else reject(new Error(`hook wrapper exited ${code}: ${text}`))
      })
      child.stdin.end(JSON.stringify(hookPayload))
      timer = setTimeout(() => {
        child.kill('SIGKILL')
        reject(new Error('hook wrapper timed out'))
      }, 8000)
    })

    const parsed = JSON.parse(stdout) as { continue?: boolean }
    expect(parsed.continue).toBe(true)

    const after = await new Promise<string>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      const child = spawn(
        process.execPath,
        [path.join(repo, '.cursor/hooks/adr-governance.mjs'), 'after-turn'],
        { cwd: repo, stdio: ['pipe', 'pipe', 'pipe'] },
      )
      const chunks: Buffer[] = []
      child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
      child.on('error', reject)
      child.on('exit', (code) => {
        if (timer) clearTimeout(timer)
        const text = Buffer.concat(chunks).toString('utf8')
        if (code === 0) resolve(text)
        else reject(new Error(`after-turn exited ${code}: ${text}`))
      })
      child.stdin.end(
        JSON.stringify({
          cwd: repo,
          conversation_id: hookPayload.conversation_id,
          generation_id: hookPayload.generation_id,
        }),
      )
      timer = setTimeout(() => {
        child.kill('SIGKILL')
        reject(new Error('after-turn timed out'))
      }, 8000)
    })

    const afterParsed = JSON.parse(after) as { followup_message?: string }
    expect(afterParsed.followup_message).toContain('ADR audit')
  })
})
