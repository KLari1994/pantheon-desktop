import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from 'vitest'

import { validateDiscoveryReport } from './discovery-report'

const schemaPath = join(dirname(fileURLToPath(import.meta.url)), 'discovery-report.schema.json')

const requiredFields = [
  'productName',
  'productVersion',
  'installPath',
  'processIdentity',
  'integrationSurface',
  'healthProbe',
  'authModel',
  'messageHistoryGuarantees',
  'redistributionTerms',
  'discoveryHost',
  'discoveredAt',
  'result'
] as const

function passingReport(overrides: Record<string, unknown> = {}) {
  return {
    productName: 'xAI Grok Bot',
    productVersion: '1.0.0',
    installPath: 'C:\\Program Files\\xAI\\Grok Bot',
    processIdentity: 'GrokBot.exe',
    integrationSurface: {
      type: 'documented-ipc',
      documentation: 'https://docs.x.ai/grok-bot/local-ipc'
    },
    healthProbe: {
      kind: 'documented-health-endpoint',
      description: 'GET local documented health endpoint; not process listing'
    },
    authModel: 'local product session; no Pantheon prompt or routine access',
    messageHistoryGuarantees: 'adapter receives only invited-room events after join',
    redistributionTerms: 'do not redistribute the installed product',
    discoveryHost: 'windows-workstation',
    discoveredAt: '2026-08-24T00:00:00.000Z',
    result: 'pass',
    ...overrides
  }
}

test('schema file lists every required discovery field', () => {
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as {
    required: string[]
    properties: Record<string, unknown>
  }

  expect(schema.required).toEqual([...requiredFields])

  for (const field of requiredFields) {
    expect(schema.properties[field]).toBeTruthy()
  }
})

test('a complete documented-ipc report with a non-invasive health probe is accepted', () => {
  const result = validateDiscoveryReport(passingReport())

  expect(result.ok).toBe(true)

  if (result.ok) {
    expect(result.report.result).toBe('pass')
    expect(result.report.integrationSurface.type).toBe('documented-ipc')
  }
})

test('missing required fields are rejected', () => {
  for (const field of requiredFields) {
    const { [field]: _removed, ...incomplete } = passingReport()
    const result = validateDiscoveryReport(incomplete)
    expect(result.ok).toBe(false)

    if (!result.ok) {
      expect(result.reason).toMatch(new RegExp(field, 'i'))
    }
  }
})

test('process presence alone is rejected', () => {
  const result = validateDiscoveryReport(
    passingReport({
      integrationSurface: { type: 'process-presence', documentation: 'tasklist' },
      healthProbe: { kind: 'process-presence', description: 'process is running' }
    })
  )

  expect(result.ok).toBe(false)

  if (!result.ok) {
    expect(result.reason).toMatch(/process presence|documented/i)
  }
})

test('screen scraping is rejected', () => {
  const result = validateDiscoveryReport(
    passingReport({
      integrationSurface: { type: 'screen-scraping', documentation: 'ui automation' }
    })
  )

  expect(result.ok).toBe(false)

  if (!result.ok) {
    expect(result.reason).toMatch(/scrap/i)
  }
})

test('a remote xAI model API is rejected', () => {
  const result = validateDiscoveryReport(
    passingReport({
      integrationSurface: { type: 'remote-model-api', documentation: 'https://api.x.ai' }
    })
  )

  expect(result.ok).toBe(false)

  if (!result.ok) {
    expect(result.reason).toMatch(/model api|remote/i)
  }
})

test('result must be pass or fail', () => {
  const result = validateDiscoveryReport(passingReport({ result: 'maybe' }))
  expect(result.ok).toBe(false)
})
