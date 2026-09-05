import { watchPathsChanged } from './risk-signals.js'

export {
  buildRepositoryFingerprint,
  degradationWarningMessage,
  readGitStatusHash,
} from './fingerprint-build.js'

import type { RepositoryFingerprint } from './types.js'

/** True only when a watched path's content hash changed between turns. */
export function fingerprintWatchPathsChanged(
  before: Parameters<typeof watchPathsChanged>[0],
  after: Parameters<typeof watchPathsChanged>[1],
): boolean {
  return watchPathsChanged(before, after)
}

/**
 * Returns null when either saved observation is unavailable, including legacy
 * state without collectionMode. Callers must fail open.
 */
export function repositoryFingerprintChanged(
  before: RepositoryFingerprint,
  after: RepositoryFingerprint,
): boolean | null {
  const beforeMode = before.collectionMode ?? 'unavailable'
  const afterMode = after.collectionMode ?? 'unavailable'
  if (beforeMode === 'unavailable' || afterMode === 'unavailable') {
    return null
  }
  if (!before.repositoryStateHash || !after.repositoryStateHash) {
    return null
  }
  return before.repositoryStateHash !== after.repositoryStateHash
}
