import { expect, test, vi } from 'vitest'

import { deriveBindingHealth, diagnosticRuntimeForAgent, loadRoomDiagnostics } from './room-diagnostics'

test('health derivation branches', () => {
  expect(deriveBindingHealth({ storedSessionId: 's', runtimeSessionId: 'r' })).toBe('resumable')
  expect(deriveBindingHealth({})).toBe('missing')
  expect(deriveBindingHealth({ storedSessionId: 's' })).toBe('unknown')
})

test('diagnostics lists hidden sessions through requestProfile and never omits include_hidden', async () => {
  const requestProfile = vi.fn(async (_route: unknown, method: string, _params: Record<string, unknown>) => {
    expect(method).toBe('session.list')
    return {
      sessions: [
        { id: 'sess-hidden', profile: 'ops', connection_id: 'c1', _lineage_root_id: 'root-1' }
      ]
    }
  })
  const rows = await loadRoomDiagnostics(requestProfile, {
    route: { connectionId: 'c1', profile: 'ops' },
    machine: 'desk-1',
    runtimeSessionId: 'live-1',
    lastEventAt: 99
  })
  expect(requestProfile).toHaveBeenCalledWith(
    { connectionId: 'c1', profile: 'ops' },
    'session.list',
    { include_hidden: true }
  )
  expect(rows[0]).toMatchObject({
    agent: 'ops',
    connectionId: 'c1',
    machine: 'desk-1',
    storedSessionId: 'sess-hidden',
    lineageRootId: 'root-1',
    runtimeSessionId: 'live-1',
    lastEventAt: 99,
    health: 'resumable'
  })
})

test('runtime session is only supplied when the live route matches the agent', () => {
  expect(
    diagnosticRuntimeForAgent(
      { connectionId: 'c2', profile: 'research', machineId: 'desk-2' },
      { connectionId: 'c1', profile: 'ops', runtimeSessionId: 'live-1' }
    )
  ).toEqual({ machine: 'desk-2', runtimeSessionId: undefined })
  expect(
    diagnosticRuntimeForAgent(
      { connectionId: 'c1', profile: 'ops', machineId: 'desk-1' },
      { connectionId: 'c1', profile: 'ops', runtimeSessionId: 'live-1' }
    )
  ).toEqual({ machine: 'desk-1', runtimeSessionId: 'live-1' })
})
