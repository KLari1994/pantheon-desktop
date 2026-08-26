import {
  $attentionSessionIds,
  $cronJobs,
  $gateway,
  $sessions,
  $sessionStates,
  $stalledSessionIds,
  $workingSessionIds,
  type ApprovalRequest,
  type BuzzBridgeEvent,
  clearApprovalRequest,
  desktopBuzzClient,
  host,
  lineageAliases,
  type PantheonBuzzApi,
  requestForOwnedSession,
  sessionApprovalRequest
} from '@hermes/plugin-sdk'

import { registeredHref } from './home/navigation'
import type { HomeEventType, HomeSourceEvent } from './home/types'
import { ApprovalInbox } from './needs-you/approval-inbox'
import { type ApprovalOwnerRoute, type ApprovalSource, projectApproval } from './needs-you/approval-projections'
import type { NotificationEvent, NotificationEventType } from './notifications/policy'
import type { RoomLiveEvent } from './rooms/store'

const MEMBERSHIP_KINDS = new Set([9000, 9001, 39000, 39002])

const TYPED_EVENTS = new Set<HomeEventType>([
  'review-decision',
  'merge-decision',
  'exhausted-retry',
  'failed',
  'long-running-completion',
  'explicit-needs-you',
  'direct-mention'
])

const roomEvents = new Map<string, HomeSourceEvent>()
let knownRooms: Array<{ id: string; memberNames: string[]; members: Array<{ pubkey?: string; name?: string }> }> = []
let homeViewer: { pubkey?: string; name?: string } = {}

export interface HomeSourceBuzz {
  subscribe: PantheonBuzzApi['subscribe']
  startSubscription: PantheonBuzzApi['startSubscription']
  listRooms: PantheonBuzzApi['listRooms']
  status: PantheonBuzzApi['status']
  getRoom?: PantheonBuzzApi['getRoom']
  getWorkspaceManifest?: PantheonBuzzApi['getWorkspaceManifest']
}

export function resetHomeSourceState(seed?: {
  rooms?: Array<{ id: string; memberNames: string[] }>
  viewer?: { pubkey?: string; name?: string }
}): void {
  roomEvents.clear()
  knownRooms = seed?.rooms
    ? seed.rooms.map(room => ({
        id: room.id,
        memberNames: [...room.memberNames],
        members: room.memberNames.map(name => ({ name }))
      }))
    : []
  homeViewer = seed?.viewer ? { ...seed.viewer } : {}
}

function memberLabels(members: Array<{ pubkey?: string; name?: string } | string> | undefined): string[] {
  return (members || []).flatMap(member => {
    if (typeof member === 'string') {
      return member ? [member] : []
    }

    return [member.pubkey, member.name].filter((value): value is string => Boolean(value))
  })
}

function displayNameForPubkey(pubkey: string | undefined): string | undefined {
  if (!pubkey) {
    return undefined
  }
  const needle = pubkey.toLowerCase()

  for (const room of knownRooms) {
    const match = room.members.find(
      member => member.pubkey?.toLowerCase() === needle && member.name && member.name.toLowerCase() !== needle
    )

    if (match?.name) {
      return match.name
    }
  }

  return undefined
}

function roomIdForAgent(botId: string): string | undefined {
  const needle = botId.toLowerCase()
  const matches = knownRooms.filter(room => room.memberNames.some(name => name.toLowerCase() === needle))

  return matches.length === 1 ? matches[0].id : undefined
}

function identityForSession(sessionId: string): {
  agent: string
  context: string
  machine: string
  owner: ApprovalOwnerRoute
  botId: string
  roomId?: string
} {
  const sessions = $sessions.get()

  const runtimeMatch = Object.entries($sessionStates.get()).find(
    ([runtimeId, state]) => runtimeId === sessionId || state.storedSessionId === sessionId
  )

  const storedId = runtimeMatch?.[1].storedSessionId || sessionId

  const session =
    sessions.find(item => item.id === sessionId) ||
    sessions.find(item => item.id === storedId) ||
    sessions.find(item => item._lineage_root_id === storedId || item._lineage_root_id === sessionId)

  const profile = session?.profile || host.state.profile.get() || 'agent'
  const connectionId = session?.connection_id || host.state.connectionId.get() || 'local'

  return {
    agent: profile,
    context: session?.title || `session ${storedId}`,
    machine: connectionId,
    owner: { connectionId, profile, machine: connectionId },
    botId: profile,
    roomId: roomIdForAgent(profile)
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

function resolveApprovalRequest(sessionId: string): ApprovalRequest | null {
  const sessions = $sessions.get()
  const aliases = new Set<string>([sessionId, ...lineageAliases(sessionId, sessions)])

  for (const [runtimeId, state] of Object.entries($sessionStates.get())) {
    const stored = state.storedSessionId ?? runtimeId

    if (aliases.has(runtimeId) || aliases.has(stored) || lineageAliases(stored, sessions).includes(sessionId)) {
      aliases.add(runtimeId)
      aliases.add(stored)

      for (const alias of lineageAliases(stored, sessions)) {
        aliases.add(alias)
      }
    }
  }

  for (const id of aliases) {
    const request = sessionApprovalRequest(id).get()

    if (request) {
      return request
    }
  }

  return null
}

function approvalCandidateIds(): string[] {
  const ids = new Set<string>($attentionSessionIds.get())

  for (const [runtimeId, state] of Object.entries($sessionStates.get())) {
    if (!state?.needsInput) {
      continue
    }
    ids.add(runtimeId)

    if (state.storedSessionId) {
      ids.add(state.storedSessionId)
    }
  }

  return [...ids]
}

export function collectAuthoritativeHomeEvents(): HomeSourceEvent[] {
  const events: HomeSourceEvent[] = []
  const seenApprovals = new Set<string>()

  for (const sessionId of approvalCandidateIds()) {
    const request = resolveApprovalRequest(sessionId)

    if (!request) {
      continue
    }
    const key = request.requestId || `${request.sessionId || sessionId}`

    if (seenApprovals.has(key)) {
      continue
    }
    seenApprovals.add(key)
    const identity = identityForSession(request.sessionId || sessionId)
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
      botId: identity.botId,
      roomId: identity.roomId
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
      botId: identity.botId,
      roomId: identity.roomId
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
      botId: identity.botId,
      roomId: identity.roomId
    })
  }

  for (const job of $cronJobs.get()) {
    const exhausted = job.state === 'exhausted'
    const failed = job.state === 'failed'

    if (!exhausted && !failed) {
      continue
    }
    const connectionId = host.state.connectionId.get() || 'local'
    const profile = host.state.profile.get() || 'agent'
    events.push({
      type: exhausted ? 'exhausted-retry' : 'failed',
      sourceKind: 'cron',
      sourceId: job.id,
      agent: job.name || 'cron',
      context: job.name || job.id,
      machine: connectionId,
      timestamp: Date.now(),
      title: job.last_error || (exhausted ? 'Retries exhausted' : 'Failed'),
      botId: job.name || undefined,
      connectionId,
      profile
    })
  }

  events.push(...roomEvents.values())

  return events
}

export function collectApprovalInboxRows(): Array<{
  request: ApprovalSource
  card: ReturnType<typeof projectApproval>
}> {
  const rows = []
  const seen = new Set<string>()

  for (const sessionId of approvalCandidateIds()) {
    const request = resolveApprovalRequest(sessionId)

    if (!request) {
      continue
    }
    const identity = identityForSession(request.sessionId || sessionId)
    const card = projectApproval(approvalSource(request), identity)

    if (seen.has(card.id)) {
      continue
    }
    seen.add(card.id)
    rows.push({ request: approvalSource(request), card })
  }

  return rows
}

export function toNotificationEvent(event: HomeSourceEvent): NotificationEvent | null {
  if (event.type === 'approval') {
    return null
  }
  const type = notificationType(event.type)

  if (!type) {
    return null
  }

  return {
    id: event.id || `${event.type}:${event.sourceKind}:${event.sourceId}:${event.requestId || ''}`,
    type,
    target: {
      kind: event.sourceKind,
      href: registeredHref(event.sourceKind, event.sourceId, {
        connectionId: event.connectionId,
        profile: event.profile
      })
    },
    botId: event.botId,
    roomId: event.roomId || (event.sourceKind === 'room' ? event.sourceId : undefined)
  }
}

function notificationType(type: HomeEventType): NotificationEventType | null {
  switch (type) {
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

function eventTags(live: RoomLiveEvent, key: string): string[] {
  return (live.tags || []).flatMap(tag => {
    if (!Array.isArray(tag) || tag[0] !== key) {
      return []
    }

    return typeof tag[1] === 'string' ? [tag[1]] : []
  })
}

export function classifyRoomLiveEvent(live: RoomLiveEvent, roomId: string): HomeSourceEvent | null {
  if (live.kind != null && MEMBERSHIP_KINDS.has(live.kind)) {
    return null
  }
  const content = live.content || ''
  const lower = content.toLowerCase()
  const typed = eventTags(live, 't')[0] || eventTags(live, 'type')[0]
  const explicit = lower.includes('needs you') || lower.includes('needs-you')
  const pTags = eventTags(live, 'p')

  const mentioned = Boolean(
    (homeViewer.pubkey && pTags.some(value => value.toLowerCase() === homeViewer.pubkey?.toLowerCase())) ||
    (homeViewer.name && lower.includes(`@${homeViewer.name.toLowerCase()}`)) ||
    (homeViewer.pubkey && lower.includes(homeViewer.pubkey.toLowerCase()))
  )

  let type: HomeEventType | null = null

  if (typed && TYPED_EVENTS.has(typed as HomeEventType)) {
    type = typed as HomeEventType
  } else if (explicit) {
    type = 'explicit-needs-you'
  } else if (mentioned) {
    type = 'direct-mention'
  }

  if (!type) {
    return null
  }
  const id = live.id || `${roomId}:${live.createdAt || live.created_at || content}`
  const sourceKind = type === 'review-decision' ? 'pr' : type === 'merge-decision' ? 'project' : 'room'

  return {
    type,
    sourceKind,
    sourceId: roomId,
    agent: live.author || live.pubkey || 'room',
    context: roomId,
    machine: host.state.connectionId.get() || 'local',
    timestamp: live.createdAt || live.created_at || Date.now(),
    title: live.content || type,
    id,
    botId: live.author || live.pubkey,
    roomId
  }
}

export function ingestBuzzBridgeEvent(event: BuzzBridgeEvent): void {
  if (event.type !== 'room.event') {
    return
  }
  const roomId = event.roomId || event.room_id
  const live = event.event && typeof event.event === 'object' ? (event.event as RoomLiveEvent) : null

  if (!roomId || !live) {
    return
  }
  const next = classifyRoomLiveEvent(live, roomId)

  if (!next || !next.id) {
    return
  }
  roomEvents.set(next.id, next)
}

export function applyHomeSourceSnapshot(
  events: HomeSourceEvent[],
  handlers: {
    replaceInbox: (rows: ReturnType<typeof collectApprovalInboxRows>) => void
    ingestNotification?: (event: NotificationEvent) => void
  }
): void {
  handlers.replaceInbox(collectApprovalInboxRows())

  for (const event of events) {
    const next = toNotificationEvent(event)

    if (next) {
      handlers.ingestNotification?.(next)
    }
  }
}

export function subscribeAuthoritativeHomeSources(
  onChange: (events: HomeSourceEvent[]) => void,
  deps?: { buzz?: HomeSourceBuzz; viewer?: { pubkey?: string; name?: string } }
): () => void {
  const emit = () => onChange(collectAuthoritativeHomeEvents())

  const unsubs = [
    $attentionSessionIds.listen(emit),
    $workingSessionIds.listen(emit),
    $stalledSessionIds.listen(emit),
    $sessions.listen(emit),
    $cronJobs.listen(emit)
  ]

  let unsubBuzz: () => void = () => undefined
  let cancelled = false

  const start = async () => {
    try {
      const client = deps?.buzz || desktopBuzzClient()

      if (deps?.viewer) {
        homeViewer = { ...deps.viewer }
      } else {
        const status = await client.status()

        if (cancelled) {
          return
        }
        homeViewer = { pubkey: status.pubkey }
      }

      unsubBuzz = client.subscribe(event => {
        ingestBuzzBridgeEvent(event)
        emit()
      })
      const page = await client.listRooms()

      if (cancelled) {
        return
      }
      knownRooms = page.rooms.map(room => ({
        id: room.id,
        members: [...room.members],
        memberNames: memberLabels(room.members)
      }))
      const emptyRooms = knownRooms.filter(room => room.memberNames.length === 0)

      if (emptyRooms.length > 0 && client.getRoom) {
        for (const room of emptyRooms) {
          try {
            const detail = await client.getRoom({ roomId: room.id })

            if (cancelled) {
              return
            }
            room.members = [...detail.members]
            room.memberNames = memberLabels(detail.members)
          } catch {
            /* keep empty membership honest */
          }
        }
      }

      const stillEmpty = knownRooms.filter(room => room.memberNames.length === 0)

      if (stillEmpty.length > 0 && client.getWorkspaceManifest) {
        try {
          const manifest = await client.getWorkspaceManifest()

          if (cancelled) {
            return
          }

          for (const room of stillEmpty) {
            const listed = (manifest.rooms || []).find(item => item.id === room.id)
            const ids = listed?.memberAgentIds || []

            if (ids.length === 0) {
              continue
            }
            room.members = ids.map(id => ({ name: id }))
            room.memberNames = memberLabels(ids)
          }
        } catch {
          /* keep empty membership honest */
        }
      }

      if (!deps?.viewer) {
        homeViewer = { pubkey: homeViewer.pubkey, name: displayNameForPubkey(homeViewer.pubkey) }
      }

      const roomIds = page.rooms.map(room => room.id)

      if (roomIds.length > 0) {
        await client.startSubscription({ roomIds })
      }

      if (!cancelled) {
        emit()
      }
    } catch {
      /* sidecar absent in tests and headless */
    }
  }

  void start()

  return () => {
    cancelled = true

    for (const unsub of unsubs) {
      unsub()
    }
    unsubBuzz()
  }
}

export function createPluginApprovalInbox(): ApprovalInbox {
  return new ApprovalInbox({
    requestOwned: (sessionId, method, params) => {
      const gateway = $gateway.get()

      if (!gateway) {
        return Promise.reject(new Error('no gateway'))
      }

      return requestForOwnedSession(sessionId, gateway.request.bind(gateway) as typeof gateway.request, method, params)
    },
    clear: (sessionId, requestId) => {
      clearApprovalRequest(sessionId, requestId)
    }
  })
}
