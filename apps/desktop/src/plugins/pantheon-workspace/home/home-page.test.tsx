import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { HomePage } from './home-page'
import { projectHomeItems } from './projections'
import { HomeStore } from './store'
import type { HomeSourceEvent } from './types'

afterEach(() => cleanup())

function source(partial: Partial<HomeSourceEvent> & Pick<HomeSourceEvent, 'type' | 'sourceKind' | 'sourceId'>): HomeSourceEvent {
  return {
    agent: 'Daedalus',
    context: 'ops',
    machine: 'win',
    timestamp: 1,
    title: partial.type,
    ...partial
  }
}

function seededStore(events: HomeSourceEvent[], status: 'degraded' | 'loading' | 'ready' = 'ready'): HomeStore {
  const store = new HomeStore()
  const generation = store.beginHydration()
  if (status === 'loading') return store
  store.applyRefresh(projectHomeItems(events), generation)
  if (status === 'degraded') store.markDegraded(generation)
  return store
}

test('renders the four named sections in order', () => {
  const store = seededStore([
    source({ type: 'direct-mention', sourceKind: 'room', sourceId: 'room-1' }),
    source({ type: 'running', sourceKind: 'session', sourceId: 's-work' }),
    source({ type: 'failed', sourceKind: 'cron', sourceId: 'cron-1' }),
    source({ type: 'review-decision', sourceKind: 'pr', sourceId: 'pr-1' })
  ])
  render(<HomePage store={store} onNavigate={() => undefined} />)
  const headings = screen.getAllByRole('heading').map(node => node.textContent)
  expect(headings).toEqual(['Needs You', 'Working', 'Stalled/Failed', 'Today'])
})

test('every rendered source type has exact navigation and visible identity', () => {
  const onNavigate = vi.fn()
  const store = seededStore([
    source({ type: 'approval', sourceKind: 'session', sourceId: 'sess-1', requestId: 'r1', title: 'Allow rm' }),
    source({ type: 'running', sourceKind: 'bot', sourceId: 'daedalus', title: 'Coding' }),
    source({ type: 'stalled', sourceKind: 'cron', sourceId: 'job-1', title: 'Stalled cron' }),
    source({ type: 'long-running-completion', sourceKind: 'artifact', sourceId: 'art-1', title: 'Wrote file' }),
    source({ type: 'direct-mention', sourceKind: 'room', sourceId: 'room-9', title: 'Mention' }),
    source({ type: 'merge-decision', sourceKind: 'project', sourceId: 'proj-1', title: 'Project ready' }),
    source({ type: 'review-decision', sourceKind: 'pr', sourceId: 'pr-7', title: 'Review ready' })
  ])
  render(<HomePage store={store} onNavigate={onNavigate} />)
  expect(screen.getAllByText('Daedalus').length).toBeGreaterThan(0)
  expect(screen.getAllByText('ops').length).toBeGreaterThan(0)
  expect(screen.getAllByText('win').length).toBeGreaterThan(0)
  fireEvent.click(screen.getByRole('button', { name: 'Open Allow rm' }))
  fireEvent.click(screen.getByRole('button', { name: 'Open Coding' }))
  fireEvent.click(screen.getByRole('button', { name: 'Open Stalled cron' }))
  fireEvent.click(screen.getByRole('button', { name: 'Open Wrote file' }))
  fireEvent.click(screen.getByRole('button', { name: 'Open Mention' }))
  fireEvent.click(screen.getByRole('button', { name: 'Open Project ready' }))
  fireEvent.click(screen.getByRole('button', { name: 'Open Review ready' }))
  expect(onNavigate.mock.calls.map(call => call[0])).toEqual([
    '/sess-1',
    '/rooms/memberships?bot=daedalus',
    '/cron?job=job-1',
    '/artifacts?id=art-1',
    '/rooms?room=room-9',
    '/rooms?project=proj-1',
    '/rooms?pr=pr-7'
  ])
})

test('loading, degraded, and empty states are textual', () => {
  const { rerender } = render(<HomePage store={seededStore([], 'loading')} onNavigate={() => undefined} />)
  expect(screen.getByText('Loading inbox')).toBeTruthy()
  rerender(<HomePage store={seededStore([], 'degraded')} onNavigate={() => undefined} />)
  expect(screen.getByText('Inbox degraded')).toBeTruthy()
  rerender(<HomePage store={seededStore([], 'ready')} onNavigate={() => undefined} />)
  expect(screen.getByText('Nothing needs attention')).toBeTruthy()
})

test('arriving data does not navigate or steal focus', () => {
  const onNavigate = vi.fn()
  const store = seededStore([])
  render(<HomePage store={store} onNavigate={onNavigate} />)
  const generation = store.beginHydration()
  store.applyRefresh(projectHomeItems([source({ type: 'approval', sourceKind: 'session', sourceId: 'sess-2', requestId: 'late' })]), generation)
  expect(onNavigate).not.toHaveBeenCalled()
  expect(document.activeElement === document.body || document.activeElement === null).toBe(true)
})
