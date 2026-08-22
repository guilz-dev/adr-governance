import type { RepositoryFingerprint } from './types.js'

export function hasWatchGitStatusHash(
  fingerprint: RepositoryFingerprint,
): fingerprint is RepositoryFingerprint & { watchGitStatusHash: string } {
  return fingerprint.watchGitStatusHash != null
}

export function hasOverflowWatchHash(
  fingerprint: RepositoryFingerprint,
): fingerprint is RepositoryFingerprint & { overflowWatchHash: string } {
  return fingerprint.overflowWatchHash != null
}
