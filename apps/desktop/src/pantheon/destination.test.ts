import { describe, expect, it } from 'vitest'

import {
  applyDestinationSelection,
  branchStrategy,
  canAutoSpeakReplies,
  canDictate,
  decideDestinationSend,
  destinationFromQuickTarget,
  describeRollbackPreview,
  hudHandoffForDestination,
  isPantheonDestination,
  rememberDestination,
  restoreLastBot,
  restoreLastRoom,
  restoreQuickTarget,
  showModelPicker,
  type DestinationMemory,
  type PantheonDestination
} from './destination'

const sessionDest: PantheonDestination = {
  kind: 'session',
  storedSessionId: 'sess-1',
  agentId: 'hermes'
}

const botDest: PantheonDestination = {
  kind: 'bot',
  storedSessionId: 'bot-sess-1',
  agentId: 'daedalus'
}

const roomDest: PantheonDestination = {
  kind: 'room',
  roomId: 'room-ops',
  threadRootId: 'evt-root'
}

describe('PantheonDestination', () => {
  it('supports session, bot, and room targets', () => {
    expect(isPantheonDestination(sessionDest)).toBe(true)
    expect(isPantheonDestination(botDest)).toBe(true)
    expect(isPantheonDestination(roomDest)).toBe(true)
    expect(isPantheonDestination({ kind: 'cron', id: 'job-1' })).toBe(false)
  })

  it('restores the last bot and last room without inventing a default', () => {
    let memory: DestinationMemory = {}

    expect(restoreLastBot(memory)).toBeNull()
    expect(restoreLastRoom(memory)).toBeNull()

    memory = rememberDestination(memory, botDest)
    memory = rememberDestination(memory, roomDest)

    expect(restoreLastBot(memory)).toEqual(botDest)
    expect(restoreLastRoom(memory)).toEqual(roomDest)
    expect(memory.lastUsed).toBe('room')
  })

  it('restores the last used bot or room into a still-offered quick target', () => {
    let memory: DestinationMemory = {}
    memory = rememberDestination(memory, botDest)
    memory = rememberDestination(memory, roomDest)

    expect(
      restoreQuickTarget(memory, {
        sessions: [{ id: 'bot-sess-1' }],
        rooms: [{ id: 'room-ops' }]
      })
    ).toBe('room:room-ops')

    memory = rememberDestination(memory, botDest)
    expect(
      restoreQuickTarget(memory, {
        sessions: [{ id: 'bot-sess-1' }],
        rooms: [{ id: 'room-ops' }]
      })
    ).toBe('bot-sess-1')
    expect(
      restoreQuickTarget(memory, {
        sessions: [],
        rooms: [{ id: 'room-ops' }]
      })
    ).toBe('room:room-ops')
  })

  it('changing destination before send is what the send decision uses', () => {
    const first = decideDestinationSend(sessionDest, { bridgeHealthy: true })
    const second = decideDestinationSend(roomDest, { bridgeHealthy: true })

    expect(first).toEqual({ allowed: true, channel: 'hermes', destination: sessionDest })
    expect(second).toEqual({ allowed: true, channel: 'buzz', destination: roomDest })
  })

  it('blocks a room send when the Buzz bridge is unhealthy', () => {
    expect(decideDestinationSend(roomDest, { bridgeHealthy: false })).toEqual({
      allowed: false,
      reason: 'bridge-unhealthy',
      destination: roomDest
    })
    expect(decideDestinationSend(botDest, { bridgeHealthy: false })).toEqual({
      allowed: true,
      channel: 'hermes',
      destination: botDest
    })
  })

  it('selecting a destination never changes the ambient profile default agent', () => {
    const ambient = { profileDefaultAgentId: 'default-agent' }

    expect(applyDestinationSelection(botDest, ambient)).toEqual({
      destination: botDest,
      profileDefaultAgentId: 'default-agent'
    })
    expect(applyDestinationSelection(roomDest, ambient)).toEqual({
      destination: roomDest,
      profileDefaultAgentId: 'default-agent'
    })
  })
})

describe('quick-entry send boundary', () => {
  it('maps current/new/session targets onto Hermes destinations and rooms onto Buzz', () => {
    expect(
      destinationFromQuickTarget('current', {
        currentSessionId: 'sess-live',
        currentAgentId: 'hermes'
      })
    ).toEqual({ kind: 'session', storedSessionId: 'sess-live', agentId: 'hermes' })

    expect(
      destinationFromQuickTarget('new', {
        currentSessionId: 'sess-live',
        currentAgentId: 'hermes'
      })
    ).toEqual({ kind: 'session', storedSessionId: 'new', agentId: 'hermes' })

    expect(
      destinationFromQuickTarget('sess-1', {
        currentSessionId: 'sess-live',
        currentAgentId: 'hermes',
        agentIdFor: () => 'chiron'
      })
    ).toEqual({ kind: 'session', storedSessionId: 'sess-1', agentId: 'chiron' })

    expect(destinationFromQuickTarget('room:room-ops', { currentSessionId: null, currentAgentId: 'hermes' })).toEqual({
      kind: 'room',
      roomId: 'room-ops'
    })
  })
})

describe('HUD destination handoff', () => {
  it('keeps bot/session destinations on the real HUD chat and hands rooms to the main window', () => {
    expect(hudHandoffForDestination(sessionDest)).toEqual({
      surface: 'hud',
      storedSessionId: 'sess-1'
    })
    expect(hudHandoffForDestination(botDest)).toEqual({
      surface: 'hud',
      storedSessionId: 'bot-sess-1'
    })
    expect(hudHandoffForDestination(roomDest)).toEqual({
      surface: 'main-window',
      destination: roomDest
    })
  })
})

describe('voice policy', () => {
  it('allows dictation in bot chat and room composers', () => {
    expect(canDictate('bot-chat')).toBe(true)
    expect(canDictate('room-composer')).toBe(true)
    expect(canDictate('direct-chat')).toBe(true)
  })

  it('keeps spoken replies opt-in, direct-chat/per-agent only, and never auto-speaks group/cron/background', () => {
    expect(canAutoSpeakReplies('direct-chat', { enabled: false, perAgent: true })).toBe(false)
    expect(canAutoSpeakReplies('direct-chat', { enabled: true, perAgent: true })).toBe(true)
    expect(canAutoSpeakReplies('bot-chat', { enabled: true, perAgent: true })).toBe(true)
    expect(canAutoSpeakReplies('bot-chat', { enabled: true, perAgent: false })).toBe(false)
    expect(canAutoSpeakReplies('room-composer', { enabled: true, perAgent: true })).toBe(false)
    expect(canAutoSpeakReplies('group', { enabled: true, perAgent: true })).toBe(false)
    expect(canAutoSpeakReplies('cron', { enabled: true, perAgent: true })).toBe(false)
    expect(canAutoSpeakReplies('background', { enabled: true, perAgent: true })).toBe(false)
  })
})

describe('model picker and branching', () => {
  it('hides the model picker on the Grok runtime and keeps other runtimes visible', () => {
    expect(showModelPicker('grok')).toBe(false)
    expect(showModelPicker('grok-4.6')).toBe(false)
    expect(showModelPicker('hermes')).toBe(true)
    expect(showModelPicker('openai')).toBe(true)
  })

  it('uses session.branch for bot/session destinations and Buzz threads for rooms', () => {
    expect(branchStrategy(sessionDest)).toBe('session.branch')
    expect(branchStrategy(botDest)).toBe('session.branch')
    expect(branchStrategy(roomDest)).toBe('buzz-thread')
  })
})

describe('rollback preview', () => {
  it('names the exact session, worktree, and machine and requires approval', () => {
    expect(
      describeRollbackPreview({
        sessionId: 'sess-1',
        worktree: '/opt/data/worktrees/pantheon-desktop/PAN-9',
        machine: 'lab-1'
      })
    ).toEqual({
      sessionId: 'sess-1',
      worktree: '/opt/data/worktrees/pantheon-desktop/PAN-9',
      machine: 'lab-1',
      summary: 'Restore sess-1 on /opt/data/worktrees/pantheon-desktop/PAN-9 @ lab-1',
      requiresApproval: true
    })
  })
})
