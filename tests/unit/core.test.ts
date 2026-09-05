import { describe, expect, it } from 'vitest'

import { defaultConfig, parseConfig, configForSingleDir } from '../../src/core/config.js'
import { parseAdrFilename, formatAdrId, nextAdrNumber, slugifyTitle } from '../../src/core/numbering.js'
import {
  parseFrontmatter,
  serializeFrontmatter,
  hasOpenPoints,
  canPromoteToAccepted,
  buildAdrContent,
} from '../../src/core/lifecycle.js'
import { assessPromptRisk, rankRelevantAdrs } from '../../src/core/risk-signals.js'
import type { ParsedAdr } from '../../src/core/types.js'

describe('config', () => {
  it('does not include requireNoAdrRationale in default config', () => {
    expect(defaultConfig().changeGate).not.toHaveProperty('requireNoAdrRationale')
  })

  it('defaults hook timeout to 1500ms', () => {
    expect(defaultConfig().hooks.timeoutMs).toBe(1500)
  })

  it('rejects hook timeout outside 100-1900ms', () => {
    expect(() =>
      parseConfig({
        version: 2,
        hooks: { timeoutMs: 2000 },
      }),
    ).toThrow(/timeoutMs/)
    expect(() =>
      parseConfig({
        version: 2,
        hooks: { timeoutMs: 99 },
      }),
    ).toThrow(/timeoutMs/)
  })

  it('warns when legacy requireNoAdrRationale key is present', () => {
    const { warnings } = parseConfig({
      version: 2,
      changeGate: { requireNoAdrRationale: true },
    })
    expect(warnings).toContain('Unknown config key: changeGate.requireNoAdrRationale')
  })

  it('defaults to split layout and config v2 enforce gate', () => {
    const c = defaultConfig()
    expect(c.layout.mode).toBe('split')
    expect(c.version).toBe(2)
    expect(c.changeGate.mode).toBe('enforce')
    expect(c.promotion.requireHumanAcceptance).toBe(false)
  })

  it('parses config with warnings for unknown keys', () => {
    const { config, warnings } = parseConfig({ version: 2, unknownKey: true })
    expect(config.version).toBe(2)
    expect(warnings.some((w) => w.includes('unknownKey'))).toBe(true)
  })

  it('maps v1 config to gate off with migration warning', () => {
    const { config, warnings } = parseConfig({
      version: 1,
      changeGate: { mode: 'enforce' },
    })
    expect(config.version).toBe(1)
    expect(config.changeGate.mode).toBe('off')
    expect(warnings.some((w) => w.includes('v1'))).toBe(true)
  })

  it('warns about unknown nested config keys while retaining supported settings', () => {
    const { config, warnings } = parseConfig({
      version: 2,
      layout: { mode: 'single', unknownLayoutSetting: true },
      changeGate: { mode: 'warn', unknownGateSetting: true },
    })

    expect(config.layout.mode).toBe('single')
    expect(config.changeGate.mode).toBe('warn')
    expect(warnings).toContain('Unknown config key: layout.unknownLayoutSetting')
    expect(warnings).toContain('Unknown config key: changeGate.unknownGateSetting')
  })

  it('supports single dir layout', () => {
    const c = configForSingleDir('docs/adr')
    expect(c.layout.mode).toBe('single')
    expect(c.layout.proposedDir).toBe('docs/adr')
  })
})

describe('numbering', () => {
  it('parses ADR filenames', () => {
    expect(parseAdrFilename('0001-facet-names.md')).toEqual({ number: 1, slug: 'facet-names' })
    expect(parseAdrFilename('bad.md')).toBeNull()
  })

  it('formats ADR ids', () => {
    expect(formatAdrId(7, 4)).toBe('ADR-0007')
  })

  it('computes next number', () => {
    expect(nextAdrNumber([1, 2, 4])).toBe(5)
  })

  it('slugifies titles', () => {
    expect(slugifyTitle('Hello World!')).toBe('hello-world')
  })
})

describe('lifecycle', () => {
  it('round-trips frontmatter', () => {
    const fm = { status: 'proposed' as const, date: '2026-08-22' }
    const body = '# Title\n\nBody'
    const content = buildAdrContent(fm, 'Title', body)
    const parsed = parseFrontmatter(content)
    expect(parsed.frontmatter?.status).toBe('proposed')
    expect(parsed.body).toContain('# Title')
  })

  it('detects open points', () => {
    expect(hasOpenPoints('## Open Points\n- foo')).toBe(true)
    expect(hasOpenPoints('# Done')).toBe(false)
  })

  it('blocks promote with open points', () => {
    const adr: ParsedAdr = {
      id: 'ADR-0001',
      number: 1,
      slug: 'x',
      path: 'docs/proposed-adr/0001-x.md',
      directory: 'proposed',
      frontmatter: { status: 'proposed', date: '2026-08-22' },
      title: 'X',
      body: '## Open Points\n- q',
      hasOpenPoints: true,
    }
    expect(canPromoteToAccepted(adr, false).ok).toBe(false)
  })

  it('serializes superseded frontmatter', () => {
    const yaml = serializeFrontmatter({
      status: 'superseded',
      date: '2026-08-22',
      superseded_by: 'ADR-0008',
    })
    expect(yaml).toContain('superseded_by: ADR-0008')
  })
})

describe('risk signals', () => {
  it('assesses architecture prompts as possible or likely', () => {
    const config = defaultConfig()
    const { risk, signals } = assessPromptRisk('We need a new database migration for auth', config)
    expect(['possible', 'likely']).toContain(risk)
    expect(signals.length).toBeGreaterThan(0)
  })

  it('returns none for trivial prompts', () => {
    const { risk } = assessPromptRisk('fix typo in comment', defaultConfig())
    expect(risk).toBe('none')
  })

  it('ranks relevant ADRs by title overlap', () => {
    const adrs: ParsedAdr[] = [
      {
        id: 'ADR-0001',
        number: 1,
        slug: 'facet-names',
        path: 'docs/adr/0001-facet-names.md',
        directory: 'accepted',
        frontmatter: { status: 'accepted', date: '2026-08-22' },
        title: 'Facet naming decision',
        body: '',
        hasOpenPoints: false,
      },
    ]
    const ranked = rankRelevantAdrs('explain facet naming', adrs)
    expect(ranked[0]?.id).toBe('ADR-0001')
  })
})
