import { execFile } from 'node:child_process'
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

export function isGitRepo(repoRoot: string): boolean {
  return Boolean(repoRoot)
}
