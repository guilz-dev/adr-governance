import { describe, expect, it } from 'vitest'
import { mergeNestedHookGroups } from '../../src/installer/nested-hook-merge.js'
import { MANAGED_MARKER } from '../../src/installer/hook-merge-types.js'

describe('managed hook registration upgrades', () => {
  it.each(['nested', 'flat'])('replaces an obsolete %s registration and remains idempotent', shape => {
    const old = { type: 'command', command: 'node .codex/hooks/adr-governance.mjs after-turn', timeout: 2, userSetting: true }
    const user = { type: 'command', command: 'echo user hook' }
    const current = shape === 'nested' ? [{ matcher: 'custom', hooks: [user, old] }] : [user, old]
    const managed = [{ type: 'command', command: 'node .codex/hooks/adr-governance.mjs after-turn', timeout: 3 }]

    const first = mergeNestedHookGroups(current, managed, MANAGED_MARKER)
    expect(first.conflict).toBeUndefined()
    const allHooks = first.merged.flatMap(group => {
      const entry = group as Record<string, unknown>
      return Array.isArray(entry.hooks) ? entry.hooks : [entry]
    })
    expect(allHooks).toEqual([user, { ...old, timeout: 3 }])
    if (shape === 'nested') expect(first.merged[0]).toMatchObject({ matcher: 'custom' })
    const second = mergeNestedHookGroups(first.merged, managed, MANAGED_MARKER)
    expect(second.conflict).toBeUndefined()
    expect(second.merged).toEqual(first.merged)
  })
})
