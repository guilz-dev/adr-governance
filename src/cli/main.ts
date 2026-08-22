#!/usr/bin/env node
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { runInitScan, loadInitPlan, applyInitPlan, defaultInitOutputDir } from './commands/init.js'
import { runCheck } from './commands/check.js'
import { runCreate } from './commands/create.js'
import { runPromote } from './commands/promote.js'
import { runSupersede } from './commands/supersede.js'
import { runTurnClose } from './commands/turn-close.js'
import { runSync } from './commands/sync.js'
import { gitRoot } from './git.js'
import { resolvePackageRoot } from './resolve-package-root.js'
import { parseConfig } from '../core/config.js'
import { defaultConfig } from '../core/config.js'
import { readFile } from 'node:fs/promises'
import { copySkillAndBundles } from '../installer/generated-files.js'

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

function usage(): void {
  console.error(`Usage:
  adr-governance init [--repo <path>]
  adr-governance init --apply <plan.json> [--from <package-root>] [--repo <path>]
  adr-governance check [--base <git-ref>] [--json] [--repo <path>]
  adr-governance sync [--from <package-root>] [--repo <path>]
  adr-governance create --status proposed|accepted --title "<title>" --body-file <path> [--repo <path>]
  adr-governance promote ADR-NNNN [--approval automatic|human] [--repo <path>]
  adr-governance supersede ADR-NNNN --by ADR-MMMM [--repo <path>]
  adr-governance turn-close --outcome docs-updated|no-change [--reason <code>] [--repo <path>]`)
}

function getArg(name: string): string | undefined {
  const idx = process.argv.indexOf(name)
  if (idx === -1) return undefined
  const value = process.argv[idx + 1]
  if (!value || value.startsWith('-')) return undefined
  return value
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name)
}

function firstPositionalAfter(command: string): string | undefined {
  const start = process.argv.indexOf(command)
  if (start === -1) return undefined
  const skipValueFor = new Set(['--repo', '--from', '--approval', '--by', '--apply', '--base', '--status', '--title', '--body-file', '--outcome', '--reason'])
  for (let i = start + 1; i < process.argv.length; i++) {
    const arg = process.argv[i]
    if (!arg) continue
    if (skipValueFor.has(arg)) {
      i++
      continue
    }
    if (arg.startsWith('-')) continue
    return arg
  }
  return undefined
}

async function resolveRepo(): Promise<string> {
  const explicit = getArg('--repo')
  if (explicit) return path.resolve(explicit)
  const root = await gitRoot(process.cwd())
  if (!root) throw new Error('Not a git repository. Use --repo <path>.')
  return root
}

async function main(): Promise<void> {
  const command = process.argv[2]
  if (!command) {
    usage()
    process.exit(2)
  }

  const repoRoot = await resolveRepo()

  switch (command) {
    case 'init': {
      const applyPlan = getArg('--apply')
      if (applyPlan) {
        const packageRoot = resolvePackageRoot(PACKAGE_ROOT, getArg('--from'))
        const plan = await loadInitPlan(path.resolve(applyPlan))
        await applyInitPlan(repoRoot, plan, async (root, p) => {
          await copySkillAndBundles(packageRoot, root, p)
        })
        const result = await runCheck(repoRoot)
        console.log(
          JSON.stringify(
            {
              applied: true,
              check: result,
              nextSteps: [
                'Review merged hook entries in .cursor/hooks.json (and other runtime settings).',
                'If Cursor prompts about untrusted project hooks, approve adr-governance hooks in Cursor settings.',
                'Run: node .adr-governance/bin/cli.mjs check --base origin/main',
              ],
            },
            null,
            2,
          ),
        )
        process.exit(result.exitCode)
      }
      const outDir = defaultInitOutputDir(repoRoot)
      const scan = await runInitScan(repoRoot, outDir)
      console.log(
        JSON.stringify(
          {
            message: 'Init scan complete. Review plan and run init --apply.',
            planPath: scan.planPath,
            evidencePath: scan.evidencePath,
          },
          null,
          2,
        ),
      )
      break
    }
    case 'check': {
      const base = getArg('--base')
      const result = await runCheck(repoRoot, base)
      if (hasFlag('--json')) {
        console.log(JSON.stringify(result, null, 2))
      } else {
        for (const issue of result.issues) {
          console.log(`${issue.severity.toUpperCase()} [${issue.code}] ${issue.message}${issue.path ? ` (${issue.path})` : ''}`)
        }
      }
      process.exit(result.exitCode)
    }
    case 'sync': {
      const packageRoot = resolvePackageRoot(PACKAGE_ROOT, getArg('--from'))
      const plan = {
        schemaVersion: 1 as const,
        planId: 'sync',
        repositoryRootHash: '',
        sourceHeadSha: null,
        createdAt: new Date().toISOString(),
        detectedLayout: 'split' as const,
        proposedConfig: defaultConfig(),
        operations: [],
        evidenceReferences: [],
      }
      const configPath = path.join(repoRoot, 'adr.config.json')
      try {
        plan.proposedConfig = parseConfig(JSON.parse(await readFile(configPath, 'utf8'))).config
      } catch {
        /* keep default */
      }
      await runSync({ packageRoot, repoRoot, plan })
      console.log('Sync complete.')
      break
    }
    case 'create': {
      const status = getArg('--status') as 'proposed' | 'accepted'
      const title = getArg('--title')
      const bodyFile = getArg('--body-file')
      if (!status || !title || !bodyFile) throw new Error('Missing create arguments')
      const config = parseConfig(
        JSON.parse(await readFile(path.join(repoRoot, 'adr.config.json'), 'utf8')),
      ).config
      const body = await readFile(path.resolve(bodyFile), 'utf8')
      const rel = await runCreate({ repoRoot, config, status, title, body })
      console.log(`Created ${rel}`)
      break
    }
    case 'promote': {
      const adrId = firstPositionalAfter('promote')
      if (!adrId) throw new Error('Missing ADR id')
      const config = parseConfig(
        JSON.parse(await readFile(path.join(repoRoot, 'adr.config.json'), 'utf8')),
      ).config
      const rel = await runPromote({
        repoRoot,
        config,
        adrId,
        approval: getArg('--approval') as 'automatic' | 'human' | undefined,
      })
      console.log(`Promoted to ${rel}`)
      break
    }
    case 'supersede': {
      const oldId = firstPositionalAfter('supersede')
      const newId = getArg('--by')
      if (!oldId || !newId) throw new Error('Usage: supersede ADR-NNNN --by ADR-MMMM')
      const config = parseConfig(
        JSON.parse(await readFile(path.join(repoRoot, 'adr.config.json'), 'utf8')),
      ).config
      await runSupersede({ repoRoot, config, oldAdrId: oldId, newAdrId: newId })
      console.log(`Superseded ${oldId} with ${newId}`)
      break
    }
    case 'turn-close': {
      const outcome = getArg('--outcome') as 'docs-updated' | 'no-change'
      const reason = getArg('--reason')
      if (!outcome) throw new Error('Missing --outcome')
      if (outcome === 'no-change' && !reason) {
        throw new Error('--reason required for no-change outcome')
      }
      await runTurnClose({ repoRoot, outcome, reason })
      console.log('Turn receipt recorded.')
      break
    }
    default:
      usage()
      process.exit(2)
  }
}

main().catch((e) => {
  console.error(String(e))
  process.exit(2)
})
