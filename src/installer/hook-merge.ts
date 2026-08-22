import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

import { atomicWriteFile } from '../core/locks.js'
import { sha256 } from '../core/numbering.js'

export const MANAGED_MARKER = 'adr-governance.mjs'

export type HookMergeResult = {
  path: string
  merged: boolean
  conflict?: string
}

type HookEntry = Record<string, unknown>

function isManagedEntry(entry: unknown): boolean {
  if (!entry || typeof entry !== 'object') return false
  const command = String((entry as HookEntry).command ?? '')
  const name = String((entry as HookEntry).name ?? '')
  return command.includes(MANAGED_MARKER) || name.includes('adr-governance')
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
  return entries.filter(isManagedEntry).length
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

export async function mergeCursorHooks(repoRoot: string): Promise<HookMergeResult> {
  const rel = '.cursor/hooks.json'
  const abs = path.join(repoRoot, rel)
  const managed = {
    sessionStart: [{ command: 'node .cursor/hooks/adr-governance.mjs session-start' }],
    beforeSubmitPrompt: [{ command: 'node .cursor/hooks/adr-governance.mjs before-turn' }],
    stop: [{ command: 'node .cursor/hooks/adr-governance.mjs after-turn', loop_limit: 1 }],
  }

  if (!existsSync(abs)) {
    const content = JSON.stringify({ version: 1, hooks: managed }, null, 2) + '\n'
    await atomicWriteFile(abs, content)
    return { path: rel, merged: true }
  }

  const raw = await readFile(abs, 'utf8')
  const doc = JSON.parse(raw) as { version?: number; hooks?: Record<string, unknown[]> }
  const hooks = doc.hooks ?? {}

  for (const [key, entries] of Object.entries(managed)) {
    const current = hooks[key] ?? []
    const { merged, conflict } = mergeHookArrays(current, entries)
    if (conflict) return { path: rel, merged: false, conflict }
    hooks[key] = merged as unknown[]
  }

  doc.hooks = hooks
  await atomicWriteFile(abs, JSON.stringify(doc, null, 2) + '\n')
  return { path: rel, merged: true }
}

export async function mergeClaudeHooks(repoRoot: string): Promise<HookMergeResult> {
  const rel = '.claude/settings.json'
  const abs = path.join(repoRoot, rel)
  const entry = (phase: string) => ({
    hooks: [
      {
        type: 'command',
        command: `node "\${CLAUDE_PROJECT_DIR}/.claude/hooks/adr-governance.mjs" ${phase}`,
      },
    ],
  })

  const managedKeys = {
    UserPromptSubmit: entry('before-turn'),
    Stop: entry('after-turn'),
  }

  if (!existsSync(abs)) {
    const content =
      JSON.stringify({ hooks: managedKeys }, null, 2) + '\n'
    await atomicWriteFile(abs, content)
    return { path: rel, merged: true }
  }

  const raw = await readFile(abs, 'utf8')
  const doc = JSON.parse(raw) as { hooks?: Record<string, unknown[]> }
  const hooks = doc.hooks ?? {}

  for (const [key, value] of Object.entries(managedKeys)) {
    const current = hooks[key] ?? []
    const managedEntries = (value as { hooks: HookEntry[] }).hooks
    const flat = Array.isArray(current) ? current : []
    const inner = flat.flatMap((item) => {
      if (item && typeof item === 'object' && Array.isArray((item as HookEntry).hooks)) {
        return (item as { hooks: HookEntry[] }).hooks
      }
      return [item as HookEntry]
    })
    const { merged, conflict } = mergeHookArrays(inner, managedEntries)
    if (conflict) return { path: rel, merged: false, conflict }
    hooks[key] = [{ hooks: merged }]
  }

  doc.hooks = hooks
  await atomicWriteFile(abs, JSON.stringify(doc, null, 2) + '\n')
  return { path: rel, merged: true }
}

export async function mergeCodexHooks(repoRoot: string): Promise<HookMergeResult> {
  const rel = '.codex/hooks.json'
  const abs = path.join(repoRoot, rel)
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

  const managedKeys = {
    UserPromptSubmit: wrap('before-turn'),
    Stop: wrap('after-turn'),
  }

  if (!existsSync(abs)) {
    await atomicWriteFile(abs, JSON.stringify({ hooks: managedKeys }, null, 2) + '\n')
    return { path: rel, merged: true }
  }

  const raw = await readFile(abs, 'utf8')
  const doc = JSON.parse(raw) as { hooks?: Record<string, unknown[]> }
  const hooks = doc.hooks ?? {}

  for (const [key, value] of Object.entries(managedKeys)) {
    const current = hooks[key] ?? []
    const managedEntries = (value as { hooks: HookEntry[] }).hooks
    const flat = Array.isArray(current) ? current : []
    const inner = flat.flatMap((item) => {
      if (item && typeof item === 'object' && Array.isArray((item as HookEntry).hooks)) {
        return (item as { hooks: HookEntry[] }).hooks
      }
      return [item as HookEntry]
    })
    const { merged, conflict } = mergeHookArrays(inner, managedEntries)
    if (conflict) return { path: rel, merged: false, conflict }
    hooks[key] = [{ hooks: merged }]
  }

  doc.hooks = hooks
  await atomicWriteFile(abs, JSON.stringify(doc, null, 2) + '\n')
  return { path: rel, merged: true }
}

export async function mergeGeminiHooks(repoRoot: string): Promise<HookMergeResult> {
  const rel = '.gemini/settings.json'
  const abs = path.join(repoRoot, rel)
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

  const managedKeys = {
    BeforeAgent: entry('adr-governance-before-turn', 'before-turn'),
    AfterAgent: entry('adr-governance-after-turn', 'after-turn'),
  }

  if (!existsSync(abs)) {
    await atomicWriteFile(abs, JSON.stringify({ hooks: managedKeys }, null, 2) + '\n')
    return { path: rel, merged: true }
  }

  const raw = await readFile(abs, 'utf8')
  const doc = JSON.parse(raw) as { hooks?: Record<string, unknown[]> }
  const hooks = doc.hooks ?? {}

  for (const [key, value] of Object.entries(managedKeys)) {
    const current = hooks[key] ?? []
    const managedEntries = (value as { hooks: HookEntry[] }).hooks
    const flat = Array.isArray(current) ? current : []
    const inner = flat.flatMap((item) => {
      if (item && typeof item === 'object' && Array.isArray((item as HookEntry).hooks)) {
        return (item as { hooks: HookEntry[] }).hooks
      }
      return [item as HookEntry]
    })
    const { merged, conflict } = mergeHookArrays(inner, managedEntries)
    if (conflict) return { path: rel, merged: false, conflict }
    hooks[key] = [{ hooks: merged }]
  }

  doc.hooks = hooks
  await atomicWriteFile(abs, JSON.stringify(doc, null, 2) + '\n')
  return { path: rel, merged: true }
}

export async function mergeAllRuntimeHooks(repoRoot: string): Promise<HookMergeResult[]> {
  return [
    await mergeCursorHooks(repoRoot),
    await mergeClaudeHooks(repoRoot),
    await mergeCodexHooks(repoRoot),
    await mergeGeminiHooks(repoRoot),
  ]
}

export async function verifyCursorHookEntries(repoRoot: string): Promise<string[]> {
  const abs = path.join(repoRoot, '.cursor/hooks.json')
  if (!existsSync(abs)) return ['Missing .cursor/hooks.json ADR hook registration']
  const raw = await readFile(abs, 'utf8')
  const doc = JSON.parse(raw) as { hooks?: Record<string, unknown[]> }
  const required = ['sessionStart', 'beforeSubmitPrompt', 'stop'] as const
  const issues: string[] = []
  for (const key of required) {
    const entries = doc.hooks?.[key] ?? []
    const hasManaged = entries.some(isManagedEntry)
    if (!hasManaged) issues.push(`Missing managed ADR hook in .cursor/hooks.json hooks.${key}`)
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
