import { expect, test } from 'vitest'

import { pickRoomId, registeredHref, roomsSearchHref, sourceIdFromRoomsSearch } from './navigation'

test('room, project, and pr use the registered /rooms path with an encoded source id', () => {
  expect(registeredHref('room', 'room/9')).toBe('/rooms?room=room%2F9')
  expect(registeredHref('project', 'proj 1')).toBe('/rooms?project=proj%201')
  expect(registeredHref('pr', 'pr-7')).toBe('/rooms?pr=pr-7')
  expect(roomsSearchHref('room', 'room-9')).toBe('/rooms?room=room-9')
})

test('RoomsPage initializes from the encoded registered query, not the first room', () => {
  expect(sourceIdFromRoomsSearch('?room=room-9')).toBe('room-9')
  expect(sourceIdFromRoomsSearch('?project=proj%201')).toBe('proj 1')
  expect(sourceIdFromRoomsSearch('?pr=pr-7')).toBe('pr-7')
  expect(pickRoomId(['first', 'room-9'], '?room=room-9')).toBe('room-9')
  expect(pickRoomId(['first', 'second'], '')).toBe('first')
})

test('every source kind has a registered one-segment path', () => {
  expect(registeredHref('bot', 'daedalus')).toBe('/agents?bot=daedalus')
  expect(registeredHref('session', 'sess-1')).toBe('/sess-1')
  expect(registeredHref('cron', 'job-3')).toBe('/cron?job=job-3')
  expect(registeredHref('artifact', 'art-2')).toBe('/artifacts?id=art-2')
  expect(registeredHref('room', 'room-9').startsWith('/rooms')).toBe(true)
})
