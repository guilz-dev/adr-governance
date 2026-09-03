import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

import { validateAdrTransitions } from '../../core/adr-transitions.js'
import { evaluateChangeGate } from '../../core/change-gate.js'
import { parseConfig } from '../../core/config.js'
import {
  buildRefDecisionCorpus,
  hashDecisionCorpus,
} from '../../core/decision-corpus.js'
import { contentHashForFile, parseDecisionEvidence } from '../../core/decision-evidence.js'
import {
  collectValidationIssues,
} from '../../core/validation.js'
import { loadAllAdrs, MANIFEST_PATH } from '../../core/repository-state.js'
import { sha256 } from '../../core/numbering.js'
import type { ParsedAdr } from '../../core/types.js'
import type { ValidationIssue } from '../../core/validation.js'
import { verifyAllRuntimeHookEntries } from '../../installer/hook-merge.js'
import { validateContextLinks } from '../../core/context-links.js'
import { listChangedPaths, readFileAtRef, refExists } from '../git-diff.js'
import { parseGitHubEventFile } from '../github-evidence.js'

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
    const baseIssues = await checkBaseRefDuplicates(repoRoot, resolved.baseRef, adrs, config)
    issues.push(...baseIssues)
    const gateIssues = await checkDecisionAuthority(repoRoot, config, adrs, resolved)
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
  config: Awaited<ReturnType<typeof parseConfig>>['config'],
  headAdrs: ParsedAdr[],
  options: CheckOptions,
): Promise<ValidationIssue[]> {
  if (!options.baseRef || config.changeGate.mode === 'off') return []

  const issues: ValidationIssue[] = []
  const baseRef = options.baseRef

  if (!(await refExists(repoRoot, baseRef))) {
    if (config.changeGate.mode === 'enforce') {
      issues.push({
        severity: 'error',
        code: 'base-ref-unavailable',
        message: `Could not read base ref ${baseRef}`,
      })
    }
    return issues
  }

  const baseAdrs = await loadAdrsAtRef(repoRoot, baseRef, config)
  issues.push(...validateAdrTransitions(baseAdrs, headAdrs))

  let evidence = null
  if (options.evidencePath) {
    try {
      evidence = parseDecisionEvidence(JSON.parse(await readFile(options.evidencePath, 'utf8')))
    } catch (e) {
      issues.push({
        severity: config.changeGate.mode === 'warn' ? 'warning' : 'error',
        code: 'decision-evidence-invalid',
        message: `Could not load evidence: ${String(e)}`,
      })
    }
  } else if (options.githubEventPath) {
    try {
      const event = JSON.parse(await readFile(options.githubEventPath, 'utf8'))
      evidence = parseGitHubEventFile(event)
      if (!evidence) {
        issues.push({
          severity: config.changeGate.mode === 'warn' ? 'warning' : 'error',
          code: 'decision-evidence-required',
          message: 'PR body does not contain a valid adr-governance evidence block',
        })
      }
    } catch (e) {
      issues.push({
        severity: config.changeGate.mode === 'warn' ? 'warning' : 'error',
        code: 'decision-evidence-invalid',
        message: `Could not parse GitHub event: ${String(e)}`,
      })
    }
  }

  const corpus = await buildRefDecisionCorpus(repoRoot, baseRef, config)
  const expectedHash = hashDecisionCorpus(corpus)
  const changedPaths = await listChangedPaths(repoRoot, baseRef)
  const govPaths = await governanceArtifactPaths(repoRoot, baseRef, config, headAdrs, baseAdrs)

  const normalizedChanged = new Set(changedPaths.map((p) => p.replace(/\\/g, '/')))
  const changedProposed = headAdrs.filter((adr) => {
    if (adr.frontmatter.status !== 'proposed') return false
    const normalizedPath = adr.path.replace(/\\/g, '/')
    return normalizedChanged.has(normalizedPath)
  })

  const adrContentHashes = new Map<string, string>()
  for (const adr of headAdrs) {
    if (adr.frontmatter.status !== 'accepted') continue
    const abs = path.join(repoRoot, adr.path)
    if (!existsSync(abs)) continue
    const content = await readFile(abs, 'utf8')
    adrContentHashes.set(adr.id, contentHashForFile(content))
  }

  issues.push(
    ...evaluateChangeGate({
      config,
      changedPaths,
      governancePaths: govPaths,
      changedProposedAdrs: changedProposed,
      adrContentHashes,
      expectedDecisionCorpusHash: expectedHash,
      evidence,
    }),
  )

  return issues
}

async function governanceArtifactPaths(
  repoRoot: string,
  baseRef: string,
  config: Awaited<ReturnType<typeof parseConfig>>['config'],
  headAdrs: ParsedAdr[],
  baseAdrs: ParsedAdr[],
): Promise<string[]> {
  const paths = new Set<string>([
    MANIFEST_PATH,
    config.layout.contextFile,
    config.layout.contextMapFile,
  ])

  for (const adr of [...headAdrs, ...baseAdrs]) {
    paths.add(adr.path.replace(/\\/g, '/'))
  }

  const addManifestFiles = (raw: string | null): void => {
    if (!raw) return
    try {
      const manifest = JSON.parse(raw) as { files?: Record<string, unknown> }
      for (const rel of Object.keys(manifest.files ?? {})) paths.add(rel.replace(/\\/g, '/'))
    } catch {
      // Manifest validity is reported separately; it must not widen the exemption set.
    }
  }

  try {
    addManifestFiles(await readFile(path.join(repoRoot, MANIFEST_PATH), 'utf8'))
  } catch {
    // The manifest may be absent or unreadable in the working tree.
  }
  addManifestFiles(await readFileAtRef(repoRoot, baseRef, MANIFEST_PATH))

  return [...paths]
}

async function loadAdrsAtRef(
  repoRoot: string,
  ref: string,
  config: Awaited<ReturnType<typeof parseConfig>>['config'],
): Promise<ParsedAdr[]> {
  const { parseAdrFromPath } = await import('../../core/validation.js')
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const exec = promisify(execFile)

  const adrs: ParsedAdr[] = []
  try {
    const { stdout } = await exec('git', ['ls-tree', '-r', '--name-only', ref], {
      cwd: repoRoot,
    })
    for (const file of stdout.split('\n').filter(Boolean)) {
      if (!file.endsWith('.md') || file.endsWith('/README.md')) continue
      let kind: 'accepted' | 'proposed' | null = null
      if (file.startsWith(`${config.layout.acceptedDir}/`)) kind = 'accepted'
      else if (
        (config.layout.mode === 'split' ||
          config.layout.acceptedDir !== config.layout.proposedDir) &&
        file.startsWith(`${config.layout.proposedDir}/`)
      ) {
        kind = 'proposed'
      }
      if (!kind) continue
      const content = await readFileAtRef(repoRoot, ref, file)
      if (!content) continue
      const parsed = parseAdrFromPath(file, content, kind, config)
      if (parsed) adrs.push(parsed)
    }
  } catch {
    return []
  }

  return adrs.sort((a, b) => a.number - b.number)
}

async function checkBaseRefDuplicates(
  repoRoot: string,
  baseRef: string,
  currentAdrs: ParsedAdr[],
  config: Awaited<ReturnType<typeof parseConfig>>['config'],
): Promise<ValidationIssue[]> {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const exec = promisify(execFile)
  const issues: ValidationIssue[] = []

  const byNumber = new Map<number, ParsedAdr[]>()
  for (const adr of currentAdrs) {
    const group = byNumber.get(adr.number) ?? []
    group.push(adr)
    byNumber.set(adr.number, group)
  }
  for (const [number, group] of byNumber) {
    if (group.length > 1) {
      issues.push({
        severity: 'error',
        code: 'duplicate-number',
        message: `Duplicate ADR number ${number} in current tree: ${group.map((a) => a.path).join(', ')}`,
      })
    }
  }

  try {
    const { stdout } = await exec('git', ['ls-tree', '-r', '--name-only', baseRef], {
      cwd: repoRoot,
    })
    const baseByNumber = new Map<number, string[]>()
    for (const file of stdout.split('\n').filter((f) => /\d{4}-.+\.md$/.test(f))) {
      const match = /(\d{4})-/.exec(file)
      if (!match) continue
      const num = Number.parseInt(match[1] ?? '0', 10)
      const list = baseByNumber.get(num) ?? []
      list.push(file)
      baseByNumber.set(num, list)
    }

    for (const [num, baseFiles] of baseByNumber) {
      const current = byNumber.get(num) ?? []
      if (current.length === 0) continue
      const baseNames = new Set(baseFiles.map((f) => f.split('/').pop()))
      const currentNames = new Set(current.map((a) => a.path.split('/').pop()))
      const overlap = [...baseNames].some((n) => currentNames.has(n))
      if (!overlap && current.length > 0) {
        issues.push({
          severity: 'error',
          code: 'base-ref-number-collision',
          message: `ADR number ${num} reused with different slug between ${baseRef} and current branch`,
        })
      }
    }
  } catch {
    if (config.changeGate.mode === 'enforce') {
      issues.push({
        severity: 'error',
        code: 'base-ref-unavailable',
        message: `Could not compare against ${baseRef}`,
      })
    } else {
      issues.push({
        severity: 'warning',
        code: 'base-ref-unavailable',
        message: `Could not compare against ${baseRef}`,
      })
    }
  }

  return issues
}
