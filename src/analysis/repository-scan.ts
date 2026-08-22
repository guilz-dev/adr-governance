import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import type { EvidenceBundle } from '../core/types.js'
import { excerptHash, sha256 } from '../core/numbering.js'

const AGENT_CONFIG_MARKERS = [
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  '.cursor/hooks.json',
  '.claude/settings.json',
  '.codex/hooks.json',
  '.gemini/settings.json',
]

const SECRET_PATTERNS = [
  /\.env/i,
  /secret/i,
  /credential/i,
  /\.pem$/i,
  /\.key$/i,
]

export type ExistingLayout = {
  acceptedDirs: string[]
  proposedDirs: string[]
  contextFiles: string[]
  agentConfigFiles: string[]
  detectedLayout: 'none' | 'split' | 'single' | 'custom'
}

export function detectExistingLayout(repoRoot: string, trackedFiles: string[]): ExistingLayout {
  const acceptedCandidates = ['docs/adr', 'doc/adr', 'adr', 'docs/architecture/decisions']
  const proposedCandidates = ['docs/proposed-adr', 'docs/adr/proposed']

  const acceptedDirs = acceptedCandidates.filter((d) =>
    trackedFiles.some((f) => f.startsWith(`${d}/`) || f === d),
  )
  const proposedDirs = proposedCandidates.filter(
    (d) =>
      trackedFiles.some((f) => f.startsWith(`${d}/`) || f === d) ||
      existsSync(path.join(repoRoot, d)),
  )

  const contextFiles = trackedFiles.filter(
    (f) => f === 'CONTEXT.md' || f.endsWith('/CONTEXT.md') || f === 'CONTEXT-MAP.md',
  )

  const agentConfigFiles = AGENT_CONFIG_MARKERS.filter((m) =>
    trackedFiles.includes(m) || existsSync(path.join(repoRoot, m)),
  )

  let detectedLayout: ExistingLayout['detectedLayout'] = 'none'
  if (acceptedDirs.includes('docs/adr') && proposedDirs.includes('docs/proposed-adr')) {
    detectedLayout = 'split'
  } else if (acceptedDirs.length === 1 && proposedDirs.length === 0) {
    detectedLayout = 'single'
  } else if (acceptedDirs.length > 0) {
    detectedLayout = 'custom'
  }

  return { acceptedDirs, proposedDirs, contextFiles, agentConfigFiles, detectedLayout }
}

export function shouldSkipFile(relativePath: string, exclude: string[]): boolean {
  if (SECRET_PATTERNS.some((re) => re.test(relativePath))) return true
  for (const pattern of exclude) {
    const normalized = pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*')
    if (new RegExp(`^${normalized}$`).test(relativePath)) return true
  }
  return false
}

export async function buildEvidenceBundle(
  repoRoot: string,
  trackedFiles: string[],
  headSha: string | null,
  exclude: string[],
): Promise<EvidenceBundle> {
  const layout = detectExistingLayout(repoRoot, trackedFiles)
  const manifests: EvidenceBundle['manifests'] = []
  const candidateEvidence: EvidenceBundle['candidateEvidence'] = []
  const warnings: string[] = []

  for (const file of trackedFiles) {
    if (shouldSkipFile(file, exclude)) continue

    const abs = path.join(repoRoot, file)
    if (!existsSync(abs)) continue

    if (file.endsWith('package.json') || file.endsWith('pnpm-workspace.yaml')) {
      try {
        const content = await readFile(abs, 'utf8')
        const keys = file.endsWith('.json')
          ? Object.keys(JSON.parse(content) as Record<string, unknown>)
          : content.split('\n').filter((l) => l.trim().length > 0).slice(0, 20)
        manifests.push({
          path: file,
          kind: file.includes('workspace') ? 'workspace' : 'package',
          headingsOrKeys: keys,
        })
      } catch {
        warnings.push(`Could not parse manifest: ${file}`)
      }
    }

    if (
      file.includes('schema') ||
      file.includes('migration') ||
      file.includes('wrangler') ||
      file.includes('.github/workflows') ||
      /\d{4}-.+\.md$/.test(file)
    ) {
      try {
        const content = await readFile(abs, 'utf8')
        const lines = content.split('\n').slice(0, 5).join('\n')
        candidateEvidence.push({
          category: file.includes('schema') ? 'boundary' : 'technology',
          path: file,
          line: 1,
          excerptHash: excerptHash(lines),
          summary: `${file} observed in repository`,
        })
      } catch {
        warnings.push(`Could not read evidence file: ${file}`)
      }
    }
  }

  return {
    schemaVersion: 1,
    repository: {
      rootHash: sha256(repoRoot),
      headSha,
      trackedFileCount: trackedFiles.length,
    },
    existingLayout: {
      acceptedDirs: layout.acceptedDirs,
      proposedDirs: layout.proposedDirs,
      contextFiles: layout.contextFiles,
      agentConfigFiles: layout.agentConfigFiles,
    },
    manifests,
    candidateEvidence,
    warnings,
  }
}
