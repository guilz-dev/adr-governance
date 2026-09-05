import { watchPathsChanged } from './risk-signals.js'

export {
  buildRepositoryFingerprint,
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
 * Returns null when either saved observation is unavailable, including state
 * written before the availability marker existed. Callers must fail open.
 */
export function repositoryFingerprintChanged(
  before: RepositoryFingerprint,
  after: RepositoryFingerprint,
): boolean | null {
  if (
    before.collectionAvailable !== true ||
    after.collectionAvailable !== true ||
    !before.repositoryStateHash ||
    !after.repositoryStateHash
  ) {
    return null
  }
  return before.repositoryStateHash !== after.repositoryStateHash
}
