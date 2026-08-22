# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.1.3]: https://github.com/guilz-dev/adr-governance/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/guilz-dev/adr-governance/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/guilz-dev/adr-governance/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/guilz-dev/adr-governance/releases/tag/v0.1.0
