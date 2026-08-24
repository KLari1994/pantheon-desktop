import { expect, test, vi } from 'vitest'

import { botIdFromMembershipSearch, membershipHref, openHomeTarget, pickRoomId, registeredHref, roomsSearchHref, sourceIdFromRoomsSearch } from './navigation'

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
  expect(registeredHref('bot', 'daedalus')).toBe('/rooms/memberships?bot=daedalus')
  expect(registeredHref('session', 'sess-1')).toBe('/sess-1')
  expect(registeredHref('cron', 'job-3')).toBe('/cron-center?job=job-3')
  expect(registeredHref('artifact', 'art-2')).toBe('/artifacts?id=art-2')
  expect(registeredHref('room', 'room-9').startsWith('/rooms')).toBe(true)
})

test('openHomeTarget uses the APIs those surfaces actually consume', () => {
  const navigate = vi.fn()
  const openSession = vi.fn()
  const setCronFocusJobId = vi.fn()
  const openArtifact = vi.fn()
  const owner = { connectionId: 'conn-a', profile: 'daedalus' }
  openHomeTarget('/sess-1', { navigate, openSession, setCronFocusJobId, openArtifact, owner })
  expect(openSession).toHaveBeenCalledWith('sess-1', navigate, 'stack', {
    workspaceMode: 'sessions',
    ownerRoute: owner
  })
  openHomeTarget('/cron-center?job=job-3', { navigate, openSession, setCronFocusJobId, openArtifact, owner })
  expect(setCronFocusJobId).not.toHaveBeenCalled()
  expect(navigate).toHaveBeenCalledWith('/cron-center?job=job-3')
  openHomeTarget('/cron?job=job-legacy', { navigate, openSession, setCronFocusJobId, openArtifact, owner })
  expect(navigate).toHaveBeenCalledWith('/cron-center?job=job-legacy')
  openHomeTarget('/artifacts?id=art-2', { navigate, openSession, setCronFocusJobId, openArtifact, owner })
  expect(openArtifact).toHaveBeenCalledWith('art-2')
  openHomeTarget('/rooms/memberships?bot=daedalus', { navigate, openSession, setCronFocusJobId, openArtifact, owner })
  expect(navigate).toHaveBeenCalledWith('/rooms/memberships?bot=daedalus')
  openHomeTarget('/agents?bot=daedalus', { navigate, openSession, setCronFocusJobId, openArtifact, owner })
  expect(navigate).toHaveBeenCalledWith('/rooms/memberships?bot=daedalus')
  openHomeTarget('/rooms?room=room-9', { navigate, openSession, setCronFocusJobId, openArtifact, owner })
  expect(navigate).toHaveBeenCalledWith('/rooms?room=room-9')
})

test('membership search preserves the requested bot', () => {
  expect(botIdFromMembershipSearch('?bot=daedalus')).toBe('daedalus')
  expect(membershipHref('daedalus')).toBe('/rooms/memberships?bot=daedalus')
})
