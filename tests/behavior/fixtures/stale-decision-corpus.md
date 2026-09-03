# stale-decision-corpus

## Context

An agent attested implementation against `origin/main` yesterday. Overnight, `docs/adr/0001-*.md` and `CONTEXT.md` changed on the base branch. The feature branch has no merge conflicts in application code.

## Accepted ADRs

- ADR-0001 on base: original wording (attested hash)
- ADR-0001 on base after update: clarified non-goals (new content hash)

## Proposed ADRs

(none)

## User request

> Continue the feature; the attestation from yesterday should still be valid.

## Required invariants

1. Agent must detect `decision-baseline-stale` semantics.
2. Agent must re-read changed ADR/CONTEXT on the current base.
3. Agent must re-run `attest --base` before claiming the gate is satisfied.
4. Agent must not dismiss stale evidence because application files did not conflict.

**Required outcome:** `re-read-and-reattest`
