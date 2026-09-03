import { describe, expect, it } from 'vitest'

import { validateAdrTransitions } from '../../src/core/adr-transitions.js'
import type { AdrFrontmatter, AdrStatus, ParsedAdr } from '../../src/core/types.js'

function adr(
  id: string,
  status: AdrStatus,
  fields: Partial<AdrFrontmatter> = {},
): ParsedAdr {
  const number = Number.parseInt(id.slice('ADR-'.length), 10)
  return {
    id,
    number,
    slug: `decision-${number}`,
    path: `docs/adr/${String(number).padStart(4, '0')}-decision-${number}.md`,
    directory: 'accepted',
    frontmatter: { status, date: '2026-09-03', acceptance: 'human', ...fields },
    title: `Decision ${number}`,
    body: '',
    hasOpenPoints: false,
  }
}

function issueCodes(base: ParsedAdr[], head: ParsedAdr[]): string[] {
  return validateAdrTransitions(base, head).map((issue) => issue.code)
}

describe('validateAdrTransitions supersession', () => {
  it('accepts a new accepted ADR paired with a superseded target', () => {
    const oldAdr = adr('ADR-0001', 'superseded', { superseded_by: 'ADR-0002' })
    const newAdr = adr('ADR-0002', 'accepted', { supersedes: ['ADR-0001'] })

    expect(validateAdrTransitions([oldAdr, newAdr], [oldAdr, newAdr])).toEqual([])
  })

  it('rejects a superseded target that does not identify its accepted replacement', () => {
    const oldAdr = adr('ADR-0001', 'superseded')
    const newAdr = adr('ADR-0002', 'accepted', { supersedes: ['ADR-0001'] })

    expect(issueCodes([], [oldAdr, newAdr])).toContain('invalid-supersession')
  })

  it('rejects a superseded ADR whose replacement does not list it', () => {
    const oldAdr = adr('ADR-0001', 'superseded', { superseded_by: 'ADR-0002' })
    const newAdr = adr('ADR-0002', 'accepted')

    expect(issueCodes([], [oldAdr, newAdr])).toContain('invalid-supersession')
  })

  it('rejects a supersession target that is missing', () => {
    const newAdr = adr('ADR-0002', 'accepted', { supersedes: ['ADR-0099'] })

    expect(issueCodes([], [newAdr])).toContain('invalid-supersession')
  })

  it('rejects a non-accepted ADR that supersedes another ADR', () => {
    const oldAdr = adr('ADR-0001', 'superseded', {
      superseded_by: 'ADR-0002',
      supersedes: ['ADR-0002'],
    })
    const newAdr = adr('ADR-0002', 'superseded', { supersedes: ['ADR-0001'] })

    expect(validateAdrTransitions([], [oldAdr, newAdr])).toContainEqual(
      expect.objectContaining({
        code: 'invalid-supersession',
        message: 'ADR-0002 must be accepted before superseding ADR-0001',
      }),
    )
  })

  it('rejects a supersession target that is not superseded', () => {
    const oldAdr = adr('ADR-0001', 'accepted')
    const newAdr = adr('ADR-0002', 'accepted', { supersedes: ['ADR-0001'] })

    expect(issueCodes([], [oldAdr, newAdr])).toContain('invalid-supersession')
  })
})
