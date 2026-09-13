# Governance Reliability Implementation Plan

> For agentic workers: implement the independent domains below with test-driven development. Only the parent starts the single final independent review; implementers must not start reviewers. User authorization covers implementation in this worktree and PR creation.

**Goal:** Correct the validated gate, snapshot, hook and maintenance failures reported on 2026-09-13 and create a reviewable pull request.

**Architecture:** Evaluate PR policy using the immutable base configuration and base-generated artifact list. Use the canonical change set for both classification and evidence freshness. Keep state tied to an explicit session, preserve user-managed configuration, and make Git observations independent of path quoting and checkout normalization.

**Tech Stack:** TypeScript, Node >=20, Git, Vitest, pnpm 9.15.9, GitHub Actions.

**Spec:** `docs/specs/adr-governance-design.md`, ADR-0001, ADR-0002, and the validated report from the current conversation. M-8 remains the documented v0.2.x compatibility behavior. M-5 gains metadata consistency checking, without claiming authenticated human identity.

## Global constraints

- Preserve v1 evidence legacy warnings through v0.2.x.
- Do not introduce API calls into the provider-neutral check command.
- Preserve independent runtime sessions; never attach an unspecified receipt to the latest arbitrary session.
- Preserve user-owned hook settings and require human metadata only where the trusted policy requests it.
- No unrelated feature work, dependency updates, or release version bump.
- Baseline: 185 tests pass at 0b15f05.
- One final whole-branch review, at most one combined blocking-fix wave and one limited re-review.

## Task 1: Canonical Git snapshot (independent implementation)

Files: `src/cli/git-diff.ts`, `src/core/change-set.ts`, dedicated snapshot regression tests.

- [x] Add real Git tests covering staged and intent-to-add renames with spaces, Unicode paths, CRLF normalization, and executable modes.
- [x] Run the new tests against the baseline; verify the missing deletion / unequal digest failures.
- [x] Enumerate status paths without rename heuristics and preserve NUL-delimited filenames. Read current content using Git's clean-filter normalization, retaining the content SHA-256 canonical format and file-mode semantics.
- [x] Export the existing `listSnapshotChangedPaths` and `buildChangeSet` contracts unchanged; make `listChangedPaths` delegate to canonical enumeration if retained.
- [x] Run change-set tests and record their results.

Expected rename assertion:

```ts
expect(changeSet.entries.map(entry => entry.path)).toEqual(['src/my file.ts', 'src/renamed.ts'])
```

## Task 2: Hook observations, receipts and locking (independent implementation)

Files: `src/hooks/`, fingerprint modules, `src/core/locks.ts`, runtime shim templates, timeout registrations and dedicated tests. Coordinate registration edits with Task 3.

- [x] Add failing tests for session ID delivery in instructions, a >1MB tracked diff that must request an audit, lock acquisition while an empty live lock exists, and invalid PROJECT_DIR imports.
- [x] Provide the correct session ID in receipt instructions. Missing IDs must not silently produce an unreadable orphan receipt; preserve a safe single-session or explicit-ID contract without cross-session fallback.
- [x] Stream/hash Git diff output instead of buffering it at 1MB. Avoid unused watch-content work on the runtime audit path while preserving public watch helpers.
- [x] Prevent cleanup from stealing incomplete active locks; keep lock release ownership safe. Ensure watchdog fail-open output fits its configured outer runtime budget and invalid root inputs fail open.
- [x] Run hook, session, lock and shim tests and record their results.

Expected behavioral assertions:

```ts
expect(after.allowFinish).toBe(false) // >1MB tracked change, risk=none
await expect(acquireLock(repo, 'create', 'create')).rejects.toThrow(/lock/)
```

## Task 3: Mutable configuration and ADR promotion (independent implementation)

Files: `src/installer/generated-files.ts`, `src/cli/commands/sync.ts`, `src/core/lifecycle.ts`, `src/cli/commands/promote.ts`, dedicated tests.

- [x] Add failing tests for config mode edits and additional user runtime settings surviving sync, while generated bundle edits still conflict.
- [x] Export `isUserManagedFile(relativePath: string): boolean` for adr.config.json and the four runtime JSON registration files. Exclude these whole files from generated checksums and ignore their obsolete checksums during migration; retain structural validation and merging of managed hook entries.
- [x] Preserve current config when syncing and preserve unknown user settings/hooks.
- [x] Add a proposed ADR with a leading blank line and supported supersession metadata; promote it and verify exactly one H1 and retained metadata.
- [x] Make promotion update only status/date/acceptance, retaining other frontmatter and the original body.
- [x] Run installer and lifecycle regressions and record results.

## Task 4: Trusted gate, corpus and CI (parent implementation)

Files: `check.ts`, `attest.ts`, `change-gate.ts`, `adr-transitions.ts`, `decision-corpus.ts`, repository ADR enumeration, CI workflow generation and workflows, dedicated integration tests.

- [x] Add real-Git failing cases for head config off/exemptions/layout tampering, manifest scope expansion, governance-only events, unrelated RFC numbers, nested ADRs and five-digit IDs.
- [x] Resolve base policy before deciding whether the gate is off; use it for corpus/layout, exemptions, severity, and human metadata requirements. Keep head structural config validation independent.
- [x] Classify paths from `buildChangeSet().entries` and parse evidence only when non-governance changes need it. Emit one evidence-required issue per cause.
- [x] Derive generated exemptions from the base manifest only. Config and executable governance code changes need evidence; first installation remains explicit and fail-closed when no base policy can be read.
- [x] Enumerate base and current ADRs consistently, including nested layouts, using NUL-delimited Git paths and canonical filename parsing. Avoid duplicate number diagnostics.
- [x] Sort corpus payload by UTF-8 bytes. Apply the same trusted configuration in attest and check.
- [x] Add edited PR triggers. Run CI verification from trusted base code outside the PR checkout; document initial bootstrap/upgrade behavior and the trust boundary.
- [x] Preserve v1 migration behavior and test human-acceptance metadata consistency without claiming identity verification.

## Task 5: Integration, documentation and PR

- [x] Run `pnpm test` and `pnpm typecheck`; fix only failures attributable to these changes.
- [x] Update design/user documentation, compatibility notes, and self-hosted manifest/generated assets as required by the repository.
- [x] Record the disposition of every H/M/L finding, including intentionally retained v1 compatibility and limitations of human metadata.
- [ ] Run one independent whole-branch review. Consolidate blocking fixes once, then request one review limited to those corrections.
- [ ] Build, run final checks, attest the final tree, commit, push and open a PR with concrete changes, tests, compatibility notes and valid evidence.
