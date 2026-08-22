# Implementation status (vs design spec)

Design spec: `docs/superpowers/specs/2026-08-22-adr-governance-design.md` in the [guilz](https://github.com/guilz-dev/guilz) monorepo.

**Current release:** v0.1.2

## Implemented

| Area | Status |
|------|--------|
| Skill `managing-adrs` + references | Done |
| Bundled CLI + hook (`.mjs`) | Done |
| split / single layout detection | Done |
| Legacy ADR index + `documents.legacyFrontmatter` | Done |
| init scan → OS temp dir; apply two-phase | Done |
| init plan ops: create / replace-generated / merge-jsonc + hash check | Done |
| Hook merge (Cursor / Claude / Codex / Gemini) | Done |
| after-turn fingerprint + doc path audit | Done |
| `check`: ADR validation, manifest drift, hook entries, CONTEXT links | Done |
| `sync` conflict on hand-edited generated files | Done |
| Human promotion audit log (ndjson) | Done |
| CI workflow candidate in init plan (GitHub Actions) | Done |
| Unit + integration + adapter contract tests | Partial |

## Not yet implemented (spec §18 / backlog)

| Area | Notes |
|------|--------|
| Skill behavior TDD across 4 live runtimes | Manual / agent-driven baseline still required |
| Full adapter golden fixtures from official runtime schemas | Contract tests cover core shapes only |
| Concurrent create integration test | Lock logic exists; dedicated test pending |
| promote rollback on partial failure | git mv + write; manual recovery if write fails after mv |
| Behavior test suite directory | `tests/behavior/` placeholder |

## Target project init

```bash
node /path/to/adr-governance/dist/bundle/cli.mjs init --repo /path/to/repo
# Review plan + evidence under $TMPDIR/adr-governance-init/<hash>/
node /path/to/adr-governance/dist/bundle/cli.mjs init --apply /path/to/plan.json --repo /path/to/repo
```

After apply, approve Cursor project hooks if prompted.
