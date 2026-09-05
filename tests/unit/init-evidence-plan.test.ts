import { describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { configForSingleDir, defaultConfig } from '../../src/core/config.js'
import { ciWorkflowSuggestion } from '../../src/analysis/init-hints.js'
import { buildEvidenceBundle } from '../../src/analysis/repository-scan.js'
import { buildInitPlanOperations } from '../../src/installer/init-plan-builder.js'
import { buildEvidenceReferences, buildReviewQuestions, shouldProposeContextMap } from '../../src/installer/init-evidence-plan.js'
import { watchPathsChanged } from '../../src/core/risk-signals.js'
import type { EvidenceBundle, RepositoryFingerprint } from '../../src/core/types.js'
import { loadTurnStateForSession, writeTurnPointer } from '../../src/hooks/turn-pointer.js'
import type { TurnState } from '../../src/core/types.js'
import { gitCommit, initTestGitRepo } from '../helpers/git-test-repo.js'

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '../..')

describe('generated CI workflow', () => {
  it('uses immutable PR base SHA and github event evidence', () => {
    const workflow = ciWorkflowSuggestion()
    expect(workflow).toContain('fetch-depth: 0')
    expect(workflow).toContain('${{ github.event.pull_request.base.sha }}')
    expect(workflow).toContain('--github-event "$GITHUB_EVENT_PATH"')
    expect(workflow).not.toContain('--base origin/main')
    expect(workflow).toContain('if: github.event_name == \'push\'')
    expect(workflow).toMatch(/adr-check-push:[\s\S]*node \.adr-governance\/bin\/cli\.mjs check\n/)
  })
})

describe('init evidence-informed plan', () => {
  it('does not create duplicate README operations for single layout', async () => {
    const repo = await mkdtemp(path.join(tmpdir(), 'adr-init-single-readme-'))
    initTestGitRepo(repo)
    gitCommit(repo, 'init', true)

    const config = configForSingleDir('docs/decisions')
    const build = await buildInitPlanOperations(PACKAGE_ROOT, repo, config, null)
    const readmeOps = build.operations.filter((op) => op.path.endsWith('README.md'))

    expect(readmeOps).toHaveLength(1)
    expect(readmeOps[0]?.path).toBe('docs/decisions/README.md')
    expect(build.operations.some((op) => op.path === 'docs/adr/README.md')).toBe(false)
  })

  it('does not force docs/adr/ for custom layout', async () => {
    const repo = await mkdtemp(path.join(tmpdir(), 'adr-init-custom-layout-'))
    initTestGitRepo(repo)
    await mkdir(path.join(repo, 'docs/architecture/decisions'), { recursive: true })
    await writeFile(
      path.join(repo, 'docs/architecture/decisions/0001-existing.md'),
      '# Existing\n',
    )
    execFileSync('git', ['add', '.'], { cwd: repo })
    gitCommit(repo, 'add custom adr dir')

    const config = defaultConfig({
      layout: {
        mode: 'split',
        acceptedDir: 'docs/architecture/decisions',
        proposedDir: 'docs/proposed-adr',
        contextFile: 'CONTEXT.md',
        contextMapFile: 'CONTEXT-MAP.md',
      },
    })
    const build = await buildInitPlanOperations(PACKAGE_ROOT, repo, config, null)
    const readmeOps = build.operations.filter((op) => op.path.endsWith('README.md'))

    expect(build.operations.some((op) => op.path.startsWith('docs/adr/'))).toBe(false)
    expect(readmeOps.some((op) => op.path === 'docs/architecture/decisions/README.md')).toBe(true)
  })

  it('does not propose CONTEXT-MAP for a single-context repository', async () => {
    const repo = await mkdtemp(path.join(tmpdir(), 'adr-init-context-map-'))
    initTestGitRepo(repo)
    gitCommit(repo, 'init', true)

    const tracked = ['package.json', 'packages/db/src/schema.ts']
    await writeFile(path.join(repo, 'package.json'), '{"name":"demo"}\n')
    await mkdir(path.join(repo, 'packages/db/src'), { recursive: true })
    await writeFile(path.join(repo, 'packages/db/src/schema.ts'), 'export const users = 1\n')
    execFileSync('git', ['add', '.'], { cwd: repo })
    gitCommit(repo, 'add files')

    const evidence = await buildEvidenceBundle(repo, tracked, 'HEAD', defaultConfig().analysis.exclude)
    const build = await buildInitPlanOperations(
      PACKAGE_ROOT,
      repo,
      defaultConfig(),
      null,
      evidence,
    )

    expect(build.operations.some((op) => op.path === 'CONTEXT-MAP.md')).toBe(false)
    expect(build.reviewQuestions.length).toBeGreaterThan(0)
    expect(build.operations.some((op) => op.path === 'CONTEXT.md')).toBe(true)
    expect(build.operations.some((op) => op.path.startsWith('docs/proposed-adr/'))).toBe(true)
  })

  it('maps evidenceReferences to source paths instead of destinations', async () => {
    const repo = await mkdtemp(path.join(tmpdir(), 'adr-init-evidence-refs-'))
    const evidence: EvidenceBundle = {
      schemaVersion: 1,
      repository: { rootHash: 'x', headSha: null, trackedFileCount: 1 },
      existingLayout: {
        acceptedDirs: [],
        proposedDirs: [],
        contextFiles: [],
        agentConfigFiles: [],
      },
      manifests: [{ path: 'package.json', kind: 'package', headingsOrKeys: ['name'] }],
      candidateEvidence: [
        {
          category: 'boundary',
          path: 'packages/db/src/schema.ts',
          line: 1,
          excerptHash: 'abc',
          summary: 'schema observed',
        },
      ],
      warnings: [],
    }

    const build = await buildInitPlanOperations(PACKAGE_ROOT, repo, defaultConfig(), null, evidence)
    const refs = buildEvidenceReferences(build.operations, build.provenance)
    const contextRef = refs.find((ref) =>
      build.operations[ref.operationIndex]?.path === 'CONTEXT.md',
    )

    expect(contextRef?.sourcePaths).toContain('packages/db/src/schema.ts')
    expect(contextRef?.sourcePaths).not.toContain('CONTEXT.md')
  })

  it('proposes CONTEXT-MAP only when multiple CONTEXT.md files exist', () => {
    const evidence: EvidenceBundle = {
      schemaVersion: 1,
      repository: { rootHash: 'x', headSha: null, trackedFileCount: 1 },
      existingLayout: {
        acceptedDirs: [],
        proposedDirs: [],
        contextFiles: ['apps/api/CONTEXT.md', 'apps/web/CONTEXT.md'],
        agentConfigFiles: [],
      },
      manifests: [],
      candidateEvidence: [],
      warnings: [],
    }

    expect(shouldProposeContextMap(evidence)).toBe(true)
  })

  it('builds review questions in the configured document language', () => {
    const evidence: EvidenceBundle = {
      schemaVersion: 1,
      repository: { rootHash: 'x', headSha: null, trackedFileCount: 1 },
      existingLayout: {
        acceptedDirs: [],
        proposedDirs: [],
        contextFiles: [],
        agentConfigFiles: [],
      },
      manifests: [],
      candidateEvidence: [
        {
          category: 'boundary',
          path: 'packages/db/src/schema.ts',
          line: 1,
          excerptHash: 'abc',
          summary: 'schema observed',
        },
      ],
      warnings: [],
    }

    expect(buildReviewQuestions(evidence, 'ja')[0]).toContain('なぜこの構造')
    expect(buildReviewQuestions(evidence, 'en')[0]).toContain('Why was')
  })
})

describe('watch path overflow detection', () => {
  it('detects changes on overflow watch paths via overflowWatchHash', () => {
    const before: RepositoryFingerprint = {
      paths: ['packages/db/src/schema.ts'],
      gitStatusHash: 'same',
      watchGitStatusHash: 'same',
      overflowWatchHash: 'hash-a',
      contentHashes: { 'packages/db/src/schema.ts': 'hash-a' },
    }
    const after: RepositoryFingerprint = {
      ...before,
      overflowWatchHash: 'hash-b',
    }

    expect(watchPathsChanged(before, after)).toBe(true)
  })

  it('detects watch-scoped git status changes', () => {
    const before: RepositoryFingerprint = {
      paths: ['packages/db/src/schema.ts'],
      gitStatusHash: 'global-a',
      watchGitStatusHash: 'watch-a',
      overflowWatchHash: 'same',
      contentHashes: { 'packages/db/src/schema.ts': 'hash-a' },
    }
    const after: RepositoryFingerprint = {
      ...before,
      gitStatusHash: 'global-b',
      watchGitStatusHash: 'watch-b',
    }

    expect(watchPathsChanged(before, after)).toBe(true)
  })

  it('ignores new fingerprint fields when before turn state is from v0.1.7', () => {
    const before = {
      paths: ['packages/db/src/schema.ts'],
      gitStatusHash: 'same',
      contentHashes: { 'packages/db/src/schema.ts': 'hash-a' },
    } as RepositoryFingerprint
    const after: RepositoryFingerprint = {
      paths: ['packages/db/src/schema.ts'],
      gitStatusHash: 'same',
      watchGitStatusHash: 'watch-hash',
      overflowWatchHash: 'overflow-hash',
      contentHashes: { 'packages/db/src/schema.ts': 'hash-a' },
    }

    expect(watchPathsChanged(before, after)).toBe(false)
  })
})

describe('turn pointer without session id', () => {
  it('does not fall back to another session when session id is omitted', async () => {
    const repo = await mkdtemp(path.join(tmpdir(), 'adr-turn-pointer-fallback-'))
    const stateDir = path.join(repo, '.adr-governance/state/turns')
    await mkdir(stateDir, { recursive: true })

    const turnState: TurnState = {
      schemaVersion: 1,
      sessionId: 'session-a',
      turnId: 'turn-a',
      promptHash: 'abc',
      risk: 'none',
      signals: [],
      beforeFingerprint: {
        paths: [],
        gitStatusHash: '',
        watchGitStatusHash: '',
        overflowWatchHash: '',
        contentHashes: {},
        collectionMode: 'content',
      },
      relevantAdrPaths: [],
      followUpCount: 0,
      receipt: null,
      createdAt: new Date().toISOString(),
    }

    const turnRel = '.adr-governance/state/turns/turn-a.json'
    await writeFile(path.join(repo, turnRel), JSON.stringify(turnState, null, 2))
    await writeTurnPointer(repo, 'session-a', {
      turnId: 'turn-a',
      turnStatePath: turnRel,
      risk: 'none',
      updatedAt: turnState.createdAt,
    })

    const loaded = await loadTurnStateForSession(repo)
    expect(loaded).toBeNull()
  })
})
