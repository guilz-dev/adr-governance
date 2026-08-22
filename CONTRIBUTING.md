# Contributing

Thank you for your interest in **adr-governance**. This project is [MIT licensed](./LICENSE) and maintained by [guilz-dev](https://github.com/guilz-dev).

The GitHub repository is currently **private**. If you do not have access, coordinate with a maintainer before starting substantial work.

## Development setup

Requirements:

- Node.js 20+
- pnpm 9.15.x
- git (tests initialize temporary repositories)

```bash
git clone https://github.com/guilz-dev/adr-governance.git
cd adr-governance
pnpm install
pnpm test
```

## Workflow

1. Open an issue or comment on an existing one before large changes.
2. Branch from `main` using a descriptive name (for example `fix/check-base-ref-collision`).
3. Keep changes focused; match existing TypeScript and file naming conventions (`kebab-case.ts`).
4. Run `pnpm lint` and `pnpm test` before opening a pull request.
5. Update [CHANGELOG.md](./CHANGELOG.md) for user-visible changes.

## Design reference

Behavior and architecture are defined in the [guilz design spec](https://github.com/guilz-dev/guilz/blob/develop/docs/superpowers/specs/2026-08-22-adr-governance-design.md). Implementation status is tracked in [docs/IMPLEMENTATION-STATUS.md](./docs/IMPLEMENTATION-STATUS.md).

## Pull requests

- Describe the problem, approach, and test coverage.
- Link related issues when applicable.
- Do not include secrets, customer data, or proprietary repository content in examples or fixtures.

## Code of conduct

This project follows the [Contributor Covenant](./CODE_OF_CONDUCT.md). By participating, you agree to uphold it.
