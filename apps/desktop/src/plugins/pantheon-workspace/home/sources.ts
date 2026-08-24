import { host } from '@hermes/plugin-sdk'

import { desktopBuzzClient, type BuzzBridgeEvent } from '@/pantheon/buzz-client'
import { $gateway } from '@/store/gateway'
import { clearApprovalRequest, sessionApprovalRequest, type ApprovalRequest } from '@/store/prompts'
import { $sessions } from '@/store/session'
import { $attentionSessionIds, $stalledSessionIds, $workingSessionIds, requestForOwnedSession } from '@/store/session-states'

import { registeredHref } from './navigation'
import type { HomeEventType, HomeSourceEvent } from './types'
import type { NotificationEvent, NotificationEventType } from '../notifications/policy'
import { ApprovalInbox } from '../needs-you/approval-inbox'
import { projectApproval, type ApprovalOwnerRoute, type ApprovalSource } from '../needs-you/approval-projections'
import type { RoomLiveEvent } from '../rooms/store'

const roomEvents = new Map<string, HomeSourceEvent>()

function identityForSession(sessionId: string): {
  agent: string
  context: string
  machine: string
  owner: ApprovalOwnerRoute
  botId: string
} {
  const session = $sessions.get().find(item => item.id === sessionId)
  const profile = session?.profile || host.state.profile.get() || 'agent'
  const connectionId = session?.connection_id || host.state.connectionId.get() || 'local'
  return {
    agent: profile,
    context: session?.title || `session ${sessionId}`,
    machine: connectionId,
    owner: { connectionId, profile, machine: connectionId },
    botId: profile
  }
}

function approvalSource(request: ApprovalRequest): ApprovalSource {
  return {
    requestId: request.requestId,
    sessionId: request.sessionId,
    command: request.command,
    description: request.description,
    choices: request.choices
  }
}

export function collectAuthoritativeHomeEvents(): HomeSourceEvent[] {
  const events: HomeSourceEvent[] = []
  for (const sessionId of $attentionSessionIds.get()) {
    const request = sessionApprovalRequest(sessionId).get()
    if (!request) continue
    const identity = identityForSession(sessionId)
    events.push({
      type: 'approval',
      sourceKind: 'session',
      sourceId: request.sessionId || sessionId,
      agent: identity.agent,
      context: identity.context,
      machine: identity.machine,
      timestamp: Date.now(),
      requestId: request.requestId,
      title: request.command,
      botId: identity.botId
    })
  }
  for (const sessionId of $workingSessionIds.get()) {
    const identity = identityForSession(sessionId)
    events.push({
      type: 'running',
      sourceKind: 'session',
      sourceId: sessionId,
      agent: identity.agent,
      context: identity.context,
      machine: identity.machine,
      timestamp: Date.now(),
      title: 'Working',
      botId: identity.botId
    })
  }
  for (const sessionId of $stalledSessionIds.get()) {
    const identity = identityForSession(sessionId)
    events.push({
      type: 'stalled',
      sourceKind: 'session',
      sourceId: sessionId,
      agent: identity.agent,
      context: identity.context,
      machine: identity.machine,
      timestamp: Date.now(),
      title: 'Stalled',
      botId: identity.botId
    })
  }
  events.push(...roomEvents.values())
  return events
}

export function collectApprovalInboxRows(): Array<{ request: ApprovalSource; card: ReturnType<typeof projectApproval> }> {
  const rows = []
  for (const sessionId of $attentionSessionIds.get()) {
    const request = sessionApprovalRequest(sessionId).get()
    if (!request) continue
    const identity = identityForSession(sessionId)
    rows.push({
      request: approvalSource(request),
      card: projectApproval(approvalSource(request), identity)
    })
  }
  return rows
}

export function toNotificationEvent(event: HomeSourceEvent): NotificationEvent | null {
  const type = notificationType(event.type)
  if (!type) return null
  return {
    id: event.id || `${event.type}:${event.sourceKind}:${event.sourceId}:${event.requestId || ''}`,
    type,
    target: { kind: event.sourceKind, href: registeredHref(event.sourceKind, event.sourceId) },
    botId: event.botId,
    roomId: event.roomId || (event.sourceKind === 'room' ? event.sourceId : undefined)
  }
}

function notificationType(type: HomeEventType): NotificationEventType | null {
  switch (type) {
    case 'approval':
    case 'direct-mention':
    case 'explicit-needs-you':
    case 'long-running-completion':
    case 'review-decision':
    case 'merge-decision':
      return type
    case 'exhausted-retry':
      return 'exhausted-cron-retry'
    default:
      return null
  }
}

export function ingestBuzzBridgeEvent(event: BuzzBridgeEvent): void {
  if (event.type !== 'room.event') return
  const roomId = event.roomId || event.room_id
  const live = event.event && typeof event.event === 'object' ? (event.event as RoomLiveEvent) : null
  if (!roomId || !live) return
  const content = (live.content || '').toLowerCase()
  const explicit = content.includes('needs you') || content.includes('needs-you')
  const mentions = Array.isArray(live.tags)
    ? live.tags.some(tag => Array.isArray(tag) && tag[0] === 'p')
    : false
  if (!explicit && !mentions && !content.includes('@')) return
  const id = live.id || `${roomId}:${live.createdAt || live.created_at || content}`
  roomEvents.set(id, {
    type: explicit ? 'explicit-needs-you' : 'direct-mention',
    sourceKind: 'room',
    sourceId: roomId,
    agent: live.author || live.pubkey || 'room',
    context: roomId,
    machine: host.state.connectionId.get() || 'local',
    timestamp: live.createdAt || live.created_at || Date.now(),
    title: live.content || (explicit ? 'Needs you' : 'Mention'),
    id,
    botId: live.author || live.pubkey,
    roomId
  })
}

export function subscribeAuthoritativeHomeSources(onChange: (events: HomeSourceEvent[]) => void): () => void {
  const emit = () => onChange(collectAuthoritativeHomeEvents())
  const unsubs = [
    $attentionSessionIds.listen(emit),
    $workingSessionIds.listen(emit),
    $stalledSessionIds.listen(emit),
    $sessions.listen(emit)
  ]
  let unsubBuzz: () => void = () => undefined
  try {
    unsubBuzz = desktopBuzzClient().subscribe(event => {
      ingestBuzzBridgeEvent(event)
      emit()
    })
  } catch {
    /* sidecar absent in tests and headless */
  }
  return () => {
    for (const unsub of unsubs) unsub()
    unsubBuzz()
  }
}

export function createPluginApprovalInbox(): ApprovalInbox {
  return new ApprovalInbox({
    requestOwned: (sessionId, method, params) => {
      const gateway = $gateway.get()
      if (!gateway) return Promise.reject(new Error('no gateway'))
      return requestForOwnedSession(sessionId, gateway.request.bind(gateway) as typeof gateway.request, method, params)
    },
    clear: (sessionId, requestId) => {
      clearApprovalRequest(sessionId, requestId)
    }
  })
}
