export const CHECKLIST_STATUSES = ['pass', 'partial', 'unavailable', 'pending-windows'] as const

export type ChecklistStatus = (typeof CHECKLIST_STATUSES)[number]

export interface ChecklistRow {
  id: string
  status: string
  evidence: string
}

const ROW_RE =
  /^\|\s*\**`?([A-Z][A-Z0-9]+(?:-[A-Z0-9]+)+)`?\**\s*\|\s*([^|]*)\|\s*(pass|partial|unavailable|pending-windows)\s*\|\s*([^|]*)\|/gm

export function parseReleaseChecklist(markdown: string): ChecklistRow[] {
  const rows: ChecklistRow[] = []

  for (const match of markdown.matchAll(ROW_RE)) {
    rows.push({
      id: match[1],
      status: match[3],
      evidence: match[4].trim()
    })
  }

  return rows
}

export function isChecklistStatus(value: string): value is ChecklistStatus {
  return (CHECKLIST_STATUSES as readonly string[]).includes(value)
}

export function findCoverageGaps(
  rows: ChecklistRow[],
  expectedIds: readonly string[]
): {
  missing: string[]
  extra: string[]
  duplicates: string[]
  invalidStatus: string[]
  grokNotUnavailable: string[]
  missingEvidence: string[]
} {
  const seen = new Map<string, number>()

  for (const row of rows) {
    seen.set(row.id, (seen.get(row.id) ?? 0) + 1)
  }

  const listed = new Set(rows.map(row => row.id))
  const expected = new Set(expectedIds)

  return {
    missing: expectedIds.filter(id => !listed.has(id)),
    extra: [...listed].filter(id => !expected.has(id)).sort(),
    duplicates: [...seen.entries()]
      .filter(([, count]) => count > 1)
      .map(([id]) => id)
      .sort(),
    invalidStatus: rows.filter(row => !isChecklistStatus(row.status)).map(row => row.id),
    grokNotUnavailable: rows
      .filter(row => row.id.startsWith('GROK-') && row.status !== 'unavailable')
      .map(row => row.id),
    missingEvidence: rows.filter(row => row.evidence.length === 0).map(row => row.id)
  }
}
