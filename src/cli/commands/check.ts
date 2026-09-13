import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

import { validateAdrTransitions } from '../../core/adr-transitions.js'
import { evaluateChangeGate, nonGovernancePaths } from '../../core/change-gate.js'
import { parseConfig } from '../../core/config.js'
import {
  BaseRefUnavailableError,
  buildRefDecisionCorpus,
  hashDecisionCorpus,
} from '../../core/decision-corpus.js'
import { buildChangeSet } from '../../core/change-set.js'
import { contentHashForFile, parseDecisionEvidence } from '../../core/decision-evidence.js'
import {
  collectValidationIssues,
} from '../../core/validation.js'
import { adrDirectoryKind, loadAllAdrs, MANIFEST_PATH } from '../../core/repository-state.js'
import { sha256 } from '../../core/numbering.js'
import type { ParsedAdr } from '../../core/types.js'
import type { ValidationIssue } from '../../core/validation.js'
import { verifyAllRuntimeHookEntries } from '../../installer/hook-merge.js'
import { validateContextLinks } from '../../core/context-links.js'
import { readFileAtRef, refExists, resolveCommit } from '../git-diff.js'
import { parseGitHubEventEvidence } from '../github-evidence.js'
import { readBasePolicy } from '../../core/base-policy.js'
import { isUserManagedFile } from '../../installer/generated-files.js'

export type CheckOptions = {
  baseRef?: string
  evidencePath?: string
  githubEventPath?: string
}

export type CheckResult = {
  ok: boolean
  exitCode: number
  issues: Array<{ severity: string; code: string; message: string; path?: string }>
}

export async function runCheck(
  repoRoot: string,
  options?: string | CheckOptions,
): Promise<CheckResult> {
  const resolved: CheckOptions =
    typeof options === 'string' ? { baseRef: options } : (options ?? {})
  if (resolved.evidencePath && resolved.githubEventPath) {
    return {
      ok: false,
      exitCode: 2,
      issues: [
        {
          severity: 'error',
          code: 'invalid-check-options',
          message: 'Specify only one of --evidence or --github-event',
        },
      ],
    }
  }

  const configPath = path.join(repoRoot, 'adr.config.json')
  if (!existsSync(configPath)) {
    return {
      ok: false,
      exitCode: 2,
      issues: [{ severity: 'error', code: 'missing-config', message: 'Run init first' }],
    }
  }

  let config
  let configWarnings: string[] = []
  try {
    const parsed = parseConfig(JSON.parse(await readFile(configPath, 'utf8')))
    config = parsed.config
    configWarnings = parsed.warnings
  } catch (e) {
    return {
      ok: false,
      exitCode: 2,
      issues: [{ severity: 'error', code: 'invalid-config', message: String(e) }],
    }
  }

  const adrs = await loadAllAdrs(repoRoot, config)

  const issues = collectValidationIssues(adrs, config)

  for (const warning of configWarnings) {
    issues.push({ severity: 'warning', code: 'unknown-config-key', message: warning })
  }

  const contextPaths = [config.layout.contextFile, config.layout.contextMapFile]
  for (const ctxFile of await listContextFiles(repoRoot, contextPaths)) {
    const linkIssues = await validateContextLinks(repoRoot, [ctxFile])
    for (const issue of linkIssues) {
      issues.push({
        severity: 'error',
        code: 'broken-context-link',
        message: issue.message,
        path: issue.path,
      })
    }
  }

  const manifestPath = path.join(repoRoot, MANIFEST_PATH)
  if (existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
        files?: Record<string, string>
      }
      for (const [rel, expectedHash] of Object.entries(manifest.files ?? {})) {
        if (isUserManagedFile(rel)) continue
        const abs = path.join(repoRoot, rel)
        if (!existsSync(abs)) {
          issues.push({
            severity: 'error',
            code: 'manifest-missing-file',
            message: `Manifest file missing: ${rel}`,
            path: rel,
          })
          continue
        }
        const actual = sha256(await readFile(abs, 'utf8'))
        if (actual !== expectedHash) {
          issues.push({
            severity: 'error',
            code: 'manifest-drift',
            message: `Generated file drift: ${rel}. Run sync.`,
            path: rel,
          })
        }
      }
    } catch {
      issues.push({
        severity: 'error',
        code: 'invalid-manifest',
        message: 'Could not parse manifest.json',
      })
    }
  }

  if (resolved.baseRef) {
    const gateIssues = await checkDecisionAuthority(repoRoot, config, resolved)
    issues.push(...gateIssues)
  }

  for (const message of await verifyAllRuntimeHookEntries(repoRoot)) {
    if (existsSync(manifestPath)) {
      issues.push({
        severity: 'error',
        code: 'missing-hook-entry',
        message,
      })
    }
  }

  const errors = issues.filter((i) => i.severity === 'error')
  return {
    ok: errors.length === 0,
    exitCode: errors.length > 0 ? 1 : 0,
    issues,
  }
}

async function listContextFiles(repoRoot: string, candidates: string[]): Promise<string[]> {
  const paths: string[] = []
  for (const candidate of candidates) {
    if (existsSync(path.join(repoRoot, candidate))) paths.push(candidate)
  }
  return [...new Set(paths)]
}

async function checkDecisionAuthority(
  repoRoot: string,
  headConfig: ReturnType<typeof parseConfig>['config'],
  options: CheckOptions,
): Promise<ValidationIssue[]> {
  if (!options.baseRef) return []
  if (!(await refExists(repoRoot, options.baseRef))) {
    return [{
      severity: headConfig.changeGate.mode === 'enforce' ? 'error' : 'warning',
      code: 'base-ref-unavailable',
      message: `Could not read base ref ${options.baseRef}`,
    }]
  }

  let config
  let baseRef: string
  try {
    baseRef = await resolveCommit(repoRoot, options.baseRef)
    config = await readBasePolicy(repoRoot, baseRef)
  } catch (error) {
    return [{ severity: 'error', code: 'base-policy-unavailable', message: `Cannot evaluate trusted base policy: ${String(error)}` }]
  }
  const severity = config.changeGate.mode === 'enforce' ? 'error' : 'warning'
  const issues: ValidationIssue[] = []

  try {
    const baseAdrs = await loadAdrsAtRef(repoRoot, baseRef, config)
    const headAdrs = await loadAllAdrs(repoRoot, config)
    issues.push(...checkBaseRefDuplicates(baseAdrs, headAdrs, baseRef))
    if (config.changeGate.mode === 'off') return issues
    issues.push(...validateAdrTransitions(baseAdrs, headAdrs, config.promotion.requireHumanAcceptance))

    // Build one snapshot for both classification and evidence freshness.
    const changeSet = await buildChangeSet(repoRoot, baseRef)
    const changedPaths = changeSet.entries.map(entry => entry.path)
    const govPaths = await governanceArtifactPaths(repoRoot, baseRef, config, headAdrs, baseAdrs)
    if (nonGovernancePaths(changedPaths, govPaths, config).length === 0) return issues

    let evidence = null
    try {
      if (options.evidencePath) {
        evidence = parseDecisionEvidence(JSON.parse(await readFile(options.evidencePath, 'utf8')))
      } else if (options.githubEventPath) {
        evidence = parseGitHubEventEvidence(JSON.parse(await readFile(options.githubEventPath, 'utf8')))
      }
    } catch (error) {
      issues.push({ severity, code: 'decision-evidence-invalid', message: `Could not load decision evidence: ${String(error)}` })
      return issues
    }

    const corpus = await buildRefDecisionCorpus(repoRoot, baseRef, config)
    const changed = new Set(changedPaths)
    const changedProposed = headAdrs.filter(adr => adr.frontmatter.status === 'proposed' && changed.has(adr.path))
    const adrContentHashes = new Map<string, string>()
    for (const adr of headAdrs) {
      if (adr.frontmatter.status !== 'accepted') continue
      adrContentHashes.set(adr.id, contentHashForFile(await readFile(path.join(repoRoot, adr.path), 'utf8')))
    }

    issues.push(...evaluateChangeGate({
      config,
      changedPaths,
      governancePaths: govPaths,
      changedProposedAdrs: changedProposed,
      adrContentHashes,
      expectedDecisionCorpusHash: hashDecisionCorpus(corpus),
      resolvedBaseCommit: baseRef,
      currentChangeSetDigest: changeSet.digest,
      evidence,
    }))
  } catch (error) {
    issues.push({ severity, code: 'base-ref-unavailable', message: `Could not validate comparison with base ${baseRef}: ${String(error)}` })
  }
  return issues
}

async function governanceArtifactPaths(
  repoRoot: string,
  baseRef: string,
  config: ReturnType<typeof parseConfig>['config'],
  headAdrs: ParsedAdr[],
  baseAdrs: ParsedAdr[],
): Promise<string[]> {
  const paths = new Set([MANIFEST_PATH, config.layout.contextFile, config.layout.contextMapFile])
  for (const adr of [...headAdrs, ...baseAdrs]) paths.add(adr.path)

  // Only reviewed base entries may grant exemptions. Policy and executable
  // governance code must still carry evidence when changed.
  const raw = await readFileAtRef(repoRoot, baseRef, MANIFEST_PATH)
  if (raw !== null) {
    const manifest = JSON.parse(raw) as { files?: Record<string, unknown> }
    for (const rel of Object.keys(manifest.files ?? {})) {
      if (isUserManagedFile(rel) || rel.startsWith('.adr-governance/bin/') || /^\.(cursor|claude|codex|gemini)\/hooks\//.test(rel)) continue
      paths.add(rel)
    }
  }
  return [...paths]
}

async function loadAdrsAtRef(
  repoRoot: string,
  ref: string,
  config: ReturnType<typeof parseConfig>['config'],
): Promise<ParsedAdr[]> {
  const { parseAdrFromPath } = await import('../../core/validation.js')
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const { stdout } = await promisify(execFile)('git', ['ls-tree', '-r', '--name-only', '-z', ref], { cwd: repoRoot, maxBuffer: 10 * 1024 * 1024 })
  const adrs: ParsedAdr[] = []
  for (const file of stdout.split('\0').filter(Boolean)) {
    if (!file.endsWith('.md') || file.endsWith('/README.md')) continue
    const kind = adrDirectoryKind(file, config)
    if (!kind) continue
    const content = await readFileAtRef(repoRoot, ref, file)
    if (content === null) throw new BaseRefUnavailableError(ref)
    const parsed = parseAdrFromPath(file, content, kind, config)
    if (parsed) adrs.push(parsed)
  }
  return adrs.sort((a, b) => a.number - b.number)
}

function checkBaseRefDuplicates(baseAdrs: ParsedAdr[], currentAdrs: ParsedAdr[], baseRef: string): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const baseByNumber = new Map<number, Set<string>>()
  for (const adr of baseAdrs) {
    const slugs = baseByNumber.get(adr.number) ?? new Set<string>()
    slugs.add(adr.slug)
    baseByNumber.set(adr.number, slugs)
  }
  const currentByNumber = new Map<number, Set<string>>()
  for (const adr of currentAdrs) {
    const slugs = currentByNumber.get(adr.number) ?? new Set<string>()
    slugs.add(adr.slug)
    currentByNumber.set(adr.number, slugs)
  }
  for (const [number, slugs] of currentByNumber) {
    const baseSlugs = baseByNumber.get(number)
    if (baseSlugs && ![...slugs].some(slug => baseSlugs.has(slug))) {
      issues.push({ severity: 'error', code: 'base-ref-number-collision', message: `ADR number ${number} reused with different slug between ${baseRef} and current branch` })
    }
  }
  return issues
}
