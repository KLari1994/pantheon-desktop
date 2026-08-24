import { expect, test } from 'vitest'

import { federateSearch, type SearchSourceHit } from './federation'

const hits: SearchSourceHit[] = [
  {
    destinationId: 'sess-1',
    hidden: false,
    machine: 'this-device',
    ownerRoute: { connectionId: 'local', profile: 'ops' },
    sourceType: 'session',
    title: 'Ops standup notes'
  },
  {
    destinationId: 'sess-1',
    hidden: false,
    machine: 'lab-1',
    ownerRoute: { connectionId: 'homelab', profile: 'ops' },
    sourceType: 'session',
    title: 'Ops standup notes'
  },
  {
    destinationId: 'bot-ops',
    hidden: false,
    machine: 'this-device',
    ownerRoute: { connectionId: 'local', profile: 'ops' },
    sourceType: 'bot',
    title: 'Ops bot'
  },
  {
    destinationId: 'room-a',
    hidden: false,
    machine: 'relay',
    ownerRoute: { connectionId: 'local', profile: 'ops' },
    sourceType: 'room',
    title: 'Ops office'
  },
  {
    destinationId: 'sess-hidden',
    hidden: true,
    machine: 'this-device',
    ownerRoute: { connectionId: 'local', profile: 'ops' },
    sourceType: 'session',
    title: 'Hidden ops transcript'
  }
]

test('federates sessions, bots, and rooms with source and machine labels', () => {
  const results = federateSearch('ops', hits, { advanced: false })

  expect(results.map(result => result.sourceType).sort()).toEqual(['bot', 'room', 'session', 'session'])
  expect(results.every(result => result.machine && result.ownerRoute && result.destinationId)).toBe(true)
  expect(results.some(result => result.ownerRoute.connectionId === 'homelab')).toBe(true)
})

test('default search excludes hidden sessions; advanced mode includes them', () => {
  expect(federateSearch('ops', hits, { advanced: false }).some(result => result.destinationId === 'sess-hidden')).toBe(
    false
  )
  expect(federateSearch('ops', hits, { advanced: true }).some(result => result.destinationId === 'sess-hidden')).toBe(
    true
  )
})

test('does not collapse the same stored session id across two owner routes', () => {
  const results = federateSearch('standup', hits, { advanced: false })
  const sessions = results.filter(result => result.sourceType === 'session')

  expect(sessions).toHaveLength(2)
  expect(new Set(sessions.map(result => result.id)).size).toBe(2)
})
