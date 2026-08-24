import { expect, test, vi } from 'vitest'

import { NotificationCoordinator } from './coordinator'
import type { NotificationEvent } from './policy'

function event(partial: Partial<NotificationEvent> & Pick<NotificationEvent, 'type' | 'id'>): NotificationEvent {
  return {
    target: { kind: 'session', href: '/sess-1' },
    botId: 'Daedalus',
    roomId: 'room-1',
    ...partial
  }
}

test('historical hydration establishes a baseline and emits nothing', () => {
  const toast = vi.fn()
  const native = vi.fn()
  const navigate = vi.fn()
  const coordinator = new NotificationCoordinator({ toast, native, navigate, focused: () => false })
  coordinator.hydrate([event({ type: 'approval', id: 'hist-1' })])
  expect(toast).not.toHaveBeenCalled()
  expect(native).not.toHaveBeenCalled()
  expect(navigate).not.toHaveBeenCalled()
})

test('duplicate event ids notify once', () => {
  const toast = vi.fn()
  const coordinator = new NotificationCoordinator({
    toast,
    native: vi.fn(),
    navigate: vi.fn(),
    focused: () => true
  })
  coordinator.hydrate([])
  coordinator.ingest(event({ type: 'approval', id: 'dup-1' }))
  coordinator.ingest(event({ type: 'approval', id: 'dup-1' }))
  expect(toast).toHaveBeenCalledTimes(1)
})

test('action-worthy terminal events flush immediately and healthy events stay quiet', () => {
  const toast = vi.fn()
  const coordinator = new NotificationCoordinator({
    toast,
    native: vi.fn(),
    navigate: vi.fn(),
    focused: () => true
  })
  coordinator.hydrate([])
  coordinator.ingest(event({ type: 'approval', id: 'now-1' }))
  coordinator.ingest(event({ type: 'successful-cron', id: 'quiet-1' }))
  coordinator.ingest(event({ type: 'healthy-background', id: 'quiet-2' }))
  expect(toast).toHaveBeenCalledTimes(1)
})

test('foreground uses toast door and background uses native door', () => {
  const toast = vi.fn()
  const native = vi.fn()
  const coordinator = new NotificationCoordinator({
    toast,
    native,
    navigate: vi.fn(),
    focused: () => true
  })
  coordinator.hydrate([])
  coordinator.ingest(event({ type: 'direct-mention', id: 'fg-1' }))
  expect(toast).toHaveBeenCalledTimes(1)
  expect(native).not.toHaveBeenCalled()
  coordinator.setFocused(false)
  coordinator.ingest(event({ type: 'direct-mention', id: 'bg-1' }))
  expect(native).toHaveBeenCalledTimes(1)
})

test('activation navigates only after the user clicks', () => {
  const navigate = vi.fn()
  let activate: (() => void) | undefined
  const coordinator = new NotificationCoordinator({
    toast: input => {
      activate = input.onActivate
    },
    native: input => {
      activate = input.onActivate
    },
    navigate,
    focused: () => true
  })
  coordinator.hydrate([])
  coordinator.ingest(event({ type: 'approval', id: 'click-1', target: { kind: 'session', href: '/sess-9' } }))
  expect(navigate).not.toHaveBeenCalled()
  activate?.()
  expect(navigate).toHaveBeenCalledWith('/sess-9')
})

test('teardown removes subscriptions and handlers', () => {
  const unsubscribe = vi.fn()
  const coordinator = new NotificationCoordinator({
    toast: vi.fn(),
    native: vi.fn(),
    navigate: vi.fn(),
    focused: () => true,
    subscribe: () => unsubscribe
  })
  coordinator.start()
  coordinator.dispose()
  expect(unsubscribe).toHaveBeenCalledTimes(1)
})

test('notification failures do not block projection refresh or retry-loop', () => {
  const refresh = vi.fn()
  const coordinator = new NotificationCoordinator({
    toast: () => {
      throw new Error('toast failed')
    },
    native: vi.fn(),
    navigate: vi.fn(),
    focused: () => true,
    onRefresh: refresh
  })
  coordinator.hydrate([])
  expect(() => coordinator.ingest(event({ type: 'approval', id: 'boom-1' }))).not.toThrow()
  expect(refresh).toHaveBeenCalledTimes(1)
})
