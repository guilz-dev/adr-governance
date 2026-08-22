# adr-governance

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](./package.json)

Multi-runtime ADR governance for coding agents — shared Skill (`managing-adrs`), bundled CLI, and hooks for **Cursor**, **Claude Code**, **Codex CLI**, and **Gemini CLI**.

## Open source

This project is **MIT licensed** and structured for open-source distribution (npm package, standalone clone, or future public GitHub).

The GitHub repository is currently **private**. Source access requires organization membership or an explicit grant from maintainers. See [CONTRIBUTING.md](./CONTRIBUTING.md) and [SECURITY.md](./SECURITY.md).

- **Repository:** https://github.com/guilz-dev/adr-governance
- **License:** [MIT](./LICENSE)
- **Changelog:** [CHANGELOG.md](./CHANGELOG.md)
- **Design spec:** [guilz monorepo spec](https://github.com/guilz-dev/guilz/blob/develop/docs/superpowers/specs/2026-08-22-adr-governance-design.md)
- **Implementation status:** [docs/IMPLEMENTATION-STATUS.md](./docs/IMPLEMENTATION-STATUS.md)

## Quick start (target project)

```bash
# 1. Read-only scan (writes plan + evidence to OS temp dir only)
node /path/to/adr-governance/dist/bundle/cli.mjs init --repo /path/to/your-repo

# 2. Review $TMPDIR/adr-governance-init/<hash>/init-plan.json

# 3. Apply after approval
node /path/to/adr-governance/dist/bundle/cli.mjs init \
  --apply /path/to/init-plan.json \
  --repo /path/to/your-repo
```

When using the **installed** CLI inside a target repo (`.adr-governance/bin/cli.mjs`), pass the package source for apply and sync:

```bash
node .adr-governance/bin/cli.mjs init --apply /path/to/init-plan.json \
  --from /path/to/adr-governance --repo .
node .adr-governance/bin/cli.mjs sync --from /path/to/adr-governance --repo .
```

After apply, the target repo contains:

- `.agents/skills/managing-adrs/` — Skill canonical copy
- `.adr-governance/bin/cli.mjs` + `hook.mjs` — self-contained bundles
- `adr.config.json` — layout, hooks, `legacyFrontmatter` when detected
- Runtime shims + **merged** hook entries in `.cursor/hooks.json` etc.

If Cursor asks to trust project hooks, approve `adr-governance` hooks.

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
node .adr-governance/bin/cli.mjs promote ADR-0007 [--approval human]
node .adr-governance/bin/cli.mjs supersede ADR-0002 --by ADR-0008
node .adr-governance/bin/cli.mjs sync --from /path/to/adr-governance
node .adr-governance/bin/cli.mjs turn-close --outcome no-change --reason reversible
```

## Principles

1. **Three criteria** for new ADRs: hard to reverse, surprising without context, real trade-off.
2. **ADR** = what & why; **CONTEXT** = domain language.
3. **Split layout** by default: `docs/adr/` + `docs/proposed-adr/`.
4. Hooks **fail-open**; `check` **fail-closed** for CI.
5. Prompt/transcript bodies are not persisted (SHA-256 only).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Please read [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) before participating.

## Security

See [SECURITY.md](./SECURITY.md) for vulnerability reporting.

## License

MIT © [guilz-dev](./LICENSE)
