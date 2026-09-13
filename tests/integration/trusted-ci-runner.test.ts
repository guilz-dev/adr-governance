import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { ciWorkflowSuggestion } from '../../src/analysis/init-hints.js'
import { gitCommit, initTestGitRepo } from '../helpers/git-test-repo.js'

const dirs: string[] = []
afterEach(async () => { await Promise.all(dirs.splice(0).map(p => rm(p, { recursive: true, force: true }))) })

it('executes the base bundle even when the PR replaces the bundled checker', async () => {
  const repo = await mkdtemp(path.join(tmpdir(), 'adr-ci-head-'))
  const runner = await mkdtemp(path.join(tmpdir(), 'adr-ci-runner-'))
  dirs.push(repo, runner)
  initTestGitRepo(repo)
  const bundle = path.join(repo, '.adr-governance/bin/cli.mjs')
  await mkdir(path.dirname(bundle), { recursive: true })
  await writeFile(bundle, `import {writeFileSync} from 'node:fs'; writeFileSync(process.env.CHECK_OBSERVATION, JSON.stringify({source:'base',args:process.argv.slice(2)}));`)
  execFileSync('git', ['add', '.'], { cwd: repo })
  gitCommit(repo, 'trusted bundle')
  const base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim()
  await writeFile(bundle, `import {writeFileSync} from 'node:fs'; writeFileSync(process.env.CHECK_OBSERVATION, JSON.stringify({source:'head'}));`)

  // Exercise the generated PR command, not a second copy of its implementation.
  const job = ciWorkflowSuggestion().split('  adr-check-push:')[0]!
  const match = /      - run: ([>|])-?\n((?:          .*\n)+)/.exec(job)
  expect(match).not.toBeNull()
  const lines = match![2]!.trimEnd().split('\n').map(line => line.slice(10))
  const command = (match![1] === '>' ? lines.join(' ') : lines.join('\n')).replaceAll('${{ github.event.pull_request.base.sha }}', base)
  const observation = path.join(runner, 'observation.json')
  execFileSync('bash', ['-e', '-o', 'pipefail', '-c', command], {
    cwd: repo,
    env: { ...process.env, BASE_SHA: base, GITHUB_WORKSPACE: repo, RUNNER_TEMP: runner, GITHUB_EVENT_PATH: path.join(runner, 'event.json'), CHECK_OBSERVATION: observation },
  })
  const result = JSON.parse(await readFile(observation, 'utf8'))
  expect(result.source).toBe('base')
  expect(result.args).toEqual(['check', '--repo', repo, '--base', base, '--github-event', path.join(runner, 'event.json')])
})
