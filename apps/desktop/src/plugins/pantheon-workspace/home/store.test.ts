import { expect, test } from 'vitest'

import { type HomeSourceEvent, projectHomeItems } from './projections'
import { HomeStore } from './store'

function source(partial: Partial<HomeSourceEvent> & Pick<HomeSourceEvent, 'type' | 'sourceKind' | 'sourceId'>): HomeSourceEvent {
  return {
    agent: 'Daedalus',
    context: 'ops',
    machine: 'win',
    timestamp: 1,
    ...partial
  }
}

test('refresh merges authoritative projections and drops settled items', () => {
  const store = new HomeStore()
  const generation = store.beginHydration()
  store.applyRefresh(
    projectHomeItems([
      source({ type: 'approval', sourceKind: 'session', sourceId: 's1', requestId: 'r1' }),
      source({ type: 'running', sourceKind: 'session', sourceId: 's2' })
    ]),
    generation
  )
  expect(store.$items.get().map(item => item.id)).toEqual(['approval:r1', 'running:session:s2'])
  store.applyRefresh(projectHomeItems([source({ type: 'running', sourceKind: 'session', sourceId: 's2' })]), generation)
  expect(store.$items.get().map(item => item.id)).toEqual(['running:session:s2'])
})

test('no-op refresh preserves reference identity', () => {
  const store = new HomeStore()
  const generation = store.beginHydration()
  const items = projectHomeItems([source({ type: 'running', sourceKind: 'session', sourceId: 's2' })])
  store.applyRefresh(items, generation)
  const first = store.$items.get()
  store.applyRefresh(projectHomeItems([source({ type: 'running', sourceKind: 'session', sourceId: 's2' })]), generation)
  expect(store.$items.get()).toBe(first)
})

test('stale generations are rejected', () => {
  const store = new HomeStore()
  const first = store.beginHydration()
  const second = store.beginHydration()
  store.applyRefresh(projectHomeItems([source({ type: 'failed', sourceKind: 'cron', sourceId: 'old' })]), first)
  expect(store.$items.get()).toEqual([])
  store.applyRefresh(projectHomeItems([source({ type: 'failed', sourceKind: 'cron', sourceId: 'new' })]), second)
  expect(store.$items.get()[0]?.id).toBe('failed:cron:new')
})

test('the same approval from two surfaces is one item', () => {
  const store = new HomeStore()
  const generation = store.beginHydration()
  store.applyRefresh(
    projectHomeItems([
      source({ type: 'approval', sourceKind: 'session', sourceId: 's1', requestId: 'r9', context: 'inline' }),
      source({ type: 'approval', sourceKind: 'session', sourceId: 's1', requestId: 'r9', context: 'needs-you' })
    ]),
    generation
  )
  expect(store.$items.get()).toHaveLength(1)
  expect(store.$items.get()[0]?.id).toBe('approval:r9')
})

test('store caches projections only and never persists task status', () => {
  const writes: string[] = []

  const store = new HomeStore({
    get: () => null,
    set: key => {
      writes.push(key)
    }
  })

  const generation = store.beginHydration()
  store.applyRefresh(projectHomeItems([source({ type: 'running', sourceKind: 'session', sourceId: 's2' })]), generation)
  expect(writes).toEqual([])
  expect(store.persistedKeys()).toEqual([])
})
