import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

async function git(repoRoot: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd: repoRoot,
    maxBuffer: 10 * 1024 * 1024,
  })
  return stdout
}

function parsePathList(output: string): string[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

export async function listChangedPaths(repoRoot: string, baseRef: string): Promise<string[]> {
  const paths = new Set<string>()

  const diff = await git(repoRoot, ['diff', '--name-only', `${baseRef}...HEAD`])
  for (const p of parsePathList(diff)) paths.add(p)

  const status = await git(repoRoot, ['status', '--porcelain', '-u', '--untracked-files=all'])
  for (const line of status.split('\n')) {
    if (!line.trim()) continue
    const raw = line.slice(3).trim()
    const filePath = raw.includes(' -> ') ? (raw.split(' -> ').pop() ?? raw) : raw
    if (filePath) paths.add(filePath)
  }

  return [...paths].sort()
}

export async function readFileAtRef(
  repoRoot: string,
  ref: string,
  relativePath: string,
): Promise<string | null> {
  const normalized = relativePath.split(path.sep).join('/')
  try {
    return (await git(repoRoot, ['show', `${ref}:${normalized}`])).replace(/\r\n/g, '\n')
  } catch {
    return null
  }
}

export async function refExists(repoRoot: string, ref: string): Promise<boolean> {
  try {
    await git(repoRoot, ['rev-parse', '--verify', ref])
    return true
  } catch {
    return false
  }
}
