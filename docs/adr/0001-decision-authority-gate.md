---
status: accepted
date: 2026-09-03
acceptance: human
---

# Decision Authority Gate

## Context

adr-governance v0.1.x allowed hooks to silently record no-ADR reasons and did not require machine-verifiable decision evidence for non-governance code changes. Proposed ADRs could be treated informally as implementation authority.

## Decision

Adopt a **Decision Authority Gate** with provider-neutral `DecisionEvidence`, `attest` for humans/agents, and fail-closed `check --base` in CI.

### Rules

1. **Proposed ADRs are not implementation authority.** They may inform investigation but cannot appear in `outcome.refs`.
2. **Non-governance changes** require either `accepted-adr` evidence or explicit `no-adr` with reason and non-empty rationale.
3. **Decision corpus invalidation:** evidence is bound to the base ref decision corpus hash; ADR/CONTEXT changes on base invalidate prior attestations.
4. **Hooks observe risk only** — they must not fabricate `NoAdrReason` or parent receipts.
5. **CI is fail-closed** when base ref, evidence, or corpus cannot be validated.
6. **Exact change-set freshness:** ADR-0002 extends evidence freshness from the
   base decision corpus to the exact repository snapshot being attested.
7. **Trusted evaluation:** base-dependent checks use the immutable base policy and generated-artifact registrations. CI executes the base verifier outside the PR checkout. A PR cannot grant itself exemptions by editing its config, manifest or verifier bundle. The CI workflow and its selected base remain part of the repository's review/protection boundary.

### Rejected alternatives

| Alternative | Why rejected |
|-------------|--------------|
| Skill-only reminders | Not machine-enforceable in CI |
| Diff heuristics without evidence | Cannot prove which ADR authorized a change |
| Provider-specific PR checks only | Breaks portability; core must stay provider-neutral |

## Consequences

- Config v2 adds `changeGate` with `off` | `warn` | `enforce`.
- New CLI: `attest`, extended `check --base --evidence` / `--github-event`.
- Hooks request at most one audit follow-up for actual repository changes or unresolved likely risk; CI gate remains authoritative.
- Self-hosting: this repository applies the gate to its own releases starting v0.2.0.

## References

- [ADR-0002: Bind Decision Evidence to the Exact Change Set](./0002-bind-evidence-to-exact-changeset.md)
- Implementation plan: `docs/superpowers/plans/2026-09-03-decision-authority-gate.md`
- Design spec: `docs/specs/adr-governance-design.md`
