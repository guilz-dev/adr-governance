import { watchPathsChanged } from './risk-signals.js'

export {
  buildRepositoryFingerprint,
  detectDocsPathsUpdated,
  readGitStatusHash,
} from './fingerprint-build.js'

/** True only when a watched path's content hash changed between turns. */
export function fingerprintWatchPathsChanged(
  before: Parameters<typeof watchPathsChanged>[0],
  after: Parameters<typeof watchPathsChanged>[1],
): boolean {
  return watchPathsChanged(before, after)
}
