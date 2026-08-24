import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { findCoverageGaps, parseReleaseChecklist } from './release-coverage'
import { SPEC_REQUIREMENT_IDS } from './requirement-ids'

const REPO_ROOT = resolve(__dirname, '../../../..')
const CHECKLIST_PATH = resolve(REPO_ROOT, 'docs/pantheon/release-checklist.md')

describe('release coverage ledger', () => {
  it('parses requirement rows and reports missing IDs', () => {
    const rows = parseReleaseChecklist(`
| ID | Title | Status | Evidence |
| --- | --- | --- | --- |
| FND-01 | Ships as Windows Electron | pass | PAN-1 PR #2 |
| GROK-01 | Direct chat | pass | wrong |
`)

    const gaps = findCoverageGaps(rows, ['FND-01', 'FND-02', 'GROK-01'])
    expect(gaps.missing).toEqual(['FND-02'])
    expect(gaps.extra).toEqual([])
    expect(gaps.grokNotUnavailable).toEqual(['GROK-01'])
  })

  it('exists at docs/pantheon/release-checklist.md', () => {
    expect(existsSync(CHECKLIST_PATH), `missing ${CHECKLIST_PATH}`).toBe(true)
  })

  it('covers every product-spec ID exactly once with a valid status and evidence', () => {
    const markdown = readFileSync(CHECKLIST_PATH, 'utf8')
    const rows = parseReleaseChecklist(markdown)
    const gaps = findCoverageGaps(rows, SPEC_REQUIREMENT_IDS)

    expect(gaps.missing, `missing IDs: ${gaps.missing.join(', ')}`).toEqual([])
    expect(gaps.extra, `extra IDs: ${gaps.extra.join(', ')}`).toEqual([])
    expect(gaps.duplicates, `duplicate IDs: ${gaps.duplicates.join(', ')}`).toEqual([])
    expect(gaps.invalidStatus, `invalid status: ${gaps.invalidStatus.join(', ')}`).toEqual([])
    expect(gaps.missingEvidence, `missing evidence: ${gaps.missingEvidence.join(', ')}`).toEqual([])
    expect(rows).toHaveLength(SPEC_REQUIREMENT_IDS.length)
  })

  it('marks every GROK-* requirement unavailable (Gate F / PAN-10)', () => {
    const markdown = readFileSync(CHECKLIST_PATH, 'utf8')
    const rows = parseReleaseChecklist(markdown)
    const gaps = findCoverageGaps(rows, SPEC_REQUIREMENT_IDS)
    expect(gaps.grokNotUnavailable).toEqual([])
  })
})
