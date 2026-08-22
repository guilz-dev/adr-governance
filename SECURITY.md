# Security policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 0.1.x   | Yes       |

## Reporting a vulnerability

**Do not open a public GitHub issue for security reports.**

The repository is private. Report vulnerabilities to the maintainers through your existing guilz-dev contact channel, or email the organization owners if you have a security contact on file.

Include:

- Affected version
- Steps to reproduce
- Impact assessment
- Suggested fix (if any)

We aim to acknowledge reports within a few business days.

## Scope

In scope:

- CLI and hook bundle execution on developer machines
- Init plan apply path traversal, symlink, or hash-bypass issues
- Hook merge corrupting runtime configuration
- Information disclosure via state files or audit logs

Out of scope:

- Vulnerabilities in third-party coding agents (Cursor, Claude Code, Codex, Gemini)
- Issues in target repositories caused by misconfiguration after `init --apply`

## Safe defaults

- Hooks **fail open** so agent sessions are not blocked by governance tooling errors.
- `check` **fail closed** for CI validation.
- Prompt bodies are hashed (SHA-256); raw prompts are not written to disk by this tool.
