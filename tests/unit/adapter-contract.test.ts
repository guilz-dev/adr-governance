import { describe, expect, it } from 'vitest'

import {
  toClaudeUserPromptSubmit,
  toClaudeStop,
  toGeminiBeforeAgent,
  toGeminiAfterAgent,
  toCursorSessionStart,
} from '../../src/hooks/adapters/cursor.js'
import { buildHookContext } from '../../src/hooks/common.js'
import { defaultConfig } from '../../src/core/config.js'
import { extractRelativeLinks } from '../../src/core/context-links.js'
import { hashPrompt } from '../../src/core/risk-signals.js'

describe('adapter contract', () => {
  const config = defaultConfig()
  const ctx = buildHookContext(config, 'likely', ['term:architecture'], ['docs/adr/0001-x.md'])

  it('claude before-turn uses hookSpecificOutput.additionalContext', () => {
    const out = toClaudeUserPromptSubmit(ctx)
    const specific = out.hookSpecificOutput as { hookEventName?: string; additionalContext?: string }
    expect(specific.hookEventName).toBe('UserPromptSubmit')
    expect(specific.additionalContext).toContain('managing-adrs')
  })

  it('claude stop blocks with decision block and reason', () => {
    const out = toClaudeStop('audit follow-up')
    expect(out.decision).toBe('block')
    expect(out.reason).toContain('audit')
  })

  it('gemini before-agent uses hookSpecificOutput.additionalContext', () => {
    const out = toGeminiBeforeAgent(ctx)
    expect(out.decision).toBe('allow')
    const specific = out.hookSpecificOutput as { additionalContext?: string }
    expect(specific.additionalContext).toBeTruthy()
  })

  it('gemini after-agent denies once for follow-up', () => {
    const out = toGeminiAfterAgent('audit follow-up')
    expect(out.decision).toBe('deny')
    expect(out.reason).toContain('audit')
  })

  it('cursor session-start includes standing reminder', () => {
    const out = toCursorSessionStart(ctx)
    expect(out.additional_context).toContain('ADR governance')
  })

  it('does not tell agents that hooks create semantic receipts', () => {
    expect(ctx.fullInstruction).not.toContain('silent-close')
    expect(ctx.fullInstruction).toContain('never records a no-ADR reason on your behalf')
  })
})

describe('privacy', () => {
  it('stores prompt hash not raw prompt in helper', () => {
    const prompt = 'secret prompt about architecture'
    const hash = hashPrompt(prompt)
    expect(hash).not.toContain('secret prompt')
    expect(hash.length).toBe(64)
  })
})

describe('context links', () => {
  it('extracts relative markdown links', () => {
    const links = extractRelativeLinks('[adr](docs/adr/0001-x.md) and [ext](https://example.com)')
    expect(links).toEqual(['docs/adr/0001-x.md'])
  })
})
