import { describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

import { runInitScan, loadInitPlan, applyInitPlan } from '../../src/cli/commands/init.js'
import { copySkillAndBundles, GENERATOR_VERSION } from '../../src/installer/generated-files.js'
import { defaultInitOutputDir } from '../../src/cli/commands/init.js'

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '../..')

describe('integration init apply', () => {
  it('applies to empty git repo with split layout defaults', async () => {
    const repo = await mkdtemp(path.join(tmpdir(), 'adr-init-int-'))
    execFileSync('git', ['init', '-b', 'main'], { cwd: repo })
    execFileSync('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: repo })

    const outDir = defaultInitOutputDir(repo)
    const scan = await runInitScan(repo, outDir)
    expect(scan.plan.detectedLayout).toBe('none')

    await applyInitPlan(repo, scan.plan, async (root, plan) => {
      await copySkillAndBundles(PACKAGE_ROOT, root, plan)
    })

    const config = JSON.parse(await (await import('node:fs/promises')).readFile(path.join(repo, 'adr.config.json'), 'utf8'))
    expect(config.layout.mode).toBe('split')

    const manifest = JSON.parse(
      await (await import('node:fs/promises')).readFile(
        path.join(repo, '.adr-governance/manifest.json'),
        'utf8',
      ),
    )
    expect(manifest.generatorVersion).toBe(GENERATOR_VERSION)
  })

  it('detects legacy frontmatter in existing ADR dirs', async () => {
    const repo = await mkdtemp(path.join(tmpdir(), 'adr-legacy-int-'))
    execFileSync('git', ['init', '-b', 'main'], { cwd: repo })
    await mkdir(path.join(repo, 'docs/adr'), { recursive: true })
    await writeFile(
      path.join(repo, 'docs/adr/0001-old.md'),
      '# Legacy\n\nNo frontmatter here.\n',
    )
    execFileSync('git', ['add', '.'], { cwd: repo })
    execFileSync('git', ['commit', '-m', 'add legacy adr'], { cwd: repo })

    const scan = await runInitScan(repo, defaultInitOutputDir(repo))
    expect(scan.plan.proposedConfig.documents.legacyFrontmatter).toBe(true)
  })
})

describe('init plan loader', () => {
  it('loads plan json from scan output', async () => {
    const repo = await mkdtemp(path.join(tmpdir(), 'adr-plan-load-'))
    execFileSync('git', ['init', '-b', 'main'], { cwd: repo })
    execFileSync('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: repo })
    const scan = await runInitScan(repo, defaultInitOutputDir(repo))
    const loaded = await loadInitPlan(scan.planPath)
    expect(loaded.planId).toBe(scan.plan.planId)
  })
})
