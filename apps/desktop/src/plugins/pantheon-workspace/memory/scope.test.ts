import { expect, test } from 'vitest'

import {
  aggregateMemoryReferences,
  requireExactMemoryRoute,
  resolveMemoryScope,
  type MemoryGraphSlice
} from './scope'

const opsRoute = {
  connectionId: 'local',
  mode: 'local' as const,
  profile: 'ops',
  targetProfile: 'ops'
}

test('memory graph defaults to the active bot exact route', () => {
  expect(resolveMemoryScope({ activeBot: opsRoute })).toEqual({
    kind: 'active-bot',
    route: opsRoute
  })
})

test('All Pantheon aggregates references without copying private memory bodies', () => {
  const slices: MemoryGraphSlice[] = [
    {
      route: opsRoute,
      memories: [{ id: 'm1', title: 'ops note', body: 'private ops text' }]
    },
    {
      route: { connectionId: 'homelab', mode: 'remote', profile: 'zeus', targetProfile: 'zeus' },
      memories: [{ id: 'm2', title: 'zeus note', body: 'private zeus text' }]
    }
  ]

  const refs = aggregateMemoryReferences(slices)

  expect(refs).toEqual([
    { id: 'm1', ownerRoute: opsRoute, title: 'ops note' },
    {
      id: 'm2',
      ownerRoute: { connectionId: 'homelab', mode: 'remote', profile: 'zeus', targetProfile: 'zeus' },
      title: 'zeus note'
    }
  ])
  expect(JSON.stringify(refs)).not.toMatch(/private/)
})

test('memory actions fail closed without an exact connection and profile', () => {
  expect(() => requireExactMemoryRoute({ connectionId: '', profile: 'ops', targetProfile: 'ops', mode: 'local' })).toThrow(
    /exact/i
  )
  expect(() =>
    requireExactMemoryRoute({ connectionId: 'local', profile: 'ops', targetProfile: '', mode: 'local' })
  ).toThrow(/exact/i)
})
