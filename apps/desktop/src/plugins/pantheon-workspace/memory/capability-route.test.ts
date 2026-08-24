import { expect, test } from 'vitest'

import { capabilitySurfaceProps, requireExactCapabilityRoute } from './capability-route'

test('capability actions require an explicit connection and profile', () => {
  expect(() =>
    requireExactCapabilityRoute({ connectionId: '', mode: 'remote', profile: 'ops', targetProfile: 'ops' })
  ).toThrow(/exact/i)
})

test('reuses existing Skills/Tools/MCP surfaces with exact route pins and no ambient fallback', () => {
  const route = {
    connectionId: 'homelab',
    mode: 'remote' as const,
    profile: 'ops',
    targetProfile: 'backend-ops'
  }

  expect(capabilitySurfaceProps(route)).toEqual({
    embedded: true,
    fixedConnection: 'homelab',
    fixedProfile: 'backend-ops'
  })
})
