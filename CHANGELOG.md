# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.1.5]: https://github.com/guilz-dev/adr-governance/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/guilz-dev/adr-governance/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/guilz-dev/adr-governance/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/guilz-dev/adr-governance/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/guilz-dev/adr-governance/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/guilz-dev/adr-governance/releases/tag/v0.1.0
