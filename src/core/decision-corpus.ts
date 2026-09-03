import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import type { AdrConfig } from './types.js'
import { sha256 } from './numbering.js'

export type DecisionCorpusEntry = { path: string; contentHash: string }

function normalizeRepoPath(relativePath: string): string {
  return relativePath.split(path.sep).join('/')
}

function isAdrMarkdown(relativePath: string): boolean {
  const name = relativePath.split('/').pop() ?? relativePath
  return name.endsWith('.md') && name !== 'README.md'
}

function corpusDirectories(config: AdrConfig): string[] {
  const dirs = [config.layout.acceptedDir]
  if (config.layout.mode === 'split' || config.layout.acceptedDir !== config.layout.proposedDir) {
    dirs.push(config.layout.proposedDir)
  }
  return dirs
}

function corpusPathCandidates(config: AdrConfig): string[] {
  return [...corpusDirectories(config), config.layout.contextFile, config.layout.contextMapFile]
}

async function listWorkingCorpusPaths(repoRoot: string, config: AdrConfig): Promise<string[]> {
  const paths: string[] = []
  const { readdir } = await import('node:fs/promises')
  for (const dir of corpusDirectories(config)) {
    const abs = path.join(repoRoot, dir)
    if (!existsSync(abs)) continue
    const names = await readdir(abs)
    for (const name of names.sort()) {
      if (!isAdrMarkdown(name)) continue
      paths.push(normalizeRepoPath(path.join(dir, name)))
    }
  }

  for (const file of [config.layout.contextFile, config.layout.contextMapFile]) {
    if (existsSync(path.join(repoRoot, file))) {
      paths.push(normalizeRepoPath(file))
    }
  }

  return [...new Set(paths)].sort()
}

async function listRefCorpusPaths(repoRoot: string, ref: string, config: AdrConfig): Promise<string[]> {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const exec = promisify(execFile)
  const { stdout } = await exec('git', ['ls-tree', '-r', '--name-only', ref], { cwd: repoRoot })

  const prefixes = corpusPathCandidates(config)
  const paths: string[] = []

  for (const file of stdout.split('\n').filter(Boolean)) {
    const normalized = normalizeRepoPath(file)
    if (prefixes.includes(normalized)) {
      paths.push(normalized)
      continue
    }
    for (const prefix of prefixes) {
      if (prefix.endsWith('.md')) continue
      if (normalized.startsWith(`${prefix}/`) && isAdrMarkdown(normalized)) {
        paths.push(normalized)
        break
      }
    }
  }

  return [...new Set(paths)].sort()
}

async function collectCorpusEntries(
  relativePaths: string[],
  readAt: (relativePath: string) => Promise<string | null>,
): Promise<DecisionCorpusEntry[]> {
  const entries: DecisionCorpusEntry[] = []
  for (const relativePath of relativePaths) {
    const content = await readAt(relativePath)
    if (content === null) continue
    entries.push({ path: relativePath, contentHash: `sha256:${sha256(content)}` })
  }
  return entries
}

export async function buildWorkingDecisionCorpus(
  repoRoot: string,
  config: AdrConfig,
): Promise<DecisionCorpusEntry[]> {
  const paths = await listWorkingCorpusPaths(repoRoot, config)
  return collectCorpusEntries(paths, async (relativePath) => {
    const abs = path.join(repoRoot, relativePath)
    if (!existsSync(abs)) return null
    return readFile(abs, 'utf8')
  })
}

export class BaseRefUnavailableError extends Error {
  constructor(ref: string) {
    super(`base ref unavailable: ${ref}`)
    this.name = 'BaseRefUnavailableError'
  }
}

export async function buildRefDecisionCorpus(
  repoRoot: string,
  ref: string,
  config: AdrConfig,
): Promise<DecisionCorpusEntry[]> {
  const { readFileAtRef } = await import('../cli/git-diff.js')
  try {
    const paths = await listRefCorpusPaths(repoRoot, ref, config)
    const entries = await collectCorpusEntries(paths, async (relativePath) =>
      readFileAtRef(repoRoot, ref, relativePath),
    )
    if (entries.length !== paths.length) throw new BaseRefUnavailableError(ref)
    return entries
  } catch {
    throw new BaseRefUnavailableError(ref)
  }
}

export function hashDecisionCorpus(entries: DecisionCorpusEntry[]): string {
  const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path))
  const payload = sorted.map((e) => `${e.path}\0${e.contentHash}\n`).join('')
  return `sha256:${sha256(payload)}`
}
