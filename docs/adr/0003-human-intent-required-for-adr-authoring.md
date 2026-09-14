---
status: accepted
date: 2026-09-14
acceptance: human
---

# Human Intent Required for ADR Authoring

## Context

AI coding agents can satisfy ADR governance hooks by drafting ADR/CONTEXT files when the three criteria match, even without the user asking for documentation. CI could also be satisfied by adding ADR-only changes without proper decision evidence. This produces unsolicited ADR sprawl and weakens the decision record.

## Decision

Require explicit human intent before ADR authoring CLI operations and treat the three criteria as a **record candidate** signal, not an automatic write trigger.

### Rules

1. **Write gate:** `create`, `promote`, and `supersede` require `--approval human`.
2. **AI default behavior:** reference existing ADRs, suggest when criteria may apply, author only on explicit user instruction.
3. **Direct accepted add forbidden:** new accepted ADRs must enter via proposed + promote, not direct file add.
4. **ADR-only PR bypass closed:** new ADR markdown files require decision evidence; `attest --no-adr` cannot authorize ADR authoring.
5. **turn-close** records no-ADR receipts; it is not a substitute for ADR authoring.

## Consequences

- Hooks and Skill text no longer instruct agents to "update ADR/CONTEXT" automatically.
- `manifest-refresh` CLI command rebuilds `.adr-governance/manifest.json`.
- `check --base` validates new ADR files against evidence and blocks direct accepted adds.

## References

- [ADR-0001: Decision Authority Gate](./0001-decision-authority-gate.md)
- [ADR-0002: Bind Decision Evidence to the Exact Change Set](./0002-bind-evidence-to-exact-changeset.md)
