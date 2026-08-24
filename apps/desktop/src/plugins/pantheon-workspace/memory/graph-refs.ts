import type { StarmapGraph } from '@hermes/plugin-sdk'

import type { MemoryGraphSlice, MemoryOwnerRoute, MemoryRecord } from './scope'

export function memorySliceFromGraph(route: MemoryOwnerRoute, graph: StarmapGraph): MemoryGraphSlice {
  const memories: MemoryRecord[] = [
    ...graph.nodes
      .filter(node => node.kind === 'memory')
      .map(node => ({ body: '', id: node.id, title: node.label })),
    ...graph.memory.map((card, index) => ({
      body: '',
      id: `${card.source}:${index}`,
      title: card.title
    }))
  ]

  return { memories, route }
}
