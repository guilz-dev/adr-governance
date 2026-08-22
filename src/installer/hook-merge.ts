import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

import type { InitPlanOperation } from '../core/types.js'
import { atomicWriteFile } from '../core/locks.js'
import { sha256 } from '../core/numbering.js'
import { MANAGED_MARKER, type HookEntry } from './hook-merge-types.js'
import { isManagedEntry, mergeNestedHookGroups } from './nested-hook-merge.js'
import { hashFileAt } from './apply-plan.js'

export { MANAGED_MARKER } from './hook-merge-types.js'

export type HookMergeResult = {
  path: string
  merged: boolean
  conflict?: string
}

export type HookMergePreview = {
  path: string
  content: string
  conflict?: string
}

const CURSOR_MANAGED = {
  sessionStart: [{ command: 'node .cursor/hooks/adr-governance.mjs session-start' }],
  beforeSubmitPrompt: [{ command: 'node .cursor/hooks/adr-governance.mjs before-turn' }],
  stop: [{ command: 'node .cursor/hooks/adr-governance.mjs after-turn', loop_limit: 1 }],
}

function entryKey(entry: HookEntry): string {
  return JSON.stringify(entry)
}

function appendUnique(entries: unknown[], toAdd: HookEntry[]): unknown[] {
  const result = [...entries]
  const keys = new Set(entries.map((e) => entryKey(e as HookEntry)))
  for (const item of toAdd) {
    const key = entryKey(item)
    if (!keys.has(key)) {
      result.push(item)
      keys.add(key)
    }
  }
  return result
}

function countManaged(entries: unknown[]): number {
  return entries.filter((e) => isManagedEntry(e, MANAGED_MARKER)).length
}

function mergeHookArrays(existing: unknown[], managed: HookEntry[]): {
  merged: unknown[]
  conflict?: string
} {
  const managedCount = countManaged(existing)
  if (managedCount > 1) {
    return {
      merged: existing,
      conflict: `Multiple managed ADR hook entries found (${managedCount})`,
    }
  }
  return { merged: appendUnique(existing, managed) }
}

export function previewCursorHooksMerge(raw: string | null): HookMergePreview {
  const rel = '.cursor/hooks.json'
  if (!raw) {
    return {
      path: rel,
      content: JSON.stringify({ version: 1, hooks: CURSOR_MANAGED }, null, 2) + '\n',
    }
  }

  const doc = JSON.parse(raw) as { version?: number; hooks?: Record<string, unknown[]> }
  const hooks = doc.hooks ?? {}

  for (const [key, entries] of Object.entries(CURSOR_MANAGED)) {
    const current = hooks[key] ?? []
    const { merged, conflict } = mergeHookArrays(current, entries)
    if (conflict) return { path: rel, content: raw, conflict }
    hooks[key] = merged as unknown[]
  }

  doc.hooks = hooks
  return { path: rel, content: JSON.stringify(doc, null, 2) + '\n' }
}

function previewNestedRuntimeHooksMerge(
  rel: string,
  raw: string | null,
  managedKeys: Record<string, { hooks: HookEntry[] }>,
  emptyDoc: Record<string, unknown>,
): HookMergePreview {
  if (!raw) {
    return {
      path: rel,
      content: JSON.stringify({ ...emptyDoc, hooks: managedKeys }, null, 2) + '\n',
    }
  }

  const doc = JSON.parse(raw) as { hooks?: Record<string, unknown[]> }
  const hooks = doc.hooks ?? {}

  for (const [key, value] of Object.entries(managedKeys)) {
    const current = hooks[key] ?? []
    const flat = Array.isArray(current) ? current : []
    const { merged, conflict } = mergeNestedHookGroups(flat, value.hooks, MANAGED_MARKER)
    if (conflict) return { path: rel, content: raw, conflict }
    hooks[key] = merged
  }

  doc.hooks = hooks
  return { path: rel, content: JSON.stringify(doc, null, 2) + '\n' }
}

function claudeManagedKeys(): Record<string, { hooks: HookEntry[] }> {
  const entry = (phase: string) => ({
    hooks: [
      {
        type: 'command',
        command: `node "\${CLAUDE_PROJECT_DIR}/.claude/hooks/adr-governance.mjs" ${phase}`,
      },
    ],
  })
  return {
    UserPromptSubmit: entry('before-turn'),
    Stop: entry('after-turn'),
  }
}

function codexManagedKeys(): Record<string, { hooks: HookEntry[] }> {
  const wrap = (phase: string) => ({
    hooks: [
      {
        type: 'command',
        command: `node "$(git rev-parse --show-toplevel)/.codex/hooks/adr-governance.mjs" ${phase}`,
        commandWindows: `powershell.exe -NoProfile -Command "$r=(git rev-parse --show-toplevel); node \\"$r/.codex/hooks/adr-governance.mjs\\" ${phase}"`,
        timeout: 2,
      },
    ],
  })
  return {
    UserPromptSubmit: wrap('before-turn'),
    Stop: wrap('after-turn'),
  }
}

function geminiManagedKeys(): Record<string, { hooks: HookEntry[] }> {
  const entry = (name: string, phase: string) => ({
    hooks: [
      {
        name,
        type: 'command',
        command: `node "$GEMINI_PROJECT_DIR/.gemini/hooks/adr-governance.mjs" ${phase}`,
        timeout: 2000,
      },
    ],
  })
  return {
    BeforeAgent: entry('adr-governance-before-turn', 'before-turn'),
    AfterAgent: entry('adr-governance-after-turn', 'after-turn'),
  }
}

export function previewClaudeHooksMerge(raw: string | null): HookMergePreview {
  return previewNestedRuntimeHooksMerge('.claude/settings.json', raw, claudeManagedKeys(), {})
}

export function previewCodexHooksMerge(raw: string | null): HookMergePreview {
  return previewNestedRuntimeHooksMerge('.codex/hooks.json', raw, codexManagedKeys(), {})
}

export function previewGeminiHooksMerge(raw: string | null): HookMergePreview {
  return previewNestedRuntimeHooksMerge('.gemini/settings.json', raw, geminiManagedKeys(), {})
}

export async function buildHookMergePlanOperations(repoRoot: string): Promise<InitPlanOperation[]> {
  const previews = [
    previewCursorHooksMerge(
      existsSync(path.join(repoRoot, '.cursor/hooks.json'))
        ? await readFile(path.join(repoRoot, '.cursor/hooks.json'), 'utf8')
        : null,
    ),
    previewClaudeHooksMerge(
      existsSync(path.join(repoRoot, '.claude/settings.json'))
        ? await readFile(path.join(repoRoot, '.claude/settings.json'), 'utf8')
        : null,
    ),
    previewCodexHooksMerge(
      existsSync(path.join(repoRoot, '.codex/hooks.json'))
        ? await readFile(path.join(repoRoot, '.codex/hooks.json'), 'utf8')
        : null,
    ),
    previewGeminiHooksMerge(
      existsSync(path.join(repoRoot, '.gemini/settings.json'))
        ? await readFile(path.join(repoRoot, '.gemini/settings.json'), 'utf8')
        : null,
    ),
  ]

  const operations: InitPlanOperation[] = []
  for (const preview of previews) {
    if (preview.conflict) {
      throw new Error(`${preview.path}: ${preview.conflict}`)
    }
    const expected = await hashFileAt(repoRoot, preview.path).catch(() => null)
    if (expected === null) {
      operations.push({ kind: 'create', path: preview.path, content: preview.content })
    } else {
      operations.push({
        kind: 'replace-generated',
        path: preview.path,
        expectedCurrentHash: expected,
        content: preview.content,
      })
    }
  }
  return operations
}

export async function mergeCursorHooks(repoRoot: string): Promise<HookMergeResult> {
  const rel = '.cursor/hooks.json'
  const abs = path.join(repoRoot, rel)
  const raw = existsSync(abs) ? await readFile(abs, 'utf8') : null
  const preview = previewCursorHooksMerge(raw)
  if (preview.conflict) return { path: rel, merged: false, conflict: preview.conflict }
  await atomicWriteFile(abs, preview.content)
  return { path: rel, merged: true }
}

async function mergeNestedRuntimeHooks(
  repoRoot: string,
  rel: string,
  preview: HookMergePreview,
): Promise<HookMergeResult> {
  if (preview.conflict) return { path: rel, merged: false, conflict: preview.conflict }
  await atomicWriteFile(path.join(repoRoot, rel), preview.content)
  return { path: rel, merged: true }
}

export async function mergeClaudeHooks(repoRoot: string): Promise<HookMergeResult> {
  const rel = '.claude/settings.json'
  const abs = path.join(repoRoot, rel)
  const raw = existsSync(abs) ? await readFile(abs, 'utf8') : null
  return mergeNestedRuntimeHooks(repoRoot, rel, previewClaudeHooksMerge(raw))
}

export async function mergeCodexHooks(repoRoot: string): Promise<HookMergeResult> {
  const rel = '.codex/hooks.json'
  const abs = path.join(repoRoot, rel)
  const raw = existsSync(abs) ? await readFile(abs, 'utf8') : null
  return mergeNestedRuntimeHooks(repoRoot, rel, previewCodexHooksMerge(raw))
}

export async function mergeGeminiHooks(repoRoot: string): Promise<HookMergeResult> {
  const rel = '.gemini/settings.json'
  const abs = path.join(repoRoot, rel)
  const raw = existsSync(abs) ? await readFile(abs, 'utf8') : null
  return mergeNestedRuntimeHooks(repoRoot, rel, previewGeminiHooksMerge(raw))
}

export async function mergeAllRuntimeHooks(repoRoot: string): Promise<HookMergeResult[]> {
  return [
    await mergeCursorHooks(repoRoot),
    await mergeClaudeHooks(repoRoot),
    await mergeCodexHooks(repoRoot),
    await mergeGeminiHooks(repoRoot),
  ]
}

type RuntimeHookSpec = {
  rel: string
  keys: string[]
}

const RUNTIME_HOOKS: RuntimeHookSpec[] = [
  { rel: '.cursor/hooks.json', keys: ['sessionStart', 'beforeSubmitPrompt', 'stop'] },
  { rel: '.claude/settings.json', keys: ['UserPromptSubmit', 'Stop'] },
  { rel: '.codex/hooks.json', keys: ['UserPromptSubmit', 'Stop'] },
  { rel: '.gemini/settings.json', keys: ['BeforeAgent', 'AfterAgent'] },
]

function nestedEntriesHaveManaged(entries: unknown[]): boolean {
  for (const item of entries) {
    if (item && typeof item === 'object' && Array.isArray((item as HookEntry).hooks)) {
      if ((item as { hooks: unknown[] }).hooks.some((e) => isManagedEntry(e, MANAGED_MARKER))) {
        return true
      }
    } else if (isManagedEntry(item, MANAGED_MARKER)) {
      return true
    }
  }
  return false
}

function verifyRuntimeHookFile(spec: RuntimeHookSpec, raw: string): string[] {
  const issues: string[] = []
  const doc = JSON.parse(raw) as { hooks?: Record<string, unknown[]> }
  for (const key of spec.keys) {
    const entries = doc.hooks?.[key] ?? []
    if (!nestedEntriesHaveManaged(entries)) {
      issues.push(`Missing managed ADR hook in ${spec.rel} hooks.${key}`)
    }
  }
  return issues
}

export async function verifyCursorHookEntries(repoRoot: string): Promise<string[]> {
  return verifyAllRuntimeHookEntries(repoRoot)
}

export async function verifyAllRuntimeHookEntries(repoRoot: string): Promise<string[]> {
  const issues: string[] = []
  for (const spec of RUNTIME_HOOKS) {
    const abs = path.join(repoRoot, spec.rel)
    if (!existsSync(abs)) {
      issues.push(`Missing ${spec.rel} ADR hook registration`)
      continue
    }
    const raw = await readFile(abs, 'utf8')
    issues.push(...verifyRuntimeHookFile(spec, raw))
  }
  return issues
}

export async function detectGeneratedFileConflict(
  repoRoot: string,
  relPath: string,
  expectedHash: string | null,
): Promise<string | null> {
  const abs = path.join(repoRoot, relPath)
  if (!existsSync(abs)) return null
  if (!expectedHash) return null
  const actual = sha256(await readFile(abs, 'utf8'))
  if (actual !== expectedHash) {
    return `Hand-edited generated file conflict: ${relPath}`
  }
  return null
}
