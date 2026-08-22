# ADR Decision Policy

## Three criteria (all required)

1. **Hard to reverse** — changing later has meaningful cost.
2. **Surprising without context** — a future reader might undo deliberate design without knowing why.
3. **Real trade-off** — viable alternatives existed; you chose one for explicit reasons.

If any criterion fails, do not create an ADR. Use code, tests, or ordinary docs.

## ADR vs CONTEXT

| Artifact | Holds |
|----------|--------|
| ADR | What was decided and why |
| CONTEXT | Domain term meanings and terms to avoid |

## Status lifecycle

- **proposed** — under discussion; may include `## Open Points`
- **accepted** — decision firm; no Open Points
- **rejected** — declined proposed option; stays in proposed dir
- **superseded** — replaced by a newer ADR (`superseded_by: ADR-NNNN`)
- **deprecated** — no longer recommended but kept for history

## Accepted ADR edits

- OK: clarifications, typos, links, non-decision consequences
- Not OK: changing conclusion, major constraints, or trade-offs — create new ADR + supersede

## Promotion

- Default: automatic acceptance when decision is firm (`promotion.requireHumanAcceptance: false`)
- When true: stay proposed until explicit human approval; record `acceptance: human`

## No-ADR reason codes

- `no-decision` — no decision made yet
- `reversible` — easy to undo
- `obvious` — not surprising without context
- `no-tradeoff` — no realistic alternative
- `implementation-detail` — code/tests suffice
- `already-recorded` — existing ADR covers it
