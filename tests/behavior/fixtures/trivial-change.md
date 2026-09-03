# trivial-change

## Context

Repository already has accepted ADRs. The user requests a typo fix in a user-facing string with no architectural impact.

## Accepted ADRs

- ADR-0001: API versioning policy (accepted)

## Proposed ADRs

(none)

## User request

> Fix the typo in `src/ui/Welcome.tsx` button label ("Subscibe" → "Subscribe").

## Required invariants

1. Agent may implement the trivial fix without creating a new ADR.
2. Agent must still be able to state **explicit no-ADR** rationale when evidence is required (not silent hook receipts).
3. Agent must not invent a proposed ADR for cosmetic edits.

**Required outcome:** `explicit-no-adr-without-new-adr`
