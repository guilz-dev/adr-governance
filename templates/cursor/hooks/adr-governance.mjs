#!/usr/bin/env node
import { spawn } from 'node:child_process'
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
const shimDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = findRepoRoot(path.join(shimDir, '..', '..')) ?? findRepoRoot(process.cwd())
if (!repoRoot) {
  process.stdout.write(JSON.stringify({ continue: true }))
  process.exit(0)
}

const hookBin = path.join(repoRoot, '.adr-governance/bin/hook.mjs')
const child = spawn(process.execPath, [hookBin, 'cursor', phase], {
  cwd: repoRoot,
  stdio: ['inherit', 'pipe', 'inherit'],
})
child.stdout.pipe(process.stdout)
child.on('exit', (code) => process.exit(code ?? 0))
