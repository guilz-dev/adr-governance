# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Bind gate policy and generated exemptions to the immutable base; run PR checks with its verifier and re-evaluate edited PR bodies.
- Share canonical rename/path classification with evidence hashing, normalize Git clean-filter bytes and modes, and make corpus ordering and recursive ADR scope deterministic.
- Preserve user config/settings during sync and ADR bodies/frontmatter during promotion.
- Deliver session-specific receipt commands, stream large tracked diffs, skip unused watch hashes, and protect locks from competing stale cleanup.
- Keep runtime import failures fail-open and reserve watchdog startup/termination time in Codex/Gemini registrations.

### Compatibility

- Re-attest open PRs after upgrading; existing workflows require the trusted-base runner and `edited` update. See [migration notes](docs/reliability-fixes-2026-09-13.md).
- The v0.2.x v1-evidence warning window remains unchanged. Human acceptance metadata is checked against trusted policy, without claiming authenticated human identity.

## [0.2.0] - 2026-09-05

### Added

- DecisionEvidence v2 binds attestations to an immutable base and exact change set.
- Turn audit resolution uses decision-corpus content instead of filesystem mtime.
- Hook fingerprints expose metadata fallback and unavailable collection modes.
- Runtime shims enforce a sub-two-second watchdog.
- Generated and self-hosted GitHub Actions use full history and immutable PR base SHAs.
- Self-hosted PR decision gate workflow (`adr-governance.yml`) in warn mode.

### Changed

- Config v2 removes the ineffective `requireNoAdrRationale` switch; rationale remains mandatory.
- `attest` always emits DecisionEvidence schemaVersion 2.
- `hooks.timeoutMs` defaults to 1500ms (allowed range 100–1900ms).

### Deprecated

- DecisionEvidence schemaVersion 1 remains readable with `decision-evidence-legacy` warning through v0.2.x; rejected in v0.3.0.

## [0.1.11] - 2026-08-26

### Changed

- after-turn: silently record `turn-close` receipt for `likely` risk turns (no user-visible audit follow-up)
- Skill: require executing `turn-close` via shell; prose mentions are not receipts
- hook instruction: note that silent-closed turns do not require manual `turn-close`

### Fixed

- after-turn: when an in-flight audit follow-up closes, propagate the receipt to the parent turn via audit chain `lastTurnId`
- parent receipt propagation uses `reversible` for `likely` / `possible` parent turns

### Notes

- `hooks.maxFollowUps` now applies only to in-flight audit follow-up turns from v0.1.9 and earlier; new `likely` turns no longer emit follow-ups

## [0.1.10] - 2026-08-23

### Changed

- after-turn: follow-up only for `likely` risk or audit follow-up turns without receipt (not `possible` / watch-path-only changes)
- after-turn: silently record `turn-close` receipt for `none` / `possible` risk turns (no user-visible follow-up turn)

## [0.1.9] - 2026-08-23

### Fixed

- after-turn: enforce follow-up limit per conversation via audit chain state (prevents generation-crossing loops)
- before-turn: detect audit follow-up prompts and skip risk re-evaluation
- turn-close: resolve turn state by conversation pointer and unreceipted fallback; clear audit chain on receipt
- audit chain: clear on docs update, new user turn, and turn-close (not only manual no-ADR receipt)
- follow-up detection: exact audit message match only (avoid user-pasted prompt false positives)
- audit chain: pending scope when runtime omits stable conversation/session id (no generation_id fallback)
- runtime payload identity: contract fixtures for Claude Code, Codex, and Gemini CLI
- audit chain: hashed `transcript_path` fallback before repository-wide pending scope
- turn-close fallback: avoid matching another conversation through a colliding session id
- state retention: prune stale files inside active state directories
- Skill: prefer `conversation_id` for `turn-close --session-id`

### Added

- Regression tests for follow-up loop and conversation-scoped `turn-close`

## [0.1.8] - 2026-08-22

### Fixed

- Init plan: layout-aware ADR README generation (no duplicate overwrite in single layout; no forced `docs/adr/` in custom layout)
- Init plan: connect evidence bundle to CONTEXT draft, proposed ADR candidates, and review questions
- Init plan: generate `CONTEXT-MAP.md` only when multiple `CONTEXT.md` files are detected
- Init plan: `evidenceReferences.sourcePaths` point at scan evidence, not generated destinations
- Manifest: track `.adr-governance/.gitignore` for sync drift detection
- Turn pointer: remove cross-session mtime fallback when `--session-id` is omitted
- Skill: document required `--session-id` on `turn-close`
- Fingerprint: detect watch-path changes via watch-scoped git status hash and overflow-path content hash
- Fingerprint: skip v0.1.8 hash fields when comparing against pre-upgrade turn state
- Init plan: localize `reviewQuestions` to `documents.language`

## [0.1.7] - 2026-08-22

### Fixed

- Bump `vitest` to 3.2.6 (CVE-2026-47429; Vitest UI/API server path traversal on Windows)

## [0.1.6] - 2026-08-22

### Fixed

- Hook merge: preserve Claude/Codex/Gemini nested `matcher` groups instead of flattening
- Turn pointers: scope by `generation_id` / `conversation_id`; no cross-session fallback when id is explicit
- Lock cleanup: remove stale locks only when PID is dead **and** age exceeds threshold
- `create`: block `--status accepted` when `promotion.requireHumanAcceptance` is true
- Claude/Gemini adapters: emit official hook output shapes (`hookSpecificOutput`, `decision: block`)
- `check`: verify hook registration for Cursor, Claude, Codex, and Gemini
- Init apply: list all planned file operations in `init-plan.json` with hash checks (including runtime hook configs)
- Init apply: declare `postApplySteps: ["write-manifest"]` in the plan
- Init apply: generate `CONTEXT.md`, `CONTEXT-MAP.md`, and `docs/proposed-adr/README.md` stubs
- Apply plan: reject symlink segments in parent directories of target paths
- Fingerprint: hash sampled watch paths even when watch file count exceeds cap

## [0.1.5] - 2026-08-22

### Fixed

- `check --json`: treat `--json` as a boolean flag so it works as the last argument
- Runtime hook wrappers: forward stdin so session-start receives the prompt
- `init --apply` and `sync`: require a valid adr-governance package root (`--from` when using the installed CLI)
- Hook wrappers: fail-open when the bundled hook process cannot be spawned

## [0.1.4] - 2026-08-22

### Fixed

- Bundle CLI: resolve `jsonc-parser` ESM bundling so `dist/bundle/cli.mjs` runs
- `check`: avoid duplicate ADR indexing when accepted and proposed dirs overlap
- CLI: parse `promote` / `supersede` positional args when `--repo` precedes ADR id
- `promote`: fall back to filesystem move for untracked proposed ADRs
- init scan: detect empty `docs/proposed-adr/` via directory presence, not only git tracking

## [0.1.3] - 2026-08-22

### Fixed

- after-turn: stop treating git status-only changes as watch-path updates
- `check --base`: detect duplicate ADR numbers and base-ref slug collisions
- `turn-close`: write receipts via `current-turn.json` pointer
- `promote`: roll back `git mv` when content write fails after move

### Changed

- Split CLI commands into dedicated modules (`create`, `promote`, `supersede`, `turn-close`)
- Deduplicate init plan path validation

### Added

- Regression tests for fingerprint, base-ref check, and turn-close pointer
- OSS governance docs and CI workflow

## [0.1.2] - 2026-08-22

### Added

- Init plan apply with hash verification
- `documents.legacyFrontmatter` support
- CONTEXT link validation and human promotion audit log
- GitHub Actions workflow candidate in init plan
- Integration and adapter contract tests

## [0.1.1] - 2026-08-22

### Fixed

- `promote`: correct `git mv` ordering for split layout
- Runtime hook JSON merge for Cursor, Claude, Codex, and Gemini
- Legacy ADR indexing and after-turn fingerprint correlation

## [0.1.0] - 2026-08-22

### Added

- Initial release: Skill, bundled CLI, hooks, init/check/sync/create lifecycle

[0.1.9]: https://github.com/guilz-dev/adr-governance/compare/v0.1.8...v0.1.9
[0.1.8]: https://github.com/guilz-dev/adr-governance/compare/v0.1.7...v0.1.8
[0.1.5]: https://github.com/guilz-dev/adr-governance/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/guilz-dev/adr-governance/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/guilz-dev/adr-governance/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/guilz-dev/adr-governance/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/guilz-dev/adr-governance/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/guilz-dev/adr-governance/releases/tag/v0.1.0
