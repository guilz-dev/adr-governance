import { describe, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { defaultConfig } from '../../src/core/config.js'

const runtimes = [
  { name: 'cursor', dir: '.cursor/hooks', failOpen: { continue: true } },
  { name: 'claude', dir: '.claude/hooks', failOpen: { continue: true } },
  { name: 'codex', dir: '.codex/hooks', failOpen: { continue: true } },
  { name: 'gemini', dir: '.gemini/hooks', failOpen: { decision: 'allow' } },
] as const

async function setupHangRepo(runtime: typeof runtimes[number]): Promise<string> {
  const repo = await mkdtemp(path.join(tmpdir(), `adr-shim-timeout-${runtime.name}-`))
  const config = defaultConfig({
    hooks: { enabled: true, afterTurnAudit: true, maxFollowUps: 1, timeoutMs: 200 },
  })
  await writeFile(path.join(repo, 'adr.config.json'), JSON.stringify(config, null, 2))
  await mkdir(path.join(repo, '.adr-governance/bin'), { recursive: true })
  await mkdir(path.join(repo, runtime.dir), { recursive: true })
  await writeFile(path.join(repo, '.adr-governance/manifest.json'), '{}\n')
  await writeFile(path.join(repo, '.adr-governance/bin/hook.mjs'), "setInterval(() => {}, 1000)\n")

  const runnerSrc = path.resolve(import.meta.dirname, '../../templates/shared/hook-shim-runner.mjs')
  const shimSrc = path.resolve(import.meta.dirname, `../../templates/${runtime.name}/hooks/adr-governance.mjs`)
  await writeFile(
    path.join(repo, '.adr-governance/bin/hook-shim-runner.mjs'),
    await readFile(runnerSrc, 'utf8'),
  )
  await writeFile(path.join(repo, runtime.dir, 'adr-governance.mjs'), await readFile(shimSrc, 'utf8'))
  return repo
}

function runShim(repo: string, runtime: typeof runtimes[number]): Promise<{ stdout: string; elapsedMs: number }> {
  const shim = path.join(repo, runtime.dir, 'adr-governance.mjs')
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [shim, 'before-turn'], {
      cwd: repo,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        GEMINI_PROJECT_DIR: repo,
        CLAUDE_PROJECT_DIR: repo,
      },
    })
    const stdoutChunks: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk))
    child.on('error', reject)
    child.on('exit', () => {
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        elapsedMs: Date.now() - started,
      })
    })
    child.stdin.end('{}')
  })
}

describe('hook shim timeout', () => {
  for (const runtime of runtimes) {
    it(`bounds ${runtime.name} shim execution`, async () => {
      const repo = await setupHangRepo(runtime)
      const { stdout, elapsedMs } = await runShim(repo, runtime)
      expect(elapsedMs).toBeLessThan(2000)
      expect(JSON.parse(stdout.trim())).toEqual(runtime.failOpen)
      expect(stdout.trim().split('\n')).toHaveLength(1)
    })
  }
})
