import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { StarmapGraph } from '@/types/hermes'

const getStarmapGraph = vi.fn()

vi.mock('@/hermes', () => ({
  getStarmapGraph: (...args: unknown[]) => getStarmapGraph(...args)
}))

const { $starmapGraph, $starmapGraphKey, loadStarmapGraph, resetStarmapGraph, starmapGraphForRoute } =
  await import('./starmap')

function graph(label: string): StarmapGraph {
  return {
    clusters: [],
    edges: [],
    memory: [],
    nodes: [
      {
        category: 'note',
        createdBy: null,
        id: label,
        kind: 'memory',
        label,
        pinned: false,
        state: 'active',
        useCount: 1
      }
    ],
    stats: {}
  }
}

describe('loadStarmapGraph route isolation', () => {
  beforeEach(() => {
    resetStarmapGraph()
    getStarmapGraph.mockReset()
  })

  it('does not keep another route’s inflight result after a route switch', async () => {
    let resolveA: (value: StarmapGraph) => void = () => undefined
    let resolveB: (value: StarmapGraph) => void = () => undefined
    getStarmapGraph
      .mockImplementationOnce(
        () =>
          new Promise<StarmapGraph>(resolve => {
            resolveA = resolve
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise<StarmapGraph>(resolve => {
            resolveB = resolve
          })
      )

    const first = loadStarmapGraph(true, { connectionId: 'local', profile: 'ops' })
    const second = loadStarmapGraph(true, { connectionId: 'homelab', profile: 'ops' })

    resolveA(graph('ops-local'))
    resolveB(graph('ops-lab'))
    await Promise.all([first, second])

    expect($starmapGraphKey.get()).toBe('homelab::ops')
    expect($starmapGraph.get()?.nodes.map(node => node.id)).toEqual(['ops-lab'])
    expect(starmapGraphForRoute('local::ops')).toBeNull()
    expect(starmapGraphForRoute('homelab::ops')?.nodes[0]?.id).toBe('ops-lab')
  })

  it('does not reuse a cached graph when the route changes', async () => {
    getStarmapGraph.mockResolvedValueOnce(graph('ops-local'))
    await loadStarmapGraph(true, { connectionId: 'local', profile: 'ops' })

    getStarmapGraph.mockResolvedValueOnce(graph('ops-lab'))
    await loadStarmapGraph(false, { connectionId: 'homelab', profile: 'ops' })

    expect(getStarmapGraph).toHaveBeenCalledTimes(2)
    expect(starmapGraphForRoute('homelab::ops')?.nodes[0]?.label).toBe('ops-lab')
    expect(starmapGraphForRoute('local::ops')).toBeNull()
  })
})
