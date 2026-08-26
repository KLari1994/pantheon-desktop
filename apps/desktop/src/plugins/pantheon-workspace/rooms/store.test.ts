import { expect, test } from 'vitest'

import { RoomsStore } from './store'
import { ROOMS_READ_WATERMARKS_KEY } from './types'

test('identity-stable merge keeps a room id across rename', () => {
  const store = new RoomsStore()
  store.mergeRooms([{ id: 'room-a', name: 'General', members: [] }])
  const first = store.$rooms.get()[0]
  store.mergeRooms([{ id: 'room-a', name: 'Ops', members: [] }])
  expect(store.$rooms.get()[0]?.id).toBe(first?.id)
  expect(store.$rooms.get()[0]?.name).toBe('Ops')
})

test('optimistic send rolls back to failed and can be removed', () => {
  const store = new RoomsStore()
  store.queueOptimistic('room-a', 'hello', 'n1')
  expect(store.$windows.get()['room-a']?.messages[0]?.outgoing).toBe('pending')
  store.failOptimistic('n1')
  expect(store.$windows.get()['room-a']?.messages[0]?.outgoing).toBe('failed')
  store.removeOptimistic('n1')
  expect(store.$windows.get()['room-a']?.messages).toEqual([])
})

test('ack replaces nonce with relay event id and dedupes later ingest', () => {
  const store = new RoomsStore()
  store.queueOptimistic('room-a', 'hello', 'n1')
  store.ackOptimistic('n1', 'evt-9')
  store.ingestEvent('room-a', { id: 'evt-9', content: 'hello', created_at: 2, pubkey: 'you' })
  expect(store.$windows.get()['room-a']?.messages.filter(message => message.id === 'evt-9')).toHaveLength(1)
})

test('optimistic rows keep mentions, thread root, and attachments through ack and ingest', () => {
  const store = new RoomsStore()
  const attachments = [{ url: 'https://files.example/a.png', mimeType: 'image/png', name: 'a.png' }]
  store.queueOptimistic('room-a', 'see this @ops', 'n-meta', {
    mentions: ['ops'],
    threadRootId: 'evt-root',
    attachments
  })
  store.ackOptimistic('n-meta', 'evt-9')
  store.ingestEvent('room-a', { id: 'evt-9', kind: 9, content: 'see this @ops', created_at: 2, pubkey: 'you' })
  expect(store.$windows.get()['room-a']?.messages).toEqual([
    expect.objectContaining({
      id: 'evt-9',
      outgoing: 'sent',
      mentions: ['ops'],
      threadRootId: 'evt-root',
      attachments
    })
  ])
})

test('watermark unread and needsYou derivation', () => {
  const storage = new Map<string, unknown>([[ROOMS_READ_WATERMARKS_KEY, { 'room-a': 1 }]])

  const store = new RoomsStore(
    { get: key => storage.get(key), set: (key, value) => storage.set(key, value) },
    { name: 'kelcee', pubkey: 'pk1' }
  )

  store.applyWindow('room-a', [
    {
      id: 'evt-1',
      roomId: 'room-a',
      content: 'status?',
      createdAt: 5,
      author: 'alice',
      mentions: ['pk1']
    }
  ])
  store.mergeRooms([{ id: 'room-a', name: 'General', members: [] }])
  expect(store.$rooms.get()[0]?.unread).toBe(true)
  expect(store.$rooms.get()[0]?.needsYou).toBe(true)
  store.markRead('room-a', 5)
  expect(store.$rooms.get()[0]?.unread).toBe(false)
})

test('TTL maps from expiresAt and reconnect keeps pending rows', () => {
  const store = new RoomsStore()
  store.queueOptimistic('room-a', 'hold', 'n2')
  store.mergeRooms([{ id: 'room-a', name: 'Temp', members: [], kind: 'temporary', expiresAt: 99 }])
  store.reconnectKeepPending()
  expect(store.$rooms.get()[0]?.expiresAt).toBe('99')
  expect(store.$windows.get()['room-a']?.messages[0]?.outgoing).toBe('pending')
})

test('store never persists session bindings', () => {
  const store = new RoomsStore({ get: () => null, set: () => undefined })
  store.markRead('room-a', 1)
  expect(store.usedBindingCache()).toBe(false)
  expect([...store.storageKeysUsed]).toEqual([ROOMS_READ_WATERMARKS_KEY])
})

test('live events dispatch by kind into messages, reactions, and deletions', () => {
  const store = new RoomsStore()
  store.ingestEvent('room-a', { id: 'evt-1', kind: 9, content: 'hello', created_at: 1, pubkey: 'alice' })
  store.ingestEvent('room-a', {
    id: 'rx-1',
    kind: 7,
    content: '👍',
    pubkey: 'bob',
    tags: [['e', 'evt-1']]
  })
  store.ingestEvent('room-a', { id: 'rx-1-del', kind: 5, tags: [['e', 'rx-1']] })
  store.ingestEvent('room-a', { id: 'mem-1', kind: 9000, content: 'invite', pubkey: 'carol' })
  expect(store.$windows.get()['room-a']?.messages.map(message => message.id)).toEqual(['evt-1'])
  expect(store.$windows.get()['room-a']?.reactions).toEqual([])
})

test('membership and metadata events request a room refresh instead of being dropped', () => {
  const store = new RoomsStore()
  store.mergeRooms([{ id: 'room-a', name: 'General', members: [{ pubkey: 'alice' }] }])
  expect(store.ingestEvent('room-a', { id: 'mem-1', kind: 9000, pubkey: 'carol' })).toBe('refresh-room')
  expect(store.ingestEvent('room-a', { id: 'meta-1', kind: 39000, content: 'Ops' })).toBe('refresh-room')
  expect(store.ingestEvent('room-a', { id: 'roster-1', kind: 39002 })).toBe('refresh-room')
  store.upsertRoom({
    id: 'room-a',
    name: 'Ops',
    members: [{ pubkey: 'alice' }, { pubkey: 'carol' }],
    kind: 'temporary',
    expiresAt: 99
  })
  expect(store.$rooms.get()[0]).toMatchObject({
    name: 'Ops',
    memberAgentIds: ['alice', 'carol'],
    expiresAt: '99'
  })
  expect(store.$windows.get()['room-a']?.messages).toBeUndefined()
})
