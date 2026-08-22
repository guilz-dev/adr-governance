import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'

import esbuild from 'esbuild'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(rootDir, 'dist', 'bundle')

const bundles = [
  { name: 'cli', entry: 'src/cli/main.ts' },
  { name: 'hook', entry: 'src/hooks/hook-main.ts' },
]

await mkdir(outDir, { recursive: true })

for (const bundle of bundles) {
  const outFile = path.join(outDir, `${bundle.name}.mjs`)
  await esbuild.build({
    entryPoints: [path.join(rootDir, bundle.entry)],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    outfile: outFile,
    banner: {
      js: `// adr-governance ${bundle.name} bundle`,
    },
  })
  console.log(`Built ${outFile}`)
}
