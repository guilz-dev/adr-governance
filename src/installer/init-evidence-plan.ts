import { readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

import type { AdrConfig, EvidenceBundle, InitPlan, InitPlanOperation } from '../core/types.js'
import { contextTemplate } from './context-template.js'

export type OperationProvenance = {
  sourcePaths: string[]
  rationale: string
}

const MAX_PROPOSED_CANDIDATES = 3

export function shouldProposeContextMap(evidence: EvidenceBundle): boolean {
  const contextMdFiles = evidence.existingLayout.contextFiles.filter(
    (file) => file.endsWith('/CONTEXT.md') || file === 'CONTEXT.md',
  )
  return contextMdFiles.length > 1
}

export function buildEvidenceInformedContext(
  evidence: EvidenceBundle,
  language: 'ja' | 'en',
): string {
  const lines: string[] = [contextTemplate(language).trimEnd()]

  const manifestLines = evidence.manifests
    .slice(0, 10)
    .map(
      (manifest) =>
        `- \`${manifest.path}\` (${manifest.kind}): ${manifest.headingsOrKeys.slice(0, 8).join(', ')}`,
    )
  if (manifestLines.length > 0) {
    lines.push('', language === 'ja' ? '## 観測された構造' : '## Observed structure', '')
    lines.push(...manifestLines)
    lines.push(
      '',
      language === 'ja'
        ? '<!-- 上記は走査で確認できた事実です。採用理由は別途確認してください。 -->'
        : '<!-- Observed facts from repository scan; confirm rationale before treating as decisions. -->',
    )
  }

  const observations = evidence.candidateEvidence.slice(0, 8)
  if (observations.length > 0) {
    lines.push('', language === 'ja' ? '## 確認が必要な観測' : '## Observations needing review', '')
    for (const item of observations) {
      lines.push(`- \`${item.path}\` (${item.category}): ${item.summary}`)
    }
  }

  return `${lines.join('\n')}\n`
}

export function buildReviewQuestions(
  evidence: EvidenceBundle,
  language: 'ja' | 'en',
): string[] {
  return evidence.candidateEvidence.slice(0, 5).map((item) => {
    if (language === 'ja') {
      return `\`${item.path}\` はなぜこの構造になっていますか？ (${item.category}; 観測のみ、理由は未確認)`
    }
    return `Why was \`${item.path}\` structured this way? (${item.category}; observed, rationale unknown)`
  })
}

function slugFromEvidencePath(relativePath: string): string {
  const base = relativePath.replace(/\.[^.]+$/, '')
  return base
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 48)
}

async function nextAdrNumber(
  repoRoot: string,
  dirs: string[],
  idDigits: number,
): Promise<number> {
  let max = 0
  for (const dir of dirs) {
    const abs = path.join(repoRoot, dir)
    if (!existsSync(abs)) continue
    for (const file of await readdir(abs)) {
      const match = /^(\d+)-/.exec(file)
      if (match) {
        max = Math.max(max, Number.parseInt(match[1] ?? '0', 10))
      }
    }
  }
  return max + 1
}

function proposedAdrCandidateBody(
  item: EvidenceBundle['candidateEvidence'][number],
  language: 'ja' | 'en',
): string {
  if (language === 'ja') {
    return `# 観測: ${item.path}

## 文脈

リポジトリ走査で \`${item.path}\` (${item.category}) が確認されました。tracked ファイルからは採用理由は読み取れません。

## Open Points

- なぜこの構造・技術を選んだのか？
- 検討した代替案は何か？
`
  }

  return `# Observed: ${item.path}

## Context

Repository scan found \`${item.path}\` (${item.category}). Tracked files do not record the selection rationale.

## Open Points

- Why was this structure or technology chosen?
- What alternatives were considered?
`
}

export async function buildProposedAdrCandidateOperations(
  repoRoot: string,
  evidence: EvidenceBundle,
  config: AdrConfig,
): Promise<Array<{ operation: InitPlanOperation; provenance: OperationProvenance }>> {
  const { proposedDir, acceptedDir } = config.layout
  const language = config.documents.language
  const idDigits = config.documents.idDigits
  const results: Array<{ operation: InitPlanOperation; provenance: OperationProvenance }> = []

  let nextNumber = await nextAdrNumber(repoRoot, [acceptedDir, proposedDir], idDigits)
  const candidates = evidence.candidateEvidence.slice(0, MAX_PROPOSED_CANDIDATES)

  for (const item of candidates) {
    const slug = slugFromEvidencePath(item.path) || 'candidate'
    const relPath = path.join(
      proposedDir,
      `${String(nextNumber).padStart(idDigits, '0')}-observed-${slug}.md`,
    )
    nextNumber += 1

    if (existsSync(path.join(repoRoot, relPath))) continue

    const date = new Date().toISOString().slice(0, 10)
    const content = `---
status: proposed
date: ${date}
---

${proposedAdrCandidateBody(item, language)}`

    results.push({
      operation: { kind: 'create', path: relPath, content },
      provenance: {
        sourcePaths: [item.path],
        rationale: 'Observed repository structure; rationale requires human confirmation',
      },
    })
  }

  return results
}

export function buildEvidenceReferences(
  operations: InitPlanOperation[],
  provenance: OperationProvenance[],
): InitPlan['evidenceReferences'] {
  return operations.map((_, index) => {
    const entry = provenance[index]
    return {
      operationIndex: index,
      sourcePaths: entry?.sourcePaths ?? [],
      rationale: entry?.rationale ?? 'Planned init apply operation',
    }
  })
}
