import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const MARKDOWN_LINK_RE = /\[[^\]]+\]\(([^)]+)\)/g

export function extractRelativeLinks(content: string): string[] {
  const links: string[] = []
  for (const match of content.matchAll(MARKDOWN_LINK_RE)) {
    const target = match[1]?.trim()
    if (!target || target.startsWith('http://') || target.startsWith('https://') || target.startsWith('#')) {
      continue
    }
    links.push(target.split('#')[0] ?? target)
  }
  return links
}

export async function validateContextLinks(
  repoRoot: string,
  contextPaths: string[],
): Promise<Array<{ path: string; message: string }>> {
  const issues: Array<{ path: string; message: string }> = []

  for (const rel of contextPaths) {
    const abs = path.join(repoRoot, rel)
    if (!existsSync(abs)) continue
    const content = await readFile(abs, 'utf8')
    const baseDir = path.dirname(rel)

    for (const link of extractRelativeLinks(content)) {
      const resolved = path.normalize(path.join(baseDir, link))
      const absTarget = path.join(repoRoot, resolved)
      if (!existsSync(absTarget)) {
        issues.push({
          path: rel,
          message: `Broken relative link: ${link}`,
        })
      }
    }
  }

  return issues
}
