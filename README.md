# adr-governance

Multi-runtime ADR governance for coding agents — shared Skill (`managing-adrs`), bundled CLI, and hooks for **Cursor**, **Claude Code**, **Codex CLI**, and **Gemini CLI**.

Design spec: see [docs in consuming repos] or the governance design document that originated this package.

## Quick start (target project)

From a release or this repo:

```bash
# Scan only — does not modify tracked files
node /path/to/adr-governance/dist/bundle/cli.mjs init --repo /path/to/your-repo

# After reviewing .adr-governance/init-output/init-plan.json
node /path/to/adr-governance/dist/bundle/cli.mjs init --apply .adr-governance/init-output/init-plan.json --repo /path/to/your-repo
```

After apply, the target repo contains:

- `.agents/skills/managing-adrs/` — Skill canonical copy
- `.adr-governance/bin/cli.mjs` + `hook.mjs` — self-contained bundles (no npm install in target)
- `adr.config.json` — layout and policy
- Runtime shims under `.cursor/`, `.claude/`, `.codex/`, `.gemini/`

## Development

```bash
pnpm install
pnpm build
pnpm test
```

## CLI (in target repo after init)

```bash
node .adr-governance/bin/cli.mjs check [--base origin/main]
node .adr-governance/bin/cli.mjs create --status proposed --title "..." --body-file body.md
node .adr-governance/bin/cli.mjs promote ADR-0007
node .adr-governance/bin/cli.mjs supersede ADR-0002 --by ADR-0008
node .adr-governance/bin/cli.mjs sync --from /path/to/adr-governance
node .adr-governance/bin/cli.mjs turn-close --outcome no-change --reason reversible
```

## Principles

1. **Three criteria** for new ADRs: hard to reverse, surprising without context, real trade-off.
2. **ADR** = what & why; **CONTEXT** = domain language.
3. **Split layout** by default: `docs/adr/` (accepted) + `docs/proposed-adr/` (proposed).
4. Hooks are **fail-open**; `check` is **fail-closed** for CI.
5. No prompt/transcript persistence; prompt content is hashed only.

## License

MIT
