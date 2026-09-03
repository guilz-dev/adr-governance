# adr-governance design specification

**Authoritative source of truth** for the standalone [adr-governance](https://github.com/guilz-dev/adr-governance) repository.

Legacy copy in the guilz monorepo (`docs/superpowers/specs/2026-08-22-adr-governance-design.md`) is a historical pointer only.

**Version:** 0.2.0 (Decision Authority Gate)

---

## 1. Purpose

Provide portable ADR governance for agent-assisted development: Skill guidance, CLI tooling, optional interactive hooks, and CI enforcement. The system helps teams record hard-to-reverse, surprising, trade-off decisions without blocking trivial work.

## 2. ADR criteria (unchanged)

All three must hold to create a new ADR:

1. Hard to reverse
2. Surprising without context
3. Real trade-off

`proposed` records unresolved decisions. `accepted` records firm decisions with valid acceptance metadata.

## 3. Layout

- **split:** `docs/adr/` (accepted) + `docs/proposed-adr/` (proposed/rejected)
- **single:** one directory for all statuses
- **CONTEXT.md** / **CONTEXT-MAP.md** for glossary (not implementation logs)

## 4. Config

`adr.config.json` schema versions:

| Version | Behavior |
|---------|----------|
| 1 | Legacy; `changeGate.mode` treated as `off` with migration warning |
| 2 | Default for new init; `changeGate` required |

```ts
export type ChangeGateConfig = {
  mode: 'off' | 'warn' | 'enforce'
  exemptPaths: string[]
  requireNoAdrRationale: boolean
}
```

## 5. Decision Authority Gate (§9.5 revised)

### 5.1 Invariants

1. Proposed ADRs are not implementation authority.
2. Non-governance changes require `accepted-adr` or `no-adr` evidence.
3. Updating ADR/CONTEXT alone does not authorize implementation.
4. Hooks must not fabricate semantic judgments.
5. Evidence is valid only for the attested base decision corpus hash.
6. Base corpus changes invalidate prior evidence.
7. Unreadable base ref → fail-closed in enforce mode.
8. Changed proposed ADRs require `reviewedProposals` declaration.

### 5.2 DecisionEvidence

```ts
export type DecisionEvidence = {
  schemaVersion: 1
  decisionCorpusHash: string
  outcome:
    | { kind: 'accepted-adr'; refs: Array<{ id: string; contentHash: string }> }
    | { kind: 'no-adr'; reason: NoAdrReason; rationale: string }
  reviewedProposals: Array<{ id: string; relation: 'unrelated' }>
}
```

### 5.3 CLI

```text
adr-governance attest --base <ref> --adr ADR-NNNN [--format json|github-markdown]
adr-governance attest --base <ref> --no-adr <reason> --rationale <text>
adr-governance check --base <ref> --evidence <json-path>
adr-governance check --base <ref> --github-event <event-path>
```

GitHub PR bodies embed a single fenced `adr-governance` JSON block. Adapters read `$GITHUB_EVENT_PATH` only (no API calls).

### 5.4 Validation codes

| Code | enforce |
|------|---------|
| `base-ref-unavailable` | error |
| `decision-evidence-required` | error |
| `decision-evidence-invalid` | error |
| `decision-baseline-stale` | error |
| `decision-ref-not-accepted` | error |
| `decision-ref-stale` | error |
| `changed-proposal-unreviewed` | error |
| `invalid-status-transition` | error |
| `accepted-without-acceptance` | error |
| `proposed-with-acceptance` | error |

`warn` mode downgrades change-gate errors to warnings; structural validation stays error.

## 6. Hooks (§11.3 revised)

- **before-turn:** risk signals, standing reminder
- **after-turn:** at most one audit follow-up when likely risk + no docs update + no receipt; no synthetic `NoAdrReason`
- Interactive hook failures: **fail-open**
- CI `check`: **fail-closed**

## 7. Lifecycle (§18.1 revised)

Allowed transitions:

```text
proposed → proposed | accepted | rejected
accepted → accepted | superseded | deprecated
rejected → rejected
superseded → superseded
deprecated → deprecated
```

New/changed accepted ADRs require acceptance metadata. Proposed ADRs must not carry acceptance metadata. Supersession requires reciprocal `supersedes` references.

## 8. Init and CI (§19 revised)

Generated GitHub workflow:

- `fetch-depth: 0`
- `check --base "${{ github.event.pull_request.base.sha }}" --github-event "$GITHUB_EVENT_PATH"`
- PR template instructs agents to paste `attest --format github-markdown` output

Protected-branch pushes run structural check without change evidence.

## 9. Skill behavior (§21 revised)

Agents must:

- Treat proposed ADRs as non-authoritative for implementation
- Reference accepted ADRs or explicit no-ADR before non-governance edits
- Re-attest when `decision-baseline-stale`
- Never narrow CONTEXT to bypass unresolved decisions

## 10. Security (§23)

- No external LLM calls in core/hooks
- No secrets, tokens, or transcript bodies in evidence/state
- Provider-specific logic stays in adapters

## 11. Migration

- v1 configs: advisory gate off until explicit migration
- New init: v2 + enforce + full-history CI
- Rollback: set `changeGate.mode` to `warn` only; do not restore synthetic receipts
