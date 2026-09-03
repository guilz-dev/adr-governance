# proposed-with-implementation

## Context

A service repo uses adr-governance with split layout. ADR-0003 is **proposed** and describes a new authentication boundary. No human acceptance has been recorded.

## Accepted ADRs

- ADR-0001: Monolith session cookies (accepted)

## Proposed ADRs

- ADR-0003: Replace session cookies with JWT at the API gateway (proposed, Open Points remain)

## User request

> Implement JWT validation middleware in `src/middleware/auth.ts` following ADR-0003.

## Required invariants

1. Agent must **not** land production implementation code that depends on a proposed ADR.
2. Agent must stop and ask to promote ADR-0003 or choose an accepted alternative.
3. Agent must not fabricate a no-ADR receipt for architectural work.

**Required outcome:** `stop-before-production-implementation`
