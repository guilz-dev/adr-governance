import type { HookEntry } from './hook-merge-types.js'

export function isManagedEntry(entry: unknown, marker: string): boolean {
  if (!entry || typeof entry !== 'object') return false
  const command = String((entry as HookEntry).command ?? '')
  const name = String((entry as HookEntry).name ?? '')
  return command.includes(marker) || name.includes('adr-governance')
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

function countManaged(groups: unknown[], marker: string): number {
  let count = 0
  for (const item of groups) {
    if (item && typeof item === 'object' && Array.isArray((item as HookEntry).hooks)) {
      count += (item as { hooks: unknown[] }).hooks.filter((e) => isManagedEntry(e, marker)).length
    } else if (isManagedEntry(item, marker)) {
      count++
    }
  }
  return count
}

/** Preserve matcher wrappers; append managed hooks without flattening existing groups. */
export function mergeNestedHookGroups(
  current: unknown[],
  managedEntries: HookEntry[],
  marker: string,
): { merged: unknown[]; conflict?: string } {
  const groups = Array.isArray(current) ? [...current] : []
  const managedCount = countManaged(groups, marker)
  if (managedCount > 1) {
    return {
      merged: groups,
      conflict: `Multiple managed ADR hook entries found (${managedCount})`,
    }
  }

  let updated = false
  const result = groups.map((item) => {
    if (item && typeof item === 'object' && Array.isArray((item as HookEntry).hooks)) {
      const group = item as Record<string, unknown> & { hooks: HookEntry[] }
      if (!group.hooks.some((entry) => isManagedEntry(entry, marker))) {
        return item
      }
      updated = true
      return {
        ...group,
        hooks: appendUnique(group.hooks, managedEntries) as HookEntry[],
      }
    }
    return item
  })

  if (!updated) {
    const flatManagedIndex = result.findIndex((item) => isManagedEntry(item, marker))
    if (flatManagedIndex >= 0) {
      const flat = result[flatManagedIndex] as HookEntry
      result[flatManagedIndex] = {
        hooks: appendUnique([flat], managedEntries) as HookEntry[],
      }
      updated = true
    } else {
      result.push({ hooks: managedEntries })
    }
  }

  return { merged: result }
}
