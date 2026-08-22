import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

import { parseConfig } from '../../core/config.js'
import {
  collectValidationIssues,
} from '../../core/validation.js'
import { loadAllAdrs, MANIFEST_PATH } from '../../core/repository-state.js'
import { sha256 } from '../../core/numbering.js'
import type { ParsedAdr } from '../../core/types.js'
import type { ValidationIssue } from '../../core/validation.js'
import { verifyCursorHookEntries } from '../../installer/hook-merge.js'
import { validateContextLinks } from '../../core/context-links.js'

export type CheckResult = {
  ok: boolean
  exitCode: number
  issues: Array<{ severity: string; code: string; message: string; path?: string }>
}

export async function runCheck(repoRoot: string, baseRef?: string): Promise<CheckResult> {
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

  if (baseRef) {
    const baseIssues = await checkBaseRefDuplicates(repoRoot, baseRef, adrs)
    issues.push(...baseIssues)
  }

  for (const message of await verifyCursorHookEntries(repoRoot)) {
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

async function checkBaseRefDuplicates(
  repoRoot: string,
  baseRef: string,
  currentAdrs: ParsedAdr[],
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
    issues.push({
      severity: 'warning',
      code: 'base-ref-unavailable',
      message: `Could not compare against ${baseRef}`,
    })
  }

  return issues
}
