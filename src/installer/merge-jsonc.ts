import { modify, applyEdits, parse, type JSONPath } from 'jsonc-parser'

export type JsoncEdit = {
  path: JSONPath
  value: unknown
}

export function mergeJsoncEdits(content: string, edits: JsoncEdit[]): string {
  let result = content
  for (const edit of edits) {
    const pathSegments = edit.path as JSONPath
    const editsApplied = modify(result, pathSegments, edit.value, {
      formattingOptions: { insertSpaces: true, tabSize: 2 },
    })
    result = applyEdits(result, editsApplied)
  }
  return result
}

export function parseJsonc(content: string): unknown {
  return parse(content)
}

export function findManagedHookEntries(
  hooksJson: unknown,
  managedCommandSuffix: string,
): number {
  if (!hooksJson || typeof hooksJson !== 'object') return 0
  const json = JSON.stringify(hooksJson)
  return (json.match(new RegExp(managedCommandSuffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? [])
    .length
}
