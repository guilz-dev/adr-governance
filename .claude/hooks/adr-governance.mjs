#!/usr/bin/env node
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

function findRepoRoot(start) {
  let current = path.resolve(start)
  while (true) {
    if (
      existsSync(path.join(current, 'adr.config.json')) &&
      existsSync(path.join(current, '.adr-governance/manifest.json'))
    ) {
      return current
    }
    const parent = path.dirname(current)
    if (parent === current) return null
    current = parent
  }
}

const phase = process.argv[2] ?? 'before-turn'
const repoRoot =
  process.env.CLAUDE_PROJECT_DIR ??
  findRepoRoot(path.dirname(fileURLToPath(import.meta.url))) ??
  findRepoRoot(process.cwd())
const failOpenOutput = { continue: true }

if (!repoRoot) {
  process.stdout.write(JSON.stringify(failOpenOutput))
  process.exit(0)
}

const chunks = []
for await (const chunk of process.stdin) chunks.push(chunk)
const stdin = Buffer.concat(chunks)
const { runHookShim } = await import(
  path.join(repoRoot, '.adr-governance/bin/hook-shim-runner.mjs')
)
await runHookShim({
  runtime: 'claude',
  phase,
  repoRoot,
  stdin,
  failOpenOutput,
})
