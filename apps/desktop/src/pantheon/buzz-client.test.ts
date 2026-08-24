import assert from 'node:assert/strict'

import { afterEach, test } from 'vitest'

import { createBuzzClient, type PantheonBuzzApi } from './buzz-client'

function fakeApi(overrides: Partial<PantheonBuzzApi> = {}): PantheonBuzzApi {
  return {
    status: async () => ({ state: 'open', compatibilityCommit: '0720f5380ce8a6c050afac159f8462c06cd51ab5' }),
    listRooms: async () => ({ rooms: [{ id: 'room-a', name: 'General', members: [] }] }),
    getRoom: async () => ({ id: 'room-a', name: 'General', members: [{ pubkey: 'alice', name: 'Alice' }] }),
    getMessages: async () => ({ messages: [{ id: 'evt-1', roomId: 'room-a', content: 'hello', createdAt: 1, author: 'alice' }] }),
    subscribe: () => () => undefined,
    ...overrides
  }
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window
})

test('client has no credential or send methods', () => {
  const client = createBuzzClient(fakeApi())
  assert.equal('setCredential' in client, false)
  assert.equal('send' in client, false)
  assert.deepEqual(Object.keys(client).sort(), ['getMessages', 'getRoom', 'listRooms', 'status', 'subscribe'])
})

test('client rejects message limits outside 1..200', async () => {
  const client = createBuzzClient(fakeApi())
  await assert.rejects(() => client.getMessages({ roomId: 'room-a', limit: 0 }))
  await assert.rejects(() => client.getMessages({ roomId: 'room-a', limit: 201 }))
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
