---
status: accepted
date: 2026-09-04
acceptance: human
---

# Bind Decision Evidence to the Exact Change Set

## Context

DecisionEvidence v1 binds attestations to the base decision corpus hash only. After attestation, any non-governance code change can land without invalidating the evidence, as long as ADR references and corpus content on base remain stable. This gap allows stale attestations to authorize unrelated implementation work.

## Decision

DecisionEvidence v2 records the immutable base commit and a provider-neutral
`git-change-set-v1` digest. Any path, content, file-mode, add, or delete change
after attestation makes the evidence stale. Rename detection is not heuristic;
a rename is represented as one delete and one add.

DecisionEvidence v1 remains readable with an explicit legacy warning during
v0.2.x and is rejected starting in v0.3.0.

## Rejected alternatives

| Alternative | Why rejected |
|-------------|--------------|
| Path hash only (`changedPathsHash`) | Cannot verify subset containment; misses in-file edits on the same path |
| Head commit only | Rebases and force-pushes change commit IDs without changing tree meaning inconsistently |
| Provider-specific SHA (GitHub compare API) | Breaks portability; core must stay provider-neutral |

## Consequences

- `attest` and `check --base` share one canonical `buildChangeSet` function.
- New validation codes: `decision-changeset-stale`, `decision-base-stale`, `decision-evidence-legacy`.
- CI must use immutable PR base SHAs with full Git history (`fetch-depth: 0`).
- Agents must re-run `attest` after any code change before opening or updating a PR.

## Migration

- v0.2.x: schemaVersion 1 evidence emits `decision-evidence-legacy` warning; v2 is produced by `attest`.
- v0.3.0: schemaVersion 1 evidence is rejected.
- Re-attest all open PRs when upgrading to v0.2.0.

## References

- [ADR-0001: Decision Authority Gate](./0001-decision-authority-gate.md)
- Improvement proposals: `docs/improvement-proposals-2026-09-04.md` §2.1
- Design spec: `docs/specs/adr-governance-design.md`
