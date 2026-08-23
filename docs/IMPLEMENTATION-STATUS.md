# Implementation status (vs design spec)

Design spec: `docs/superpowers/specs/2026-08-22-adr-governance-design.md` in the [guilz](https://github.com/guilz-dev/guilz) monorepo.

**Current release:** v0.1.10

## Implemented

| Area | Status |
|------|--------|
| Skill `managing-adrs` + references | Done |
| Bundled CLI + hook (`.mjs`) | Done |
| split / single layout detection | Done |
| Legacy ADR index + `documents.legacyFrontmatter` | Done |
| init scan → OS temp dir; apply two-phase | Done |
| init plan ops: create / replace-generated / merge-jsonc + hash check | Done |
| Hook merge (Cursor / Claude / Codex / Gemini) | Done |
| after-turn fingerprint + doc path audit | Done |
| Conversation-scoped audit follow-up limit | Done (v0.1.9) |
| Silent turn-close for low-risk turns | Done (v0.1.10) |
| `check`: ADR validation, manifest drift, hook entries, CONTEXT links | Done |
| `sync` conflict on hand-edited generated files | Done |
| Human promotion audit log (ndjson) | Done |
| CI workflow candidate in init plan (GitHub Actions) | Done |
| Unit + integration + adapter contract tests | Partial (regression tests for fingerprint, base-ref, turn-close, follow-up loop, runtime payload identity) |

## v0.1.10 UX improvements

| Change | Detail |
|--------|--------|
| follow-up gating | Only `likely` risk (or audit follow-up without receipt) triggers user-visible follow-up |
| silent turn-close | `none` / `possible` risk turns auto-record no-change receipt in the hook |

## v0.1.9 regression fixes

| Fix | Detail |
|-----|--------|
| after-turn infinite loop | Follow-up count tracked per `conversation_id` via audit chain state |
| audit follow-up turns | Detect audit prompt in `before-turn`; skip risk re-evaluation |
| `turn-close` resolution | Resolve by conversation pointer and unreceipted fallback; clear audit chain on receipt |
| audit chain lifecycle | Clear on docs update, new user turn, and turn-close |
| follow-up detection | Exact audit message match only |
| runtime without conversation id | Use `session_id`, then hashed `transcript_path`; repository-wide pending scope only when no stable identity exists |
| stale runtime state | Prune individual state files after seven days, including inside active state directories |

The repository-wide pending scope is a degraded compatibility mode. Parallel sessions are
not isolated when a runtime supplies no `conversation_id`, `session_id`, or
`transcript_path`; the hook emits a warning when this occurs.

## Re-enable hooks on guilz (after sync to v0.1.9+)

1. Sync bundled CLI/hook from this package (`sync --from` or init apply).
2. Restore `.cursor/hooks.json` entries for `adr-governance.mjs` (`sessionStart`, `beforeSubmitPrompt`, `stop` with `loop_limit: 1`).
3. Set `adr.config.json` → `hooks.enabled: true`, `afterTurnAudit: true`.
4. Optionally restore `.cursor/rules/adr-governance.mdc` → `alwaysApply: true`.
5. Reload Cursor window; verify one follow-up max when `turn-close` is omitted.

## v0.1.3 regression fixes

| Fix | Detail |
|-----|--------|
| after-turn false positives | `fingerprintWatchPathsChanged` no longer treats git status-only changes as watch-path updates |
| `check --base` | Detects duplicate numbers in current tree and number reuse with different slug vs base ref |
| `turn-close` | Writes receipt via `current-turn.json` pointer instead of filename sort |
| `promote` rollback | Reverts `git mv` when content write fails after move |
| Refactor | Split `create` / `promote` / `supersede` / `turn-close`; dedupe init plan path validation |

## Not yet implemented (spec §18 / backlog)

| Area | Notes |
|------|--------|
| Concurrent create integration test | Lock logic exists; dedicated test pending |
| Skill behavior TDD across 4 live runtimes | Manual / agent-driven baseline still required |
| Behavior test suite directory | `tests/behavior/` placeholder |

## Target project init

```bash
node /path/to/adr-governance/dist/bundle/cli.mjs init --repo /path/to/repo
# Review plan + evidence under $TMPDIR/adr-governance-init/<hash>/
node /path/to/adr-governance/dist/bundle/cli.mjs init --apply /path/to/plan.json --repo /path/to/repo
```

After apply, approve Cursor project hooks if prompted.
