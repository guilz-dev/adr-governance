import type { HookEntry } from './hook-merge-types.js'

export function isManagedEntry(entry: unknown, marker: string): boolean {
  if (!entry || typeof entry !== 'object') return false
  const command = String((entry as HookEntry).command ?? '')
  const name = String((entry as HookEntry).name ?? '')
  return command.includes(marker) || name.includes('adr-governance')
}

function replaceManaged(entries: HookEntry[], managed: HookEntry[], marker: string): HookEntry[] {
  return entries.flatMap(entry => isManagedEntry(entry, marker)
    ? managed.map(replacement => ({ ...entry, ...replacement }))
    : [entry])
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

/** Preserve user hooks and wrappers while refreshing the single managed registration. */
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
        hooks: replaceManaged(group.hooks, managedEntries, marker),
      }
    }
    return item
  })

  if (!updated) {
    const flatManagedIndex = result.findIndex((item) => isManagedEntry(item, marker))
    if (flatManagedIndex >= 0) {
      const flat = result[flatManagedIndex] as HookEntry
      result[flatManagedIndex] = {
        hooks: replaceManaged([flat], managedEntries, marker),
      }
      updated = true
    } else {
      result.push({ hooks: managedEntries })
    }
  }

  return { merged: result }
}
