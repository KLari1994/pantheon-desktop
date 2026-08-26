import { expect, test } from 'vitest'

import { collectSearchHits } from './sources'

test('collects Hermes sessions, bots, and Buzz rooms with owner routes and machine labels', () => {
  const hits = collectSearchHits({
    bots: [
      {
        connectionId: 'local',
        id: 'bot-ops',
        machine: 'this-device',
        profile: 'ops',
        title: 'Ops bot'
      }
    ],
    rooms: [
      {
        connectionId: 'local',
        id: 'room-a',
        machine: 'relay',
        profile: 'ops',
        title: 'Ops office'
      }
    ],
    sessions: [
      {
        connectionId: 'homelab',
        hidden: false,
        id: 'sess-1',
        machine: 'lab-1',
        profile: 'ops',
        title: 'Ops standup'
      }
    ]
  })

  expect(hits.map(hit => hit.sourceType).sort()).toEqual(['bot', 'room', 'session'])
  expect(hits.find(hit => hit.sourceType === 'session')).toMatchObject({
    destinationId: 'sess-1',
    machine: 'lab-1',
    ownerRoute: { connectionId: 'homelab', profile: 'ops' }
  })
})

test('marks hidden sessions so default federation can exclude them', () => {
  const hits = collectSearchHits({
    sessions: [
      {
        connectionId: 'local',
        hidden: true,
        id: 'sess-hidden',
        machine: 'this-device',
        profile: 'ops',
        title: 'Hidden ops transcript'
      }
    ]
  })

  expect(hits).toEqual([expect.objectContaining({ destinationId: 'sess-hidden', hidden: true, sourceType: 'session' })])
})
