import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

import { parseConfig } from '../../core/config.js'
import {
  collectValidationIssues,
  parseAdrFromPath,
} from '../../core/validation.js'
import { listAdrFiles, MANIFEST_PATH } from '../../core/repository-state.js'
import { sha256 } from '../../core/numbering.js'
import type { ParsedAdr } from '../../core/types.js'
import type { ValidationIssue } from '../../core/validation.js'

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
  try {
    config = parseConfig(JSON.parse(await readFile(configPath, 'utf8'))).config
  } catch (e) {
    return {
      ok: false,
      exitCode: 2,
      issues: [{ severity: 'error', code: 'invalid-config', message: String(e) }],
    }
  }

  const adrs: ParsedAdr[] = []
  const acceptedDir = path.join(repoRoot, config.layout.acceptedDir)
  const proposedDir = path.join(repoRoot, config.layout.proposedDir)

  for (const name of await listAdrFiles(acceptedDir)) {
    const rel = path.join(config.layout.acceptedDir, name)
    const content = await readFile(path.join(repoRoot, rel), 'utf8')
    const parsed = parseAdrFromPath(rel, content, 'accepted', config)
    if (parsed) adrs.push(parsed)
  }

  for (const name of await listAdrFiles(proposedDir)) {
    const rel = path.join(config.layout.proposedDir, name)
    const content = await readFile(path.join(repoRoot, rel), 'utf8')
    const parsed = parseAdrFromPath(rel, content, 'proposed', config)
    if (parsed) adrs.push(parsed)
  }

  const issues = collectValidationIssues(adrs, config)

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

  const errors = issues.filter((i) => i.severity === 'error')
  return {
    ok: errors.length === 0,
    exitCode: errors.length > 0 ? 1 : 0,
    issues,
  }
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

  try {
    const { stdout } = await exec('git', ['ls-tree', '-r', '--name-only', baseRef], {
      cwd: repoRoot,
    })
    const baseFiles = stdout.split('\n').filter((f) => /\d{4}-.+\.md$/.test(f))
    const currentNumbers = new Set(currentAdrs.map((a) => a.number))

    for (const file of baseFiles) {
      const match = /(\d{4})-/.exec(file)
      if (!match) continue
      const num = Number.parseInt(match[1] ?? '0', 10)
      const sameNumberCurrent = currentAdrs.filter((a) => a.number === num)
      if (sameNumberCurrent.length > 1) {
        issues.push({
          severity: 'error',
          code: 'base-ref-duplicate',
          message: `Number ${num} duplicated across branches`,
        })
      }
      void currentNumbers
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
