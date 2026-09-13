# Reliability fixes for the 2026-09-13 report

The report targeted v0.2.0 at `0b15f05`. Its core H-1–H-4 and M-1–M-8 observations were independently reproduced. This change corrects the implementation defects while preserving the documented v0.2.x evidence migration and the distinction between human acceptance metadata and authenticated human identity.

## Disposition

| Finding | Result |
| --- | --- |
| H-1 | `check --base` and `attest` read policy/layout from the immutable base. Head mode, exemption and layout edits cannot weaken that check. Config and executable governance changes require evidence. |
| H-2 | Only base manifest entries grant generated-artifact exemptions. A new head entry cannot hide an implementation change or stale evidence. |
| H-3 | Gate classification uses the exact `buildChangeSet` entries. NUL-delimited Git output preserves Unicode, whitespace and both sides of renames. File-to-directory replacement retains the original deletion; unsupported gitlink changes produce an explicit comparison failure. |
| H-4 | Evidence is read only when a non-governance change requires it. ADR/CONTEXT-only PRs may omit the evidence block. |
| H-5 | Generated and self-hosted workflows include `edited`. The defect was missing re-evaluation after body edits; the original assertion that no legitimate sequence could pass was too strong. |
| M-1 | Hook instructions supply a shell-quoted session ID. Missing or unknown IDs fail with guidance rather than writing an orphan receipt. Legacy pointers remain readable; no latest-other-session fallback is used. |
| M-2 | Config and runtime registration files are user-managed, structurally checked and merged; whole-file checksums no longer block legitimate edits. Sync accepts their obsolete manifest hashes and preserves config bytes. Generated bundles still have conflict protection. |
| M-3 | Base number checks use parsed ADRs in configured directories, including nested paths and non-four-digit numbers. Unrelated RFC filenames are excluded. |
| M-4 | Working/index status disables rename detection, producing separate source deletion and destination addition entries. Attestation remains valid after an unchanged rename is committed. |
| M-5 | Trusted `requireHumanAcceptance` requires human metadata on new or changed accepted ADRs. This checks policy consistency; it does not authenticate a person. |
| M-6 | Promotion updates status/date/acceptance in place, preserving the body, one H1, supported supersession metadata and unknown frontmatter. |
| M-7 | Tracked diffs are streamed into the fingerprint hash, so a diff larger than 1 MiB no longer disables change detection. |
| M-8 | Retained intentionally: v1 evidence emits a legacy warning throughout v0.2.x, as specified by ADR-0002. Rejection remains a v0.3.0 change. |
| L-1 | Comparison failures follow the trusted warn/enforce policy. Missing base refs (including symbolic names) or unreadable base policy fail closed because the trusted mode cannot be determined. |
| L-2 | Corpus hashing sorts UTF-8 bytes instead of using the process locale. |
| L-3 | Locks publish a populated owner directory atomically. Cleanup/release remove only the observed owner, so competing cleanup cannot steal a replacement. Recent incomplete legacy lock files are respected. |
| L-4 | Runtime audits collect the repository fingerprint without unused legacy watch-file hashes. Existing watch helper APIs remain available. |
| L-5 | The shim emits fail-open at its inner deadline; Codex and Gemini registrations reserve a 3-second outer budget for the supported 1900 ms maximum. |
| L-6 | Runtime shims validate candidate roots and return fail-open output when imports cannot be loaded. |
| L-7 | Base and working corpus enumeration is recursive. The longest configured directory prefix chooses the ADR kind, preserving nested proposed layouts and legacy status inference. |
| L-8 | Current-tree duplicate numbers and absent evidence each produce one diagnostic. |
| L-9 | Current change-set bytes use Git clean filters/EOL normalization. File modes follow Git/index semantics, including disabled symlink support. |

## Upgrade and trust boundaries

Run `sync --from <new-package-root>` with the new CLI, review the resulting bundle/hook/manifest changes, and commit them. Existing projects must also update their workflow: sync generates a workflow only when one does not already exist. Add `edited` and copy the trusted-base invocation from the generated workflow or this repository's `.github/workflows/adr-governance.yml`.

The PR verifier is extracted from the immutable base commit into the runner temporary directory. The PR cannot replace it by editing its bundled CLI. Policy and bundle upgrades take effect for subsequent PRs after the upgrade lands on base. This upgrade PR itself is evaluated with the older base verifier.

For first installation, commit a reviewed config and bundle using structural `check` before enabling the base-dependent required check. There is no automatic fallback to untrusted head policy or head executable when the base lacks governance files.

The workflow definition, runner configuration and selected base SHA are part of the trusted CI boundary. Protect governance workflows with repository review/ruleset controls if adversarial contributors are in scope; merely using a required check name does not make a PR-editable workflow immutable. This change does not alter repository protection settings or authenticate `acceptance: human` claims.

Re-run `attest` after upgrading. Deterministic corpus ordering and corrected rename/EOL handling can change hashes compared with earlier v0.2.0 builds. Keep local and CI Git attribute/clean-filter configuration aligned. Tests exercise EOL and custom clean-filter normalization and mode/symlink checkout behavior; this is not a claim of a complete Windows runtime certification. Existing Git blob-read limits and hook timeout fail-open behavior still apply.

The CLI continues to consume the event payload without network calls. Body edits trigger a new evaluation; rerunning an old job reuses its old event. A valid sequence is to finish changes, attest, update the PR body, and push the corresponding tree.

The current snapshot algorithm does not represent submodules (Git mode `160000`). Changes adding, updating or deleting a gitlink are rejected by `attest`; `check` reports a comparison failure (error in trusted enforce mode, warning in trusted warn mode). They are never silently treated as an empty change set.

## Regression coverage

- `tests/integration/governance-reliability.test.ts`: trusted policy, manifest scope, classification, evidence diagnostics, recursive ADRs, metadata and locale-independent corpus payload.
- `tests/integration/trusted-ci-runner.test.ts`: executes the generated workflow command against a poisoned head bundle and verifies the base bundle ran.
- `tests/unit/git-snapshot-regressions.test.ts`: real Git renames, special paths, EOL/filters, modes and symlink checkout.
- `tests/integration/maintenance-reliability.test.ts` and `tests/unit/hook-merge-migration.test.ts`: mutable configuration, hook migration, generated conflicts and promotion preservation.
- `tests/unit/hook-reliability.test.ts`, `tests/unit/lock-race.test.ts` and shim tests cover receipt routing, large diffs, lock ownership and competing cleanup, invalid roots and watchdog output.

Regression cases were run against the defective behavior before implementation, then included in the full test suite.
