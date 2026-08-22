export function contextTemplate(language: 'ja' | 'en'): string {
  if (language === 'ja') {
    return `# ドメインコンテキスト

このリポジトリのドメイン用語と境界コンテキスト。

## 用語

<!-- ADR / CONTEXT ワークフローで確定した用語を追記 -->

`
  }
  return `# Domain Context

Domain terms and bounded-context language for this repository.

## Language

<!-- Add domain terms as decisions are recorded in the ADR/CONTEXT workflow -->

`
}
