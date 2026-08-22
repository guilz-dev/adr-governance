import { lstat, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

import type { InitPlan, InitPlanOperation } from '../core/types.js'
import { sha256 } from '../core/numbering.js'
import { atomicWriteFile } from '../core/locks.js'
import { mergeJsoncEdits } from './merge-jsonc.js'
import { isPathInsideRepo } from '../core/repository-state.js'

async function assertNoSymlinkInPath(repoRoot: string, relPath: string): Promise<void> {
  const abs = path.resolve(repoRoot, relPath)
  const root = path.resolve(repoRoot)
  let current = path.dirname(abs)

  while (current.startsWith(root)) {
    if (existsSync(current)) {
      const stat = await lstat(current)
      if (stat.isSymbolicLink()) {
        throw new Error(`Symlink in path not allowed: ${path.relative(root, current) || '.'}`)
      }
    }
    if (current === root) break
    current = path.dirname(current)
  }
}

export async function hashFileAt(repoRoot: string, relPath: string): Promise<string | null> {
  await assertNoSymlinkInPath(repoRoot, relPath)
  const abs = path.join(repoRoot, relPath)
  if (!existsSync(abs)) return null
  const stat = await lstat(abs)
  if (stat.isSymbolicLink()) {
    throw new Error(`Symlink paths are not allowed in init plan: ${relPath}`)
  }
  return sha256(await readFile(abs, 'utf8'))
}

export async function validatePlanPaths(repoRoot: string, plan: InitPlan): Promise<string[]> {
  const errors: string[] = []
  for (const op of plan.operations) {
    if (!isPathInsideRepo(repoRoot, op.path) && op.path !== '') {
      errors.push(`Path escapes repository root: ${op.path}`)
    }
    if (op.path.startsWith('/') || op.path.includes('..')) {
      errors.push(`Invalid plan path: ${op.path}`)
    }
    try {
      await assertNoSymlinkInPath(repoRoot, op.path)
    } catch (e) {
      errors.push(String(e))
    }
    const abs = path.join(repoRoot, op.path)
    if (existsSync(abs)) {
      const stat = await lstat(abs)
      if (stat.isSymbolicLink()) {
        errors.push(`Symlink target not allowed: ${op.path}`)
      }
    }
  }
  return errors
}

export async function applyPlanOperations(
  repoRoot: string,
  operations: InitPlanOperation[],
): Promise<void> {
  for (const op of operations) {
    await assertNoSymlinkInPath(repoRoot, op.path)

    if (op.kind === 'create') {
      await assertHashIfExpected(repoRoot, op.path, null)
      await atomicWriteFile(path.join(repoRoot, op.path), op.content)
      continue
    }

    if (op.kind === 'replace-generated') {
      await assertHashIfExpected(repoRoot, op.path, op.expectedCurrentHash)
      await atomicWriteFile(path.join(repoRoot, op.path), op.content)
      continue
    }

    if (op.kind === 'merge-jsonc') {
      await assertHashIfExpected(repoRoot, op.path, op.expectedCurrentHash)
      const abs = path.join(repoRoot, op.path)
      const current = existsSync(abs) ? await readFile(abs, 'utf8') : '{}'
      const merged = mergeJsoncEdits(current, op.edits)
      await atomicWriteFile(abs, merged)
    }
  }
}

async function assertHashIfExpected(
  repoRoot: string,
  relPath: string,
  expected: string | null,
): Promise<void> {
  if (expected === null) return
  const abs = path.join(repoRoot, relPath)
  if (!existsSync(abs)) {
    throw new Error(`Plan hash check failed; file missing: ${relPath}`)
  }
  const actual = await hashFileAt(repoRoot, relPath)
  if (actual !== expected) {
    throw new Error(
      `Plan hash mismatch for ${relPath}. File changed since plan was created; regenerate the plan.`,
    )
  }
}
