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
acceptance: human
---
```

Use `acceptance: human` when promoted or created with `--approval human`. Do not add accepted ADR files directly — use proposed + promote.

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

## CLI authoring

All ADR authoring commands require explicit human intent:

```bash
node .adr-governance/bin/cli.mjs create --status proposed --title "..." --body-file body.md --approval human
node .adr-governance/bin/cli.mjs promote ADR-0007 --approval human
node .adr-governance/bin/cli.mjs supersede ADR-0002 --by ADR-0008 --approval human
```
