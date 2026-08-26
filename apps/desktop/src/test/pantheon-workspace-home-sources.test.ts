import { afterEach, expect, test, vi } from 'vitest'

import { createClientSessionState } from '@/lib/chat-runtime'
import { setCronJobs } from '@/store/cron'
import { clearAllPrompts, setApprovalRequest } from '@/store/prompts'
import { setSessions } from '@/store/session'
import { clearAllSessionStates, publishSessionState } from '@/store/session-states'
import { makeSessionInfo } from '@/test/session-info'

import {
  applyHomeSourceSnapshot,
  classifyRoomLiveEvent,
  collectApprovalInboxRows,
  collectAuthoritativeHomeEvents,
  ingestBuzzBridgeEvent,
  resetHomeSourceState,
  subscribeAuthoritativeHomeSources,
  toNotificationEvent
} from '../plugins/pantheon-workspace/home-sources'

afterEach(() => {
  resetHomeSourceState()
  clearAllPrompts()
  clearAllSessionStates()
  setSessions([])
  setCronJobs([])
})

async function flushHomeSources(): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await Promise.resolve()
  }
}

test('startSubscription is called with listed room ids', async () => {
  const startSubscription = vi.fn(async () => ({ started: true }))
  const subscribe = vi.fn(() => () => undefined)

  const unsub = subscribeAuthoritativeHomeSources(() => undefined, {
    buzz: {
      subscribe,
      startSubscription,
      listRooms: async () => ({ rooms: [{ id: 'room-ops', name: 'Ops', members: [] }] }),
      status: async () => ({ state: 'open', pubkey: 'pk-me' })
    }
  })

  await Promise.resolve()
  await Promise.resolve()
  expect(startSubscription).toHaveBeenCalledWith({ roomIds: ['room-ops'] })
  unsub()
})

test('collector does not invent completions or exhausted retries from ordinary settle or last_error', () => {
  setCronJobs([
    {
      id: 'cron-fail',
      enabled: true,
      last_error: 'retries exhausted',
      name: 'nightly',
      state: 'error'
    }
  ])
  publishSessionState('rt-done', { ...createClientSessionState('stored-done'), busy: true })
  publishSessionState('rt-done', { ...createClientSessionState('stored-done'), busy: false })
  ingestBuzzBridgeEvent({
    type: 'room.event',
    roomId: 'pr-1',
    event: {
      id: 'evt-review',
      kind: 9,
      content: 'review ready',
      created_at: 2,
      tags: [
        ['t', 'review-decision'],
        ['p', 'pk-me']
      ]
    }
  })
  const types = collectAuthoritativeHomeEvents().map(event => event.type)
  expect(types).not.toContain('exhausted-retry')
  expect(types).not.toContain('long-running-completion')
  expect(types).toContain('review-decision')
})

test('collector projects exhausted-retry only from exhausted cron state and failed only from failed state', () => {
  setCronJobs([
    { id: 'cron-ex', enabled: true, name: 'nightly', state: 'exhausted' },
    { id: 'cron-fail', enabled: true, name: 'backup', state: 'failed' },
    { id: 'cron-ok', enabled: true, name: 'ok', state: 'ok' }
  ])
  const types = collectAuthoritativeHomeEvents().map(event => event.type)
  expect(types.filter(type => type === 'exhausted-retry')).toHaveLength(1)
  expect(types.filter(type => type === 'failed')).toHaveLength(1)
  expect(collectAuthoritativeHomeEvents().find(event => event.type === 'exhausted-retry')?.sourceId).toBe('cron-ex')
  expect(collectAuthoritativeHomeEvents().find(event => event.type === 'failed')?.sourceId).toBe('cron-fail')
})

test('approval inbox resolves runtime-keyed prompts from stored/lineage attention ids', () => {
  setSessions([
    makeSessionInfo({
      id: 'stored-1',
      _lineage_root_id: 'stored-1',
      title: 'ops',
      profile: 'daedalus',
      connection_id: 'conn-a'
    })
  ])
  publishSessionState('runtime-1', {
    ...createClientSessionState('stored-1'),
    needsInput: true
  })
  setApprovalRequest({
    command: 'rm',
    description: 'delete',
    requestId: 'req-runtime',
    sessionId: 'runtime-1'
  })
  const rows = collectApprovalInboxRows()
  expect(rows).toHaveLength(1)
  expect(rows[0]?.request.sessionId).toBe('runtime-1')
  expect(rows[0]?.request.requestId).toBe('req-runtime')
  expect(rows[0]?.card.agent).toBe('daedalus')
  expect(rows[0]?.card.machine).toBe('conn-a')
})

test('identity supplies roomId from unique workspace room membership so room mute works', () => {
  resetHomeSourceState({
    rooms: [{ id: 'room-ops', memberNames: ['daedalus'] }],
    viewer: { pubkey: 'pk-me', name: 'kelcee' }
  })
  setSessions([
    makeSessionInfo({
      id: 'stored-1',
      title: 'ops',
      profile: 'daedalus',
      connection_id: 'conn-a'
    })
  ])
  publishSessionState('runtime-1', {
    ...createClientSessionState('stored-1'),
    needsInput: true
  })
  setApprovalRequest({
    command: 'rm',
    description: 'delete',
    requestId: 'req-2',
    sessionId: 'runtime-1'
  })
  expect(collectApprovalInboxRows()[0]?.card.roomId).toBe('room-ops')
})

test('mention detection requires the current user pubkey or handle', () => {
  resetHomeSourceState({ viewer: { pubkey: 'pk-me', name: 'kelcee' } })
  expect(
    classifyRoomLiveEvent(
      {
        id: 'other-p',
        kind: 9,
        content: 'hey',
        tags: [['p', 'pk-other']]
      },
      'room-1'
    )
  ).toBeNull()
  expect(
    classifyRoomLiveEvent(
      {
        id: 'stray-at',
        kind: 9,
        content: 'see @someone'
      },
      'room-1'
    )
  ).toBeNull()
  expect(
    classifyRoomLiveEvent(
      {
        id: 'me-p',
        kind: 9,
        content: 'hey',
        tags: [['p', 'pk-me']]
      },
      'room-1'
    )?.type
  ).toBe('direct-mention')
  expect(
    classifyRoomLiveEvent(
      {
        id: 'me-at',
        kind: 9,
        content: '@kelcee please look'
      },
      'room-1'
    )?.type
  ).toBe('direct-mention')
})

test('membership control events stay quiet', () => {
  resetHomeSourceState({ viewer: { pubkey: 'pk-me', name: 'kelcee' } })
  expect(
    classifyRoomLiveEvent(
      {
        id: 'join',
        kind: 9000,
        content: '@kelcee joined',
        tags: [['p', 'pk-me']]
      },
      'room-1'
    )
  ).toBeNull()
})

test('plugin notifications skip approvals because core already fires them', () => {
  expect(
    toNotificationEvent({
      type: 'approval',
      sourceKind: 'session',
      sourceId: 'sess-1',
      agent: 'daedalus',
      context: 'ops',
      machine: 'win',
      timestamp: 1,
      requestId: 'req-1'
    })
  ).toBeNull()
})

test('hydrates unique room membership from getRoom when listRooms members are empty', async () => {
  const getRoom = vi.fn(async () => ({
    id: 'room-ops',
    name: 'Ops',
    members: [{ pubkey: 'pk-d', name: 'daedalus' }]
  }))

  const unsub = subscribeAuthoritativeHomeSources(() => undefined, {
    buzz: {
      subscribe: () => () => undefined,
      startSubscription: async () => ({ started: true }),
      listRooms: async () => ({ rooms: [{ id: 'room-ops', name: 'Ops', members: [] }] }),
      getRoom,
      getWorkspaceManifest: async () => ({ version: 1, rooms: [] }),
      status: async () => ({ state: 'open', pubkey: 'pk-me' })
    }
  })

  await flushHomeSources()
  setSessions([
    makeSessionInfo({
      id: 'stored-1',
      title: 'ops',
      profile: 'daedalus',
      connection_id: 'conn-a'
    })
  ])
  publishSessionState('runtime-1', {
    ...createClientSessionState('stored-1'),
    needsInput: true
  })
  setApprovalRequest({
    command: 'rm',
    description: 'delete',
    requestId: 'req-hydrate',
    sessionId: 'runtime-1'
  })
  expect(getRoom).toHaveBeenCalledWith({ roomId: 'room-ops' })
  expect(collectApprovalInboxRows()[0]?.card.roomId).toBe('room-ops')
  unsub()
})

test('hydrates member ids from workspace manifest when getRoom members stay empty', async () => {
  const unsub = subscribeAuthoritativeHomeSources(() => undefined, {
    buzz: {
      subscribe: () => () => undefined,
      startSubscription: async () => ({ started: true }),
      listRooms: async () => ({ rooms: [{ id: 'room-ops', name: 'Ops', members: [] }] }),
      getRoom: async () => ({ id: 'room-ops', name: 'Ops', members: [] }),
      getWorkspaceManifest: async () => ({
        version: 1,
        rooms: [{ id: 'room-ops', memberAgentIds: ['daedalus'] }]
      }),
      status: async () => ({ state: 'open', pubkey: 'pk-me' })
    }
  })

  await flushHomeSources()
  setSessions([
    makeSessionInfo({
      id: 'stored-1',
      title: 'ops',
      profile: 'daedalus',
      connection_id: 'conn-a'
    })
  ])
  publishSessionState('runtime-1', {
    ...createClientSessionState('stored-1'),
    needsInput: true
  })
  setApprovalRequest({
    command: 'rm',
    description: 'delete',
    requestId: 'req-manifest',
    sessionId: 'runtime-1'
  })
  expect(collectApprovalInboxRows()[0]?.card.roomId).toBe('room-ops')
  unsub()
})

test('room mute stays disabled when membership remains unknown', async () => {
  const unsub = subscribeAuthoritativeHomeSources(() => undefined, {
    buzz: {
      subscribe: () => () => undefined,
      startSubscription: async () => ({ started: true }),
      listRooms: async () => ({ rooms: [{ id: 'room-ops', name: 'Ops', members: [] }] }),
      getRoom: async () => ({ id: 'room-ops', name: 'Ops', members: [] }),
      getWorkspaceManifest: async () => ({ version: 1, rooms: [{ id: 'room-ops', memberAgentIds: [] }] }),
      status: async () => ({ state: 'open', pubkey: 'pk-me' })
    }
  })

  await flushHomeSources()
  setSessions([
    makeSessionInfo({
      id: 'stored-1',
      title: 'ops',
      profile: 'daedalus',
      connection_id: 'conn-a'
    })
  ])
  publishSessionState('runtime-1', {
    ...createClientSessionState('stored-1'),
    needsInput: true
  })
  setApprovalRequest({
    command: 'rm',
    description: 'delete',
    requestId: 'req-unknown',
    sessionId: 'runtime-1'
  })
  expect(collectApprovalInboxRows()[0]?.card.roomId).toBeUndefined()
  unsub()
})

test('viewer handle comes from Buzz pubkey plus room display name, not Hermes profile id', async () => {
  const unsub = subscribeAuthoritativeHomeSources(() => undefined, {
    buzz: {
      subscribe: () => () => undefined,
      startSubscription: async () => ({ started: true }),
      listRooms: async () => ({
        rooms: [{ id: 'room-ops', name: 'Ops', members: [{ pubkey: 'pk-me', name: 'kelcee' }] }]
      }),
      status: async () => ({ state: 'open', pubkey: 'pk-me' })
    }
  })

  await flushHomeSources()
  expect(
    classifyRoomLiveEvent(
      {
        id: 'me-at',
        kind: 9,
        content: '@kelcee please look'
      },
      'room-1'
    )?.type
  ).toBe('direct-mention')
  expect(
    classifyRoomLiveEvent(
      {
        id: 'profile-id',
        kind: 9,
        content: '@daedalus please look'
      },
      'room-1'
    )
  ).toBeNull()
  expect(
    classifyRoomLiveEvent(
      {
        id: 'settled-ordinary',
        kind: 9,
        content: 'turn finished'
      },
      'room-1'
    )
  ).toBeNull()
  unsub()
})

test('empty snapshots still reproject the approval inbox', () => {
  const replaceInbox = vi.fn()
  const ingest = vi.fn()
  applyHomeSourceSnapshot([], {
    replaceInbox,
    ingestNotification: ingest
  })
  expect(replaceInbox).toHaveBeenCalledTimes(1)
  expect(ingest).not.toHaveBeenCalled()
})
