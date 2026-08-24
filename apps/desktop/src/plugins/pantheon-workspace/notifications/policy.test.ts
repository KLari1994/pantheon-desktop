import { expect, test } from 'vitest'

import { classifyNotificationEvent, type NotificationEvent } from './policy'

function event(partial: Partial<NotificationEvent> & Pick<NotificationEvent, 'type'>): NotificationEvent {
  return {
    id: partial.id || `${partial.type}-1`,
    target: partial.target ?? { kind: 'session', href: '/sess-1' },
    botId: 'Daedalus',
    roomId: 'room-1',
    ...partial
  }
}

const allow = [
  'direct-mention',
  'explicit-needs-you',
  'approval',
  'exhausted-cron-retry',
  'long-running-completion',
  'review-decision',
  'merge-decision'
] as const

const silence = ['ordinary-message', 'tool-call', 'successful-cron', 'routine-working', 'healthy-background'] as const

test.each(allow)('allows %s', type => {
  expect(classifyNotificationEvent(event({ type }), { mutedBots: [], mutedRooms: [] })).toBe('notify')
})

test.each(silence)('silences %s', type => {
  expect(classifyNotificationEvent(event({ type }), { mutedBots: [], mutedRooms: [] })).toBe('silence')
})

test('requires a valid exact-source action target', () => {
  expect(
    classifyNotificationEvent(event({ type: 'approval', target: { kind: 'session', href: '' } }), {
      mutedBots: [],
      mutedRooms: []
    })
  ).toBe('silence')
})

test('muted bot or room suppresses delivery without changing classification of work', () => {
  expect(classifyNotificationEvent(event({ type: 'approval' }), { mutedBots: ['Daedalus'], mutedRooms: [] })).toBe(
    'silence'
  )
  expect(classifyNotificationEvent(event({ type: 'approval' }), { mutedBots: [], mutedRooms: ['room-1'] })).toBe(
    'silence'
  )
})
