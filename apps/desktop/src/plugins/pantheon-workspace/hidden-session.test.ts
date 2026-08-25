import { readFileSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from 'vitest'

import { diagnosticsFromSessions } from './plugin'
import { RoomsStore } from './rooms/store'

test('diagnostics can consume hidden sessions while the rooms store never lists include_hidden', () => {
  const rows = diagnosticsFromSessions(
    [{ profile: 'ops', connectionId: 'c1', id: 'sess-1', _lineage_root_id: 'root-1' }],
    'live-1'
  )

  expect(rows[0]?.health).toBe('resumable')
  const storeSource = readFileSync(path.join(process.cwd(), 'src/plugins/pantheon-workspace/rooms/store.ts'), 'utf8')
  expect(storeSource).not.toMatch(/include_hidden/)
  expect(storeSource).not.toMatch(/session_bindings|session-binding/)
  const store = new RoomsStore()
  store.mergeRooms([{ id: 'room-a', name: 'General', members: [] }])
  expect(store.$rooms.get().map(room => room.id)).toEqual(['room-a'])
})
