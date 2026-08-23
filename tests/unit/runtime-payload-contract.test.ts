import { describe, expect, it } from 'vitest'

import {
  resolveHookConversationKeyOptional,
  resolveHookTurnKeyOptional,
} from '../../src/hooks/resolve-hook-session-id.js'

const runtimePayloads = [
  {
    runtime: 'Claude Code',
    sessionId: 'claude-session-1',
    before: {
      session_id: 'claude-session-1',
      transcript_path: '/tmp/claude-session-1.jsonl',
      cwd: '/tmp/repo',
      hook_event_name: 'UserPromptSubmit',
      permission_mode: 'default',
      prompt: 'Change the architecture',
    },
    after: {
      session_id: 'claude-session-1',
      transcript_path: '/tmp/claude-session-1.jsonl',
      cwd: '/tmp/repo',
      hook_event_name: 'Stop',
      stop_hook_active: false,
      last_assistant_message: 'Done',
    },
  },
  {
    runtime: 'Codex',
    sessionId: 'codex-session-1',
    before: {
      session_id: 'codex-session-1',
      turn_id: 'codex-turn-1',
      transcript_path: '/tmp/codex-session-1.jsonl',
      cwd: '/tmp/repo',
      hook_event_name: 'UserPromptSubmit',
      model: 'gpt-5',
      permission_mode: 'default',
      prompt: 'Change the architecture',
    },
    after: {
      session_id: 'codex-session-1',
      turn_id: 'codex-turn-1',
      transcript_path: '/tmp/codex-session-1.jsonl',
      cwd: '/tmp/repo',
      hook_event_name: 'Stop',
      model: 'gpt-5',
      permission_mode: 'default',
      stop_hook_active: false,
      last_assistant_message: 'Done',
    },
  },
  {
    runtime: 'Gemini CLI',
    sessionId: 'gemini-session-1',
    before: {
      session_id: 'gemini-session-1',
      transcript_path: '/tmp/gemini-session-1.json',
      cwd: '/tmp/repo',
      hook_event_name: 'BeforeAgent',
      timestamp: '2026-08-23T00:00:00.000Z',
      prompt: 'Change the architecture',
    },
    after: {
      session_id: 'gemini-session-1',
      transcript_path: '/tmp/gemini-session-1.json',
      cwd: '/tmp/repo',
      hook_event_name: 'AfterAgent',
      timestamp: '2026-08-23T00:00:01.000Z',
      prompt: 'Change the architecture',
      prompt_response: 'Done',
      stop_hook_active: false,
    },
  },
] as const

describe.each(runtimePayloads)('$runtime hook payload contract', ({ before, after, sessionId }) => {
  it('uses session_id as the stable conversation key across before and after hooks', () => {
    expect(resolveHookConversationKeyOptional(before)).toBe(sessionId)
    expect(resolveHookConversationKeyOptional(after)).toBe(sessionId)
  })

  it('uses session_id as the turn pointer when no generation_id is present', () => {
    expect(resolveHookTurnKeyOptional(before)).toBe(sessionId)
    expect(resolveHookTurnKeyOptional(after)).toBe(sessionId)
  })
})

describe('runtime payload identity precedence', () => {
  it('prefers session_id over transcript_path', () => {
    expect(
      resolveHookConversationKeyOptional({
        session_id: 'runtime-session',
        transcript_path: '/tmp/session.jsonl',
      }),
    ).toBe('runtime-session')
  })
})
