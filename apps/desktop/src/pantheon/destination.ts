/**
 * Shared Pantheon destination contract.
 *
 * Quick Entry, HUD, and room composers pick a target while composing; only the
 * send boundary becomes destination-aware. Bot/session traffic stays on Hermes.
 * Room traffic stays on Buzz and fails closed when the bridge is unhealthy.
 * Selecting a destination never mutates the ambient profile default agent.
 */

export type PantheonDestination =
  | { kind: 'session'; storedSessionId: string; agentId: string }
  | { kind: 'bot'; storedSessionId: string; agentId: string }
  | { kind: 'room'; roomId: string; threadRootId?: string }

export interface DestinationMemory {
  lastBot?: Extract<PantheonDestination, { kind: 'bot' }>
  lastRoom?: Extract<PantheonDestination, { kind: 'room' }>
  lastUsed?: 'bot' | 'room'
}

export type DestinationSendDecision =
  | { allowed: true; channel: 'hermes' | 'buzz'; destination: PantheonDestination }
  | { allowed: false; reason: 'bridge-unhealthy'; destination: PantheonDestination }

export type VoiceSurface = 'direct-chat' | 'bot-chat' | 'room-composer' | 'group' | 'cron' | 'background'

export const QUICK_TARGET_CURRENT = 'current'
export const QUICK_TARGET_NEW = 'new'
export const ROOM_TARGET_PREFIX = 'room:'
export const BOT_TARGET_PREFIX = 'bot:'

export function isPantheonDestination(value: unknown): value is PantheonDestination {
  if (!value || typeof value !== 'object') {
    return false
  }

  const record = value as Record<string, unknown>

  if (record.kind === 'session' || record.kind === 'bot') {
    return (
      typeof record.storedSessionId === 'string' &&
      record.storedSessionId.length > 0 &&
      typeof record.agentId === 'string'
    )
  }

  if (record.kind === 'room') {
    return typeof record.roomId === 'string' && record.roomId.length > 0
  }

  return false
}

export function rememberDestination(memory: DestinationMemory, destination: PantheonDestination): DestinationMemory {
  if (destination.kind === 'bot') {
    return { ...memory, lastBot: destination, lastUsed: 'bot' }
  }

  if (destination.kind === 'room') {
    return { ...memory, lastRoom: destination, lastUsed: 'room' }
  }

  return memory
}

export function restoreLastBot(memory: DestinationMemory): DestinationMemory['lastBot'] | null {
  return memory.lastBot ?? null
}

export function restoreLastRoom(memory: DestinationMemory): DestinationMemory['lastRoom'] | null {
  return memory.lastRoom ?? null
}

export function applyDestinationSelection(
  destination: PantheonDestination,
  ambient: { profileDefaultAgentId: string }
): { destination: PantheonDestination; profileDefaultAgentId: string } {
  return {
    destination,
    profileDefaultAgentId: ambient.profileDefaultAgentId
  }
}

export function decideDestinationSend(
  destination: PantheonDestination,
  ctx: { bridgeHealthy: boolean }
): DestinationSendDecision {
  if (destination.kind === 'room') {
    if (!ctx.bridgeHealthy) {
      return { allowed: false, reason: 'bridge-unhealthy', destination }
    }

    return { allowed: true, channel: 'buzz', destination }
  }

  return { allowed: true, channel: 'hermes', destination }
}

export function destinationFromQuickTarget(
  target: string,
  ctx: {
    currentSessionId: string | null
    currentAgentId: string
    agentIdFor?: (storedSessionId: string) => string | undefined
  }
): PantheonDestination | null {
  if (target.startsWith(ROOM_TARGET_PREFIX)) {
    const roomId = target.slice(ROOM_TARGET_PREFIX.length).trim()

    return roomId ? { kind: 'room', roomId } : null
  }

  if (target.startsWith(BOT_TARGET_PREFIX)) {
    const storedSessionId = target.slice(BOT_TARGET_PREFIX.length).trim()

    return storedSessionId
      ? { kind: 'bot', storedSessionId, agentId: ctx.agentIdFor?.(storedSessionId) || ctx.currentAgentId }
      : null
  }

  if (target === QUICK_TARGET_CURRENT) {
    return ctx.currentSessionId
      ? { kind: 'session', storedSessionId: ctx.currentSessionId, agentId: ctx.currentAgentId }
      : { kind: 'session', storedSessionId: QUICK_TARGET_CURRENT, agentId: ctx.currentAgentId }
  }

  if (target === QUICK_TARGET_NEW) {
    return { kind: 'session', storedSessionId: QUICK_TARGET_NEW, agentId: ctx.currentAgentId }
  }

  if (!target) {
    return null
  }

  return {
    kind: 'session',
    storedSessionId: target,
    agentId: ctx.agentIdFor?.(target) || ctx.currentAgentId
  }
}

export function encodeRoomQuickTarget(roomId: string): string {
  return `${ROOM_TARGET_PREFIX}${roomId}`
}

export function encodeBotQuickTarget(storedSessionId: string): string {
  return `${BOT_TARGET_PREFIX}${storedSessionId}`
}

export function encodeQuickTarget(destination: PantheonDestination): string {
  if (destination.kind === 'room') {
    return encodeRoomQuickTarget(destination.roomId)
  }

  if (destination.kind === 'bot') {
    return encodeBotQuickTarget(destination.storedSessionId)
  }

  return destination.storedSessionId
}

export function restoreQuickTarget(
  memory: DestinationMemory,
  offered: { sessions: readonly { id: string }[]; rooms: readonly { id: string }[] }
): string | null {
  const botTarget = (() => {
    const bot = restoreLastBot(memory)

    return bot && offered.sessions.some(session => session.id === bot.storedSessionId) ? bot.storedSessionId : null
  })()

  const roomTarget = (() => {
    const room = restoreLastRoom(memory)

    return room && offered.rooms.some(entry => entry.id === room.roomId) ? encodeQuickTarget(room) : null
  })()

  if (memory.lastUsed === 'room') {
    return roomTarget ?? botTarget
  }

  if (memory.lastUsed === 'bot') {
    return botTarget ?? roomTarget
  }

  return roomTarget ?? botTarget
}

export function hudHandoffForDestination(
  destination: PantheonDestination
):
  | { surface: 'hud'; storedSessionId: string }
  | { surface: 'main-window'; destination: Extract<PantheonDestination, { kind: 'room' }> } {
  if (destination.kind === 'room') {
    return { surface: 'main-window', destination }
  }

  return { surface: 'hud', storedSessionId: destination.storedSessionId }
}

export function canDictate(surface: VoiceSurface): boolean {
  return surface === 'direct-chat' || surface === 'bot-chat' || surface === 'room-composer'
}

export function canAutoSpeakReplies(surface: VoiceSurface, opts: { enabled: boolean; perAgent: boolean }): boolean {
  if (!opts.enabled || !opts.perAgent) {
    return false
  }

  return surface === 'direct-chat' || surface === 'bot-chat'
}

export function showModelPicker(runtime: string): boolean {
  return !/^grok(?:-|$)/i.test(runtime.trim())
}

export function branchStrategy(destination: PantheonDestination): 'session.branch' | 'buzz-thread' {
  return destination.kind === 'room' ? 'buzz-thread' : 'session.branch'
}

export function describeRollbackPreview(ctx: { sessionId: string; worktree: string; machine: string }): {
  sessionId: string
  worktree: string
  machine: string
  summary: string
  requiresApproval: true
} {
  return {
    sessionId: ctx.sessionId,
    worktree: ctx.worktree,
    machine: ctx.machine,
    summary: `Restore ${ctx.sessionId} on ${ctx.worktree} @ ${ctx.machine}`,
    requiresApproval: true
  }
}
