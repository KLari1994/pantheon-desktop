import { expect, test } from 'vitest'

import { isMuted, loadMutes, muteScope, mutesForCurrentScope, type MuteStorage, unmuteScope } from './mutes'

function memory(): MuteStorage & { writes: number; workExecuted: boolean } {
  const bag = new Map<string, unknown>()

  return {
    writes: 0,
    workExecuted: true,
    get: (key, fallback) => (bag.has(key) ? (bag.get(key) as typeof fallback) : fallback),
    set: (key, value) => {
      bag.set(key, value)
    },
    remove: key => {
      bag.delete(key)
    }
  }
}

test('bot and room mutes are isolated under a versioned scoped key', () => {
  const storage = memory()
  const scope = { workspace: 'pantheon', connectionId: 'conn-a' }
  const first = loadMutes(storage, scope)
  expect(first.key).toBe('notification-mutes-v1:pantheon:conn-a')
  muteScope(storage, scope, { kind: 'bot', id: 'Daedalus' })
  muteScope(storage, scope, { kind: 'room', id: 'room-1' })
  const loaded = loadMutes(storage, scope)
  expect(isMuted(loaded, { kind: 'bot', id: 'Daedalus' })).toBe(true)
  expect(isMuted(loaded, { kind: 'room', id: 'room-1' })).toBe(true)
  expect(isMuted(loaded, { kind: 'bot', id: 'Themis' })).toBe(false)
  expect(
    isMuted(loadMutes(storage, { workspace: 'pantheon', connectionId: 'conn-b' }), { kind: 'bot', id: 'Daedalus' })
  ).toBe(false)
})

test('corrupt storage falls back to empty mutes', () => {
  const storage: MuteStorage = {
    get: () => ({ mutedBots: 'not-json-object', mutedRooms: 'nope' }) as unknown as never,
    set: () => undefined,
    remove: () => undefined
  }

  const loaded = loadMutes(storage, { workspace: 'ws', connectionId: 'c' })
  expect(loaded.mutedBots).toEqual([])
  expect(loaded.mutedRooms).toEqual([])
})

test('mute changes notification delivery only, not work execution', () => {
  const storage = memory()
  const scope = { workspace: 'pantheon', connectionId: 'conn-a' }
  muteScope(storage, scope, { kind: 'bot', id: 'Daedalus' })
  unmuteScope(storage, scope, { kind: 'bot', id: 'Daedalus' })
  expect(storage.workExecuted).toBe(true)
  expect(isMuted(loadMutes(storage, scope), { kind: 'bot', id: 'Daedalus' })).toBe(false)
})

test('scope changes reload mutes instead of keeping the previous connection key', () => {
  const storage = memory()
  muteScope(storage, { workspace: 'pantheon', connectionId: 'conn-a' }, { kind: 'room', id: 'room-1' })
  const stale = loadMutes(storage, { workspace: 'pantheon', connectionId: 'conn-a' })
  const next = mutesForCurrentScope(storage, { workspace: 'pantheon', connectionId: 'conn-b' }, stale)
  expect(next.key).toBe('notification-mutes-v1:pantheon:conn-b')
  expect(next.mutedRooms).toEqual([])
})
