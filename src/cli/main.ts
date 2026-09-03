#!/usr/bin/env node
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { runInitScan, loadInitPlan, applyInitPlan, defaultInitOutputDir } from './commands/init.js'
import { runCheck } from './commands/check.js'
import { runAttest } from './commands/attest.js'
import { runCreate } from './commands/create.js'
import { runPromote } from './commands/promote.js'
import { runSupersede } from './commands/supersede.js'
import { runTurnClose } from './commands/turn-close.js'
import { runSync } from './commands/sync.js'
import { gitRoot } from './git.js'
import { resolvePackageRoot } from './resolve-package-root.js'
import { parseConfig, defaultConfig } from '../core/config.js'
import type { InitPlan } from '../core/types.js'
import { readFile } from 'node:fs/promises'
import { copySkillAndBundles } from '../installer/generated-files.js'

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

function usage(): void {
  console.error(`Usage:
  adr-governance init [--repo <path>]
  adr-governance init --apply <plan.json> [--from <package-root>] [--repo <path>]
  adr-governance check [--base <git-ref>] [--evidence <json-path>] [--github-event <event-path>] [--json] [--repo <path>]
  adr-governance attest --base <git-ref> (--adr ADR-NNNN ... | --no-adr <reason> --rationale <text>) [--reviewed-proposal ADR-NNNN ...] [--format json|github-markdown] [--repo <path>]
  adr-governance sync [--from <package-root>] [--repo <path>]
  adr-governance create --status proposed|accepted --title "<title>" --body-file <path> [--repo <path>]
  adr-governance promote ADR-NNNN [--approval automatic|human] [--repo <path>]
  adr-governance supersede ADR-NNNN --by ADR-MMMM [--repo <path>]
  adr-governance turn-close --outcome docs-updated|no-change [--reason <code>] [--session-id <id>] [--repo <path>]`)
}

function getArgs(name: string): string[] {
  const values: string[] = []
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === name) {
      const value = process.argv[i + 1]
      if (value && !value.startsWith('-')) values.push(value)
    }
  }
  return values
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
  const skipValueFor = new Set(['--repo', '--from', '--approval', '--by', '--apply', '--base', '--status', '--title', '--body-file', '--outcome', '--reason', '--session-id', '--evidence', '--github-event', '--no-adr', '--rationale', '--format'])
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
      const scan = await runInitScan(repoRoot, outDir, PACKAGE_ROOT)
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
      const result = await runCheck(repoRoot, {
        baseRef: getArg('--base'),
        evidencePath: getArg('--evidence'),
        githubEventPath: getArg('--github-event'),
      })
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
      const plan: InitPlan = {
        schemaVersion: 1,
        planId: 'sync',
        repositoryRootHash: '',
        sourceHeadSha: null,
        createdAt: new Date().toISOString(),
        detectedLayout: 'split',
        proposedConfig: defaultConfig(),
        operations: [],
        postApplySteps: ['write-manifest'],
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
    case 'attest': {
      const baseRef = getArg('--base')
      if (!baseRef) throw new Error('Missing --base')
      const config = parseConfig(
        JSON.parse(await readFile(path.join(repoRoot, 'adr.config.json'), 'utf8')),
      ).config
      const evidence = await runAttest({
        repoRoot,
        config,
        baseRef,
        adrIds: getArgs('--adr'),
        noAdrReason: getArg('--no-adr') as import('../core/types.js').NoAdrReason | undefined,
        rationale: getArg('--rationale'),
        reviewedProposalIds: getArgs('--reviewed-proposal'),
      })
      const format = getArg('--format') ?? 'json'
      if (format === 'github-markdown') {
        const { toGitHubMarkdown } = await import('./github-evidence.js')
        console.log(toGitHubMarkdown(evidence))
      } else {
        const { serializeDecisionEvidence } = await import('../core/decision-evidence.js')
        console.log(serializeDecisionEvidence(evidence))
      }
      break
    }
    case 'turn-close': {
      const outcome = getArg('--outcome') as 'docs-updated' | 'no-change'
      const reason = getArg('--reason')
      if (!outcome) throw new Error('Missing --outcome')
      if (outcome === 'no-change' && !reason) {
        throw new Error('--reason required for no-change outcome')
      }
      await runTurnClose({ repoRoot, outcome, reason, sessionId: getArg('--session-id') })
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
