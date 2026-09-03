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

- Implementation plan: `docs/superpowers/plans/2026-09-03-decision-authority-gate.md`
- Design spec: `docs/specs/adr-governance-design.md`
