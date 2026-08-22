import { execFile } from 'node:child_process'
import { mkdir, rename } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export async function gitLsFiles(repoRoot: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync('git', ['ls-files'], { cwd: repoRoot })
    return stdout.split('\n').filter(Boolean)
  } catch {
    return []
  }
}

export async function gitRevParse(repoRoot: string, ref: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', ref], { cwd: repoRoot })
    return stdout.trim()
  } catch {
    return null
  }
}

export async function gitRoot(startPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], {
      cwd: startPath,
    })
    return stdout.trim()
  } catch {
    return null
  }
}

export async function gitMv(repoRoot: string, from: string, to: string): Promise<void> {
  await execFileAsync('git', ['mv', from, to], { cwd: repoRoot })
}

export async function movePathInRepo(
  repoRoot: string,
  from: string,
  to: string,
): Promise<'git' | 'fs'> {
  try {
    await gitMv(repoRoot, from, to)
    return 'git'
  } catch {
    const fromAbs = path.join(repoRoot, from)
    const toAbs = path.join(repoRoot, to)
    await mkdir(path.dirname(toAbs), { recursive: true })
    await rename(fromAbs, toAbs)
    return 'fs'
  }
}

export function isGitRepo(repoRoot: string): boolean {
  return Boolean(repoRoot)
}
