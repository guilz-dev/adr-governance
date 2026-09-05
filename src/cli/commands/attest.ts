import { readFile } from 'node:fs/promises'
import path from 'node:path'

import {
  buildRefDecisionCorpus,
  hashDecisionCorpus,
  BaseRefUnavailableError,
} from '../../core/decision-corpus.js'
import { buildChangeSet } from '../../core/change-set.js'
import { contentHashForFile, parseDecisionEvidence, serializeDecisionEvidence } from '../../core/decision-evidence.js'
import type { AdrConfig, NoAdrReason } from '../../core/types.js'
import { loadAllAdrs } from '../../core/repository-state.js'
import { refExists } from '../git-diff.js'

export type AttestOptions = {
  repoRoot: string
  config: AdrConfig
  baseRef: string
  adrIds: string[]
  noAdrReason?: NoAdrReason
  rationale?: string
  reviewedProposalIds: string[]
}

export async function runAttest(options: AttestOptions) {
  const hasAdr = options.adrIds.length > 0
  const hasNoAdr = options.noAdrReason !== undefined
  if (hasAdr === hasNoAdr) {
    throw new Error('Specify exactly one of --adr or --no-adr')
  }

  if (!(await refExists(options.repoRoot, options.baseRef))) {
    throw new BaseRefUnavailableError(options.baseRef)
  }

  const corpus = await buildRefDecisionCorpus(options.repoRoot, options.baseRef, options.config)
  const decisionCorpusHash = hashDecisionCorpus(corpus)
  const changeSet = await buildChangeSet(options.repoRoot, options.baseRef)
  const baseCommit = changeSet.baseCommit

  const adrs = await loadAllAdrs(options.repoRoot, options.config)
  const adrById = new Map(adrs.map((a) => [a.id, a]))

  if (hasAdr) {
    const refs: Array<{ id: string; contentHash: string }> = []
    for (const id of [...options.adrIds].sort()) {
      const adr = adrById.get(id)
      if (!adr || adr.frontmatter.status !== 'accepted') {
        throw new Error(`ADR is not accepted: ${id}`)
      }
      const content = await readFile(path.join(options.repoRoot, adr.path), 'utf8')
      refs.push({ id, contentHash: contentHashForFile(content) })
    }
    const evidence = {
      schemaVersion: 2 as const,
      baseCommit,
      decisionCorpusHash,
      changeSet: {
        algorithm: 'git-change-set-v1' as const,
        digest: changeSet.digest,
      },
      outcome: { kind: 'accepted-adr' as const, refs },
      reviewedProposals: options.reviewedProposalIds.map((id) => ({
        id,
        relation: 'unrelated' as const,
      })),
    }
    return parseDecisionEvidence(JSON.parse(serializeDecisionEvidence(evidence)))
  }

  if (!options.rationale?.trim()) {
    throw new Error('no-ADR attestation requires --rationale')
  }

  const evidence = {
    schemaVersion: 2 as const,
    baseCommit,
    decisionCorpusHash,
    changeSet: {
      algorithm: 'git-change-set-v1' as const,
      digest: changeSet.digest,
    },
    outcome: {
      kind: 'no-adr' as const,
      reason: options.noAdrReason!,
      rationale: options.rationale.trim(),
    },
    reviewedProposals: options.reviewedProposalIds.map((id) => ({
      id,
      relation: 'unrelated' as const,
    })),
  }
  return parseDecisionEvidence(JSON.parse(serializeDecisionEvidence(evidence)))
}
