#!/usr/bin/env node
import { runBeforeTurn } from './before-turn.js'
import { runAfterTurn } from './after-turn.js'
import {
  toCursorSessionStart,
  toCursorBeforeSubmit,
  toCursorStop,
  toClaudeUserPromptSubmit,
  toClaudeStop,
  toGeminiBeforeAgent,
  toGeminiAfterAgent,
} from './adapters/cursor.js'
import { findRepoRoot } from '../core/repository-state.js'
import {
  resolveHookTurnKey,
  resolveHookTurnKeyOptional,
  resolveHookConversationKeyOptional,
  pendingConversationScopeWarning,
} from './resolve-hook-session-id.js'

async function readStdinJson(): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

function resolveRepoRoot(cwd: string): string | null {
  return findRepoRoot(cwd)
}

async function main(): Promise<void> {
  const runtime = process.argv[2] ?? 'cursor'
  const phase = process.argv[3] ?? 'before-turn'
  const payload = await readStdinJson()
  const cwd = String(payload.cwd ?? process.cwd())
  const prompt = String(payload.prompt ?? payload.text ?? payload.user_message ?? '')

  const repoRoot = resolveRepoRoot(cwd)
  const conversationId = resolveHookConversationKeyOptional(payload)
  const scopeWarning = pendingConversationScopeWarning(payload)
  if (repoRoot && scopeWarning) console.error(scopeWarning)

  try {
    if (phase === 'before-turn' || phase === 'session-start') {
      const result = await runBeforeTurn({
        cwd,
        prompt,
        sessionId: resolveHookTurnKey(payload),
        conversationId,
        hookPayload: payload,
      })
      const ctx = result.hookContext

      if (runtime === 'cursor') {
        const out =
          phase === 'session-start'
            ? toCursorSessionStart(ctx)
            : toCursorBeforeSubmit()
        process.stdout.write(JSON.stringify(out))
        if (result.warning) console.error(result.warning)
        return
      }
      if (runtime === 'claude' || runtime === 'codex') {
        process.stdout.write(JSON.stringify(toClaudeUserPromptSubmit(ctx)))
        if (result.warning) console.error(result.warning)
        return
      }
      if (runtime === 'gemini') {
        process.stdout.write(JSON.stringify(toGeminiBeforeAgent(ctx)))
        if (result.warning) console.error(result.warning)
        return
      }
    }

    if (phase === 'after-turn') {
      const result = await runAfterTurn({
        cwd,
        sessionId: resolveHookTurnKeyOptional(payload),
        conversationId,
      })
      if (runtime === 'cursor') {
        process.stdout.write(JSON.stringify(toCursorStop(result.followUpMessage)))
        if (result.warning && !result.warning.includes('Legacy turn state')) {
          console.error(result.warning)
        }
        return
      }
      if (runtime === 'claude' || runtime === 'codex') {
        process.stdout.write(JSON.stringify(toClaudeStop(result.followUpMessage)))
        if (result.warning && !result.warning.includes('Legacy turn state')) {
          console.error(result.warning)
        }
        return
      }
      if (runtime === 'gemini') {
        process.stdout.write(JSON.stringify(toGeminiAfterAgent(result.followUpMessage)))
        if (result.warning && !result.warning.includes('Legacy turn state')) {
          console.error(result.warning)
        }
        return
      }
    }

    process.stdout.write(JSON.stringify({ continue: true }))
  } catch (e) {
    console.error(String(e))
    process.stdout.write(JSON.stringify({ continue: true }))
  }
}

void main()
