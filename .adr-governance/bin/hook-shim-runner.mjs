import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const DEFAULT_TIMEOUT_MS = 1500

async function readTimeoutMs(repoRoot) {
  try {
    const raw = JSON.parse(await readFile(path.join(repoRoot, 'adr.config.json'), 'utf8'))
    const timeoutMs = raw?.hooks?.timeoutMs
    if (Number.isFinite(timeoutMs) && timeoutMs >= 100 && timeoutMs <= 1900) return timeoutMs
  } catch {
    // Use default when config is missing or unreadable.
  }
  return DEFAULT_TIMEOUT_MS
}

export async function runHookShim({
  runtime,
  phase,
  repoRoot,
  stdin,
  timeoutMs,
  failOpenOutput,
}) {
  const resolvedTimeout = timeoutMs ?? (await readTimeoutMs(repoRoot))
  const hookBin = path.join(repoRoot, '.adr-governance/bin/hook.mjs')
  const failOpenJson = `${JSON.stringify(failOpenOutput)}\n`

  return new Promise((resolve) => {
    let settled = false
    const child = spawn(process.execPath, [hookBin, runtime, phase], {
      cwd: repoRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const stdoutChunks = []
    const onStdout = (chunk) => stdoutChunks.push(chunk)
    child.stdout.on('data', onStdout)
    child.stderr.resume()
    child.stdin.on('error', () => finish(failOpenJson, 0))

    const finish = (output, code = 0) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.stdout.off('data', onStdout)
      child.stdin.destroy()
      child.stdout.destroy()
      child.stderr.destroy()
      try {
        child.kill('SIGKILL')
      } catch {
        // Child may already be gone.
      }
      process.stdout.write(output)
      process.exitCode = code
      resolve()
    }

    // Emit fail-open immediately at the inner deadline; the outer runtime budget
    // also reserves time for starting this shim and flushing its result.
    const timer = setTimeout(() => finish(failOpenJson, 0), resolvedTimeout)

    child.stdin.end(stdin)
    child.on('error', () => finish(failOpenJson, 0))
    child.on('close', (code) => {
      if (settled) return
      if (code === 0) {
        finish(Buffer.concat(stdoutChunks).length > 0 ? Buffer.concat(stdoutChunks) : failOpenJson, 0)
        return
      }
      finish(failOpenJson, 0)
    })
  })
}
