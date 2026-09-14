import path from 'node:path'

import { buildManifest } from '../../installer/generated-files.js'
import { atomicWriteFile } from '../../core/locks.js'
import { MANIFEST_PATH } from '../../core/repository-state.js'

export async function runManifestRefresh(options: {
  repoRoot: string
  packageRoot?: string
}): Promise<string> {
  const manifest = await buildManifest(options.repoRoot, options.packageRoot ?? options.repoRoot)
  const manifestPath = path.join(options.repoRoot, MANIFEST_PATH)
  await atomicWriteFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  return MANIFEST_PATH
}
