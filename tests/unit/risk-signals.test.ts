import { describe, expect, it } from 'vitest'

import { defaultConfig, parseConfig } from '../../src/core/config.js'
import {
  assessPromptRisk,
  isWatchPath,
  resolveHighSignalTerms,
  resolveWatchPathPatterns,
} from '../../src/core/risk-signals.js'

describe('risk signal config merge', () => {
  it('keeps default English and Japanese terms when riskSignals is absent', () => {
    const terms = resolveHighSignalTerms(defaultConfig())
    expect(terms).toContain('architecture')
    expect(terms).toContain('アーキテクチャ')
  })

  it('replaces default terms when highSignalTerms is set', () => {
    const config = defaultConfig({
      riskSignals: {
        highSignalTerms: ['custom-term'],
      },
    })
    expect(resolveHighSignalTerms(config)).toEqual(['custom-term'])
  })

  it('appends additionalTerms to the effective term list', () => {
    const config = defaultConfig({
      riskSignals: {
        additionalTerms: ['payments'],
      },
    })
    const terms = resolveHighSignalTerms(config)
    expect(terms).toContain('architecture')
    expect(terms).toContain('payments')
  })

  it('parses riskSignals from adr.config.json', () => {
    const { config, warnings } = parseConfig({
      version: 2,
      riskSignals: {
        additionalTerms: ['payments'],
        watchPaths: ['services/payments/'],
      },
    })
    expect(config.riskSignals?.additionalTerms).toEqual(['payments'])
    expect(config.riskSignals?.watchPaths).toEqual(['services/payments/'])
    expect(warnings.some((w) => w.includes('riskSignals.unknown'))).toBe(false)
  })

  it('merges custom watch paths with defaults', () => {
    const config = defaultConfig({
      riskSignals: {
        watchPaths: ['custom-manifest.toml'],
      },
    })
    const patterns = resolveWatchPathPatterns(config)
    expect(isWatchPath('pyproject.toml', config)).toBe(true)
    expect(isWatchPath('custom-manifest.toml', config)).toBe(true)
    expect(patterns.length).toBeGreaterThan(1)
  })
})

describe('risk ranking', () => {
  it('does not treat author as auth', () => {
    const { risk, signals } = assessPromptRisk(
      'Please refactor the author list rendering',
      defaultConfig(),
    )
    expect(risk).toBe('none')
    expect(signals).toEqual([])
  })

  it('detects pyproject.toml as a watch path', () => {
    expect(isWatchPath('pyproject.toml')).toBe(true)
    expect(isWatchPath('apps/api/pyproject.toml')).toBe(true)
  })

  it('still flags architecture prompts as possible or likely', () => {
    const { risk, signals } = assessPromptRisk(
      'We need a new database migration for authentication',
      defaultConfig(),
    )
    expect(['possible', 'likely']).toContain(risk)
    expect(signals.length).toBeGreaterThan(0)
  })

  it('uses additionalTerms from config for prompt scoring', () => {
    const config = defaultConfig({
      riskSignals: {
        additionalTerms: ['payments'],
      },
    })
    const { risk, signals } = assessPromptRisk('Update the payments provider contract', config)
    expect(risk).not.toBe('none')
    expect(signals).toContain('term:payments')
  })
})
