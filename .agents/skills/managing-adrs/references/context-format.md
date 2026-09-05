# CONTEXT Format

## Single context (most repos)

Root `CONTEXT.md`:

```md
# Context Name

One or two sentences describing this bounded context.

## Language

**Term**:
Definition in one or two sentences.
_Avoid_: synonym, ambiguous term
```

## Multi-context

Root `CONTEXT-MAP.md` indexes contexts; each has its own `CONTEXT.md`.

## Rules

- Domain-specific terms only — not general programming vocabulary
- No implementation steps, API paths, or table names
- Link to ADR only when term meaning comes from a recorded decision
- Keep definitions tight; use `_Avoid_` for confusing synonyms
