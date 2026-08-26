import { expect, test, vi } from 'vitest'

import { startHomeIngestion } from './home-ingest'
import { HomeStore } from './home/store'
import type { HomeSourceEvent } from './home/types'
import type { NotificationEvent } from './notifications/policy'

function event(partial: Partial<HomeSourceEvent> & Pick<HomeSourceEvent, 'type' | 'sourceKind' | 'sourceId'>): HomeSourceEvent {
  return {
    agent: 'Daedalus',
    context: 'ops',
    machine: 'win',
    timestamp: 1,
    title: partial.type,
    botId: 'bot-daedalus',
    roomId: 'room-1',
    ...partial
  }
}

test('asynchronous hydration projects subscribed sources into the home store', async () => {
  const store = new HomeStore()
  const live = [event({ type: 'approval', sourceKind: 'session', sourceId: 'sess-1', requestId: 'req-1' })]
  const listeners: Array<(next: HomeSourceEvent[]) => void> = []
  startHomeIngestion({
    store,
    listEvents: () => live,
    subscribe: onChange => {
      listeners.push(onChange)

      return () => undefined
    }
  })
  expect(store.$items.get()).toEqual([])
  await Promise.resolve()
  expect(store.$items.get().map(item => item.id)).toEqual(['approval:req-1'])
  live.push(event({ type: 'running', sourceKind: 'session', sourceId: 'sess-2', id: 'run-2' }))
  listeners[0]?.([...live])
  expect(store.$items.get().map(item => item.id)).toEqual(['approval:req-1', 'run-2'])
})

test('ingestion subscribe is wired into the coordinator so start is not a no-op', () => {
  const ingest = vi.fn()
  const unsubscribe = vi.fn()

  const incoming: NotificationEvent = {
    id: 'from-source',
    type: 'approval',
    target: { kind: 'session', href: '/sess-1' },
    botId: 'bot-daedalus'
  }

  const subscribe = vi.fn((handler: (event: NotificationEvent) => void) => {
    handler(incoming)

    return unsubscribe
  })

  const runtime = startHomeIngestion({
    store: new HomeStore(),
    listEvents: () => [],
    subscribe: () => () => undefined,
    notifications: { subscribe, ingest }
  })

  runtime.startNotifications()
  expect(subscribe).toHaveBeenCalledTimes(1)
  expect(ingest).toHaveBeenCalledWith(incoming)
  runtime.dispose()
  expect(unsubscribe).toHaveBeenCalledTimes(1)
})
