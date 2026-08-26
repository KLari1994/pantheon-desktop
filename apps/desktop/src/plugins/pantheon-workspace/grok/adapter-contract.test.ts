import { expect, test } from 'vitest'

import { createGrokProductAdapter, GROK_UNAVAILABLE_REASONS } from './adapter'
import type { GrokDiscoveryReport } from './discovery-report'

function passingReport(overrides: Partial<GrokDiscoveryReport> = {}): GrokDiscoveryReport {
  return {
    productName: 'xAI Grok Bot',
    productVersion: '1.4.2',
    installPath: 'C:\\Program Files\\xAI\\Grok Bot',
    processIdentity: 'GrokBot.exe',
    integrationSurface: {
      type: 'documented-ipc',
      documentation: 'https://docs.x.ai/grok-bot/local-ipc'
    },
    healthProbe: {
      kind: 'documented-ipc-ping',
      description: 'documented local ping'
    },
    authModel: 'local product session',
    messageHistoryGuarantees: 'invited rooms only',
    redistributionTerms: 'no redistribution',
    discoveryHost: 'windows-workstation',
    discoveredAt: '2026-08-24T00:00:00.000Z',
    result: 'pass',
    ...overrides
  }
}

test('default adapter is unavailable when discovery is missing', async () => {
  const adapter = createGrokProductAdapter({ discoveryHost: 'windows-workstation' })
  const status = await adapter.status()

  expect(status.available).toBe(false)
  expect(status.reason).toBe(GROK_UNAVAILABLE_REASONS.missing)
  expect(status.productVersion).toBeUndefined()
})

test('default adapter is unavailable on an unsupported discovery host', async () => {
  const adapter = createGrokProductAdapter({ discoveryHost: 'linux-vps' })
  const status = await adapter.status()

  expect(status.available).toBe(false)
  expect(status.reason).toBe(GROK_UNAVAILABLE_REASONS.unsupportedHost)
})

test('a failed discovery report stays unavailable', async () => {
  const adapter = createGrokProductAdapter({
    report: passingReport({ result: 'fail' })
  })

  const status = await adapter.status()

  expect(status.available).toBe(false)
  expect(status.reason).toBe(GROK_UNAVAILABLE_REASONS.failed)
})

test('a passing report without an injected transport stays unavailable', async () => {
  const adapter = createGrokProductAdapter({ report: passingReport() })
  const status = await adapter.status()

  expect(status.available).toBe(false)
  expect(status.reason).toBe(GROK_UNAVAILABLE_REASONS.noSurface)
})

test('status is available only for a passing documented surface plus transport', async () => {
  const adapter = createGrokProductAdapter({
    report: passingReport({
      integrationSurface: {
        type: 'documented-api',
        documentation: 'https://docs.x.ai/grok-bot/local-api'
      }
    }),
    transport: {
      sendDirect: async () => ({ messageId: 'm1' }),
      inviteToRoom: async () => undefined,
      removeFromRoom: async () => undefined,
      sendRoomMessage: async () => ({ messageId: 'm2' }),
      onMessage: () => () => undefined
    }
  })

  await expect(adapter.status()).resolves.toEqual({
    available: true,
    productVersion: '1.4.2'
  })
})

test('unavailable adapter rejects outbound chat and does not invent a Grok substitute', async () => {
  const adapter = createGrokProductAdapter()
  const status = await adapter.status()

  await expect(adapter.sendDirect('hello')).rejects.toThrow(/UNAVAILABLE/)
  await expect(adapter.inviteToRoom('room-1')).rejects.toThrow(/UNAVAILABLE/)
  await expect(adapter.sendRoomMessage('room-1', 'hello')).rejects.toThrow(/UNAVAILABLE/)
  expect(status.available).toBe(false)
  expect(status.reason).toMatch(/^UNAVAILABLE/)
})

test('onMessage can be unsubscribed without delivering events when unavailable', () => {
  const adapter = createGrokProductAdapter()
  const seen: string[] = []

  const stop = adapter.onMessage(event => {
    seen.push(event.messageId)
  })

  expect(typeof stop).toBe('function')
  stop()
  expect(seen).toEqual([])
})
