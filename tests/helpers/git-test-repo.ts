import { execFileSync } from 'node:child_process'

export function initTestGitRepo(cwd: string, branch = 'main'): void {
  execFileSync('git', ['init', '-b', branch], { cwd })
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd })
  execFileSync('git', ['config', 'user.name', 'Test User'], { cwd })
}

export function gitCommit(cwd: string, message: string, allowEmpty = false): void {
  const args = allowEmpty
    ? ['commit', '--allow-empty', '-m', message]
    : ['commit', '-m', message]
  execFileSync('git', args, { cwd })
}
