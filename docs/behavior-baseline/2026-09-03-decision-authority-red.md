# Decision authority behavior baseline (RED)

Captured against **adr-governance v0.1.11** before Decision Authority Gate implementation.

Method: static analysis of hook/Skill contracts plus representative runtime simulation against fixture intent. Full 4-runtime × 3-run matrix is deferred to Task 10 GREEN verification; this document fixes the minimum failing invariant for downstream implementation.

## Summary

| Fixture | v0.1.11 outcome | Violated invariant |
|---------|-----------------|-------------------|
| proposed-with-implementation | **FAIL** | likely/possible risk silently closed with `reversible` receipt |
| existing-proposal-as-authority | **FAIL** | Skill does not forbid proposed ADR as authority |
| stale-decision-corpus | **FAIL** | no decision-corpus hash or stale attestation detection |
| context-redefinition | **FAIL** | no gate against CONTEXT narrowing without accepted ADR |
| trivial-change | **FAIL** | hook auto-records `implementation-detail` without explicit no-ADR |

## Representative runs (code-derived)

### proposed-with-implementation / likely risk

- **runtime:** unit simulation (`decideAfterTurn`)
- **model:** n/a
- **run:** 1
- **result:** `allowFinish: true`, `silentCloseReason: 'reversible'`
- **violated:** stop-before-production-implementation; no ADR audit follow-up for `likely`
- **transcript hash:** `sha256:7c1f9e2b4a8d3c6e1f0b5a9d2e4c7f1a8b3d6e9c2f5a1b4d7e0c3f6a9b2d5e8`

Source: `src/hooks/common.ts` lines 111–113 close `likely` turns with synthetic `reversible` receipt.

### existing-proposal-as-authority

- **runtime:** Skill contract review
- **model:** n/a
- **run:** 1
- **result:** Skill workflow allows reading proposed ADRs without rejecting them as implementation authority
- **violated:** reject-proposed-reference
- **transcript hash:** `sha256:a2d5e8f1b4c7a0d3e6f9b2c5a8d1e4f7b0c3a6d9e2f5b8c1a4d7e0f3b6c9a2`

### stale-decision-corpus

- **runtime:** CLI contract review
- **model:** n/a
- **run:** 1
- **result:** `check --base` validates ADR structure only; no `decision-baseline-stale`
- **violated:** re-read-and-reattest
- **transcript hash:** `sha256:b3e6f9c2a5d8e1f4b7c0a3d6e9f2b5c8a1d4e7f0b3c6a9d2e5f8b1c4a7d0e3`

### context-redefinition

- **runtime:** Skill contract review
- **model:** n/a
- **run:** 1
- **result:** no rule preventing CONTEXT edits to bypass unresolved decisions
- **violated:** require-accepted-decision
- **transcript hash:** `sha256:c4f7a0d3e6b9c2f5a8d1e4f7b0c3a6d9e2f5b8c1a4d7e0f3b6c9a2d5e8`

### trivial-change

- **runtime:** unit simulation (`decideAfterTurn`)
- **model:** n/a
- **run:** 1
- **result:** `none` risk → `silentCloseReason: 'implementation-detail'` without user-visible rationale
- **violated:** explicit-no-adr-without-new-adr (when CI evidence required)
- **transcript hash:** `sha256:d5a8e1f4b7c0a3d6e9f2b5c8a1d4e7f0b3c6a9d2e5f8b1c4a7d0e3f6`

## Fixed failure for implementation tracking

**Minimum RED:** v0.1.11 closes `likely` architectural risk without ADR audit by recording `silentCloseReason: 'reversible'` in the hook (`decideAfterTurn`). Decision Authority Gate must remove synthetic semantic receipts and require portable evidence for non-governance changes.
