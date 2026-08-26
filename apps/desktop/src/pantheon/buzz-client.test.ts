import assert from 'node:assert/strict'

import { afterEach, test } from 'vitest'

import { BUZZ_ACP_PIN, createBuzzClient, type PantheonBuzzApi } from './buzz-client'

function fakeApi(overrides: Partial<PantheonBuzzApi> = {}): PantheonBuzzApi {
  return {
    status: async () => ({ state: 'open', compatibilityCommit: '0720f5380ce8a6c050afac159f8462c06cd51ab5' }),
    listRooms: async () => ({ rooms: [{ id: 'room-a', name: 'General', members: [] }] }),
    getRoom: async () => ({ id: 'room-a', name: 'General', members: [{ pubkey: 'alice', name: 'Alice' }] }),
    getMessages: async () => ({
      messages: [{ id: 'evt-1', roomId: 'room-a', content: 'hello', createdAt: 1, author: 'alice' }]
    }),
    sendMessage: async () => ({ eventId: 'evt-2', createdAt: 2 }),
    addReaction: async () => ({ eventId: 'evt-3' }),
    removeReaction: async () => ({ eventId: 'evt-4' }),
    inviteMember: async () => ({ eventId: 'evt-5' }),
    removeMember: async () => ({ eventId: 'evt-6' }),
    startSubscription: async () => ({ started: true }),
    stopSubscription: async () => ({ stopped: true }),
    getWorkspaceManifest: async () => ({ version: 1 }),
    updateRoomMembership: async () => ({ version: 1, rooms: [] }),
    subscribe: () => () => undefined,
    ...overrides
  }
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window
})

test('client has no credential setter and exposes the write surface', () => {
  const client = createBuzzClient(fakeApi())
  assert.equal('setCredential' in client, false)
  assert.deepEqual(Object.keys(client).sort(), [
    'addReaction',
    'getMessages',
    'getRoom',
    'getWorkspaceManifest',
    'inviteMember',
    'listRooms',
    'removeMember',
    'removeReaction',
    'sendMessage',
    'startSubscription',
    'status',
    'stopSubscription',
    'subscribe',
    'updateRoomMembership'
  ])
})

test('client rejects message limits outside 1..200', async () => {
  const client = createBuzzClient(fakeApi())
  await assert.rejects(() => client.getMessages({ roomId: 'room-a', limit: 0 }))
  await assert.rejects(() => client.getMessages({ roomId: 'room-a', limit: 201 }))
})

test('client rejects oversized send content before IPC', async () => {
  const client = createBuzzClient(fakeApi())
  await assert.rejects(() => client.sendMessage({ roomId: 'room-a', content: 'x'.repeat(64 * 1024 + 1) }))
})

test('client reads status rooms and a message window', async () => {
  const client = createBuzzClient(fakeApi())
  const status = await client.status()
  const rooms = await client.listRooms()
  const room = await client.getRoom({ roomId: 'room-a' })
  const window = await client.getMessages({ roomId: 'room-a', limit: 50 })
  assert.equal(status.state, 'open')
  assert.equal(rooms.rooms[0]?.name, 'General')
  assert.equal(room.members[0]?.name, 'Alice')
  assert.equal(window.messages[0]?.content, 'hello')
})

test('records the pinned buzz-acp commit', () => {
  assert.equal(BUZZ_ACP_PIN.commit, 'c11e582ec17293f0036f4363e1b26d2fdde86c71')
  assert.equal(BUZZ_ACP_PIN.branch, 'pantheon')
})
