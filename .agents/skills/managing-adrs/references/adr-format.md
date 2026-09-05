# ADR Format

## Filename

`NNNN-kebab-case-slug.md` — number is unique across `docs/adr/` and `docs/proposed-adr/`.

## Frontmatter

```yaml
---
status: proposed
date: YYYY-MM-DD
---
```

Accepted:

```yaml
---
status: accepted
date: YYYY-MM-DD
acceptance: automatic
---
```

Superseded:

```yaml
---
status: superseded
date: YYYY-MM-DD
superseded_by: ADR-0008
---
```

## Body minimum

```md
# Short decision title

Context, conclusion, and rationale in 1–3 paragraphs.
```

Optional sections (only when valuable):

- `## Considered Options`
- `## Consequences`
- `## Open Points` (proposed only)

Do not fill template sections with placeholder text.
