import { createHash } from 'node:crypto'

const ADR_FILENAME_RE = /^(\d+)-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/

export function parseAdrFilename(filename: string): { number: number; slug: string } | null {
  const match = ADR_FILENAME_RE.exec(filename)
  if (!match) return null
  return {
    number: Number.parseInt(match[1] ?? '0', 10),
    slug: match[2] ?? '',
  }
}

export function formatAdrId(number: number, digits: number): string {
  return `ADR-${String(number).padStart(digits, '0')}`
}

export function formatAdrFilename(number: number, slug: string, digits: number): string {
  const padded = String(number).padStart(digits, '0')
  return `${padded}-${slug}.md`
}

export function nextAdrNumber(existingNumbers: number[]): number {
  if (existingNumbers.length === 0) return 1
  return Math.max(...existingNumbers) + 1
}

export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
}

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

export function excerptHash(excerpt: string): string {
  return sha256(excerpt).slice(0, 16)
}
