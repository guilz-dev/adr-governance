# Implementation status (vs design spec)

Design spec: [`docs/specs/adr-governance-design.md`](./specs/adr-governance-design.md) in this repository. The guilz monorepo copy is historical.

**Current release:** v0.2.0

## v0.2.0 reliability release

| Area | Status |
|------|--------|
| DecisionEvidence v2 (exact changeset + base commit) | Done — [`docs/adr/0002-bind-evidence-to-exact-changeset.md`](./adr/0002-bind-evidence-to-exact-changeset.md) |
| Corpus-hash turn audit resolution (no mtime) | Done |
| Fingerprint degradation modes (`content` / `metadata` / `unavailable`) | Done |
| Hook shim watchdog (`hooks.timeoutMs`, shared runner) | Done |
| Generated CI workflow (immutable PR base SHA, push structural check) | Done |
| Self-hosted PR gate (`adr-governance.yml`, warn mode) | Done |
| Security / privacy integration tests | Done |
| Config v2 without `requireNoAdrRationale` | Done |

### Enforce dogfooding criteria (warn → enforce)

Self-hosting remains `changeGate.mode: "warn"` until all of:

- `observation_days >= 14`
- `observed_pull_requests >= 20`
- `false_positive_rate < 0.05`
- `unexplained_degradation_count == 0`
- `bot_pull_request_path == green`
- `p0_finding_count == 0`

## Implemented (prior releases)

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
| Decision Authority Gate (`attest`, `check --base`, config v2) | Done |
| `check`: ADR validation, manifest drift, hook entries, CONTEXT links | Done |
| `sync` conflict on hand-edited generated files | Done |
| Human promotion audit log (ndjson) | Done |
| CI workflow candidate in init plan (GitHub Actions) | Done |
| Unit + integration + adapter contract tests | Expanded |

## Backlog

- Skill behavior TDD (§18.1)
- Full runtime official schema golden (§18.4)
- concurrent create integration test (§18.3)
- Windows CI matrix
- npm publish automation
