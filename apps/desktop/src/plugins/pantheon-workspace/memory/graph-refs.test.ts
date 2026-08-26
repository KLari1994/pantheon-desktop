import { expect, test } from 'vitest'

import { memorySliceFromGraph } from './graph-refs'
import { aggregateMemoryReferences } from './scope'

const opsRoute = {
  connectionId: 'local',
  mode: 'local' as const,
  profile: 'ops',
  targetProfile: 'ops'
}

test('All Pantheon references keep titles and routes without memory bodies', () => {
  const slice = memorySliceFromGraph(opsRoute, {
    clusters: [],
    edges: [],
    memory: [{ body: 'private ops text', source: 'memory', title: 'ops note' }],
    nodes: [
      {
        category: 'note',
        createdBy: null,
        id: 'n1',
        kind: 'memory',
        label: 'ops node',
        pinned: false,
        state: 'active',
        useCount: 1
      }
    ],
    stats: {}
  })

  expect(slice.memories.some(memory => memory.body.includes('private'))).toBe(false)

  const refs = aggregateMemoryReferences([slice])

  expect(refs).toEqual([
    { id: 'n1', ownerRoute: opsRoute, title: 'ops node' },
    { id: 'memory:0', ownerRoute: opsRoute, title: 'ops note' }
  ])
  expect(JSON.stringify(refs)).not.toMatch(/private/)
})
