#!/usr/bin/env node
import { spawn } from 'node:child_process'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { execSync } from 'node:child_process'

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

function gitRoot(cwd) {
  try {
    return execSync('git rev-parse --show-toplevel', { cwd, encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

function failOpen() {
  process.stdout.write(JSON.stringify({ continue: true }))
}

const phase = process.argv[2] ?? 'before-turn'
const repoRoot = gitRoot(process.cwd()) ?? findRepoRoot(process.cwd())

if (!repoRoot) {
  failOpen()
  process.exit(0)
}

const hookBin = path.join(repoRoot, '.adr-governance/bin/hook.mjs')
const chunks = []
for await (const chunk of process.stdin) chunks.push(chunk)
const child = spawn(process.execPath, [hookBin, 'codex', phase], {
  cwd: repoRoot,
  stdio: ['pipe', 'pipe', 'inherit'],
})
child.stdin.end(Buffer.concat(chunks))
child.stdout.pipe(process.stdout)
child.on('error', () => {
  failOpen()
  process.exit(0)
})
child.on('exit', (code) => process.exit(code ?? 0))
