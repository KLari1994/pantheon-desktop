import type { BuzzMessage, BuzzReaction, BuzzRoom } from '@/pantheon/buzz-client'

import { ROOMS_READ_WATERMARKS_KEY, type OutgoingState, type RoomKind, type RoomMessage, type RoomSummary } from './types'

function atom<T>(initial: T) {
  let value = initial
  const listeners = new Set<(next: T) => void>()
  return {
    get: () => value,
    set: (next: T) => {
      value = next
      for (const listener of listeners) listener(next)
    },
    listen: (listener: (next: T) => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}

export interface RoomLiveEvent {
  id?: string
  kind?: number
  content?: string
  created_at?: number
  createdAt?: number
  pubkey?: string
  author?: string
  threadRootId?: string
  replyToId?: string
  tags?: Array<Array<string | number> | string>
}

function eventTags(event: RoomLiveEvent, key: string): string[] {
  return (event.tags || []).flatMap(tag => {
    if (!Array.isArray(tag) || tag[0] !== key) return []
    return typeof tag[1] === 'string' ? [tag[1]] : []
  })
}

function eventTag(event: RoomLiveEvent, key: string): string | undefined {
  return eventTags(event, key)[0]
}

export interface RoomWindowState {
  messages: RoomMessage[]
  reactions: BuzzReaction[]
}

export class RoomsStore {
  readonly $rooms = atom<RoomSummary[]>([])
  readonly $windows = atom<Record<string, RoomWindowState>>({})
  readonly $selectedRoomId = atom<string | null>(null)
  readonly storageKeysUsed = new Set<string>()

  constructor(
    private readonly storage?: { get?: (key: string) => unknown; set?: (key: string, value: unknown) => void },
    private readonly owner?: { pubkey?: string; name?: string }
  ) {}

  mergeRooms(rooms: BuzzRoom[]): RoomSummary[] {
    const previous = new Map(this.$rooms.get().map(room => [room.id, room]))
    const next = rooms.map(room => this.toSummary(room, previous.get(room.id)))
    this.$rooms.set(next)
    return next
  }

  upsertRoom(room: BuzzRoom): RoomSummary {
    const previous = new Map(this.$rooms.get().map(row => [row.id, row]))
    const summary = this.toSummary(room, previous.get(room.id))
    const current = this.$rooms.get()
    const index = current.findIndex(row => row.id === room.id)
    const next = index === -1 ? [...current, summary] : current.map((row, i) => (i === index ? summary : row))
    this.$rooms.set(next)
    return summary
  }

  applyWindow(roomId: string, messages: BuzzMessage[], reactions: BuzzReaction[] = []): RoomWindowState {
    const current = this.$windows.get()[roomId] || { messages: [], reactions: [] }
    const pending = current.messages.filter(message => message.outgoing === 'pending')
    const byId = new Map<string, RoomMessage>()
    for (const message of [...current.messages.filter(row => row.outgoing !== 'pending'), ...messages.map(toRoomMessage)]) {
      byId.set(message.id, message)
    }
    const merged = [...byId.values(), ...pending].sort((a, b) => a.createdAt - b.createdAt)
    const next = { ...this.$windows.get(), [roomId]: { messages: merged, reactions } }
    this.$windows.set(next)
    return next[roomId]
  }

  queueOptimistic(
    roomId: string,
    content: string,
    nonce: string,
    extras?: Pick<RoomMessage, 'mentions' | 'threadRootId' | 'replyToId' | 'attachments'>
  ): RoomMessage {
    const row: RoomMessage = {
      id: `pending:${nonce}`,
      roomId,
      content,
      createdAt: Date.now(),
      author: 'you',
      outgoing: 'pending',
      nonce,
      mentions: extras?.mentions,
      threadRootId: extras?.threadRootId,
      replyToId: extras?.replyToId,
      attachments: extras?.attachments
    }
    const window = this.$windows.get()[roomId] || { messages: [], reactions: [] }
    this.$windows.set({
      ...this.$windows.get(),
      [roomId]: { ...window, messages: [...window.messages, row] }
    })
    return row
  }

  ackOptimistic(nonce: string, eventId: string): void {
    this.patchOutgoing(nonce, { id: eventId, outgoing: 'sent' })
  }

  failOptimistic(nonce: string): void {
    this.patchOutgoing(nonce, { outgoing: 'failed' })
  }

  removeOptimistic(nonce: string): void {
    const next: Record<string, RoomWindowState> = {}
    for (const [roomId, window] of Object.entries(this.$windows.get())) {
      next[roomId] = { ...window, messages: window.messages.filter(message => message.nonce !== nonce) }
    }
    this.$windows.set(next)
  }

  ingestEvent(roomId: string, event: RoomLiveEvent): 'refresh-room' | void {
    if (!event.id && event.kind !== 5 && event.kind !== 9000 && event.kind !== 9001 && event.kind !== 39000 && event.kind !== 39002) {
      return
    }
    const kind = event.kind ?? 9
    const window = this.$windows.get()[roomId] || { messages: [], reactions: [] }
    if (kind === 7) {
      if (!event.id || window.reactions.some(reaction => reaction.id === event.id)) return
      this.$windows.set({
        ...this.$windows.get(),
        [roomId]: {
          ...window,
          reactions: [
            ...window.reactions,
            {
              id: event.id,
              targetEventId: eventTag(event, 'e') || '',
              emoji: event.content || '',
              author: event.pubkey || event.author || 'unknown'
            }
          ]
        }
      })
      return
    }
    if (kind === 5) {
      const deleted = new Set(eventTags(event, 'e'))
      if (deleted.size === 0) return
      this.$windows.set({
        ...this.$windows.get(),
        [roomId]: {
          messages: window.messages.filter(message => !deleted.has(message.id)),
          reactions: window.reactions.filter(reaction => !deleted.has(reaction.id))
        }
      })
      return
    }
    if (kind === 9000 || kind === 9001 || kind === 39000 || kind === 39002) {
      return 'refresh-room'
    }
    if (!event.id || window.messages.some(message => message.id === event.id)) return
    this.$windows.set({
      ...this.$windows.get(),
      [roomId]: {
        ...window,
        messages: [
          ...window.messages,
          {
            id: event.id,
            roomId,
            content: event.content || '',
            createdAt: event.created_at || event.createdAt || Date.now(),
            author: event.pubkey || event.author || 'unknown',
            threadRootId: event.threadRootId || eventTag(event, 'E') || eventTag(event, 'e'),
            replyToId: event.replyToId || eventTag(event, 'e'),
            mentions: eventTags(event, 'p'),
            attachments: eventAttachments(event)
          }
        ]
      }
    })
  }

  markRead(roomId: string, createdAt: number): void {
    this.storageKeysUsed.add(ROOMS_READ_WATERMARKS_KEY)
    const current = this.readWatermarks()
    current[roomId] = createdAt
    this.storage?.set?.(ROOMS_READ_WATERMARKS_KEY, current)
    this.$rooms.set(this.$rooms.get().map(room => (room.id === roomId ? { ...room, unread: false } : room)))
  }

  reconnectKeepPending(): void {
    const windows = this.$windows.get()
    const next: Record<string, RoomWindowState> = {}
    for (const [roomId, window] of Object.entries(windows)) {
      next[roomId] = {
        ...window,
        messages: window.messages.map(message =>
          message.outgoing === 'pending' ? message : message
        )
      }
    }
    this.$windows.set(next)
  }

  usedBindingCache(): boolean {
    return [...this.storageKeysUsed].some(key => /session|binding/i.test(key))
  }

  private patchOutgoing(nonce: string, patch: Partial<RoomMessage>): void {
    const next: Record<string, RoomWindowState> = {}
    for (const [roomId, window] of Object.entries(this.$windows.get())) {
      next[roomId] = {
        ...window,
        messages: window.messages.map(message => (message.nonce === nonce ? { ...message, ...patch } : message))
      }
    }
    this.$windows.set(next)
  }

  private readWatermarks(): Record<string, number> {
    this.storageKeysUsed.add(ROOMS_READ_WATERMARKS_KEY)
    const raw = this.storage?.get?.(ROOMS_READ_WATERMARKS_KEY)
    return raw && typeof raw === 'object' ? { ...(raw as Record<string, number>) } : {}
  }

  private isUnread(roomId: string, createdAt?: number): boolean {
    if (!createdAt) return false
    const marks = this.readWatermarks()
    return createdAt > (marks[roomId] || 0)
  }

  private toSummary(room: BuzzRoom, prior?: RoomSummary): RoomSummary {
    const latest = this.$windows.get()[room.id]?.messages.at(-1)
    return {
      id: room.id,
      kind: (room.kind as RoomKind) || prior?.kind || 'office',
      name: room.name,
      memberAgentIds: room.members.map(member => member.pubkey),
      latestPreview: latest?.content || prior?.latestPreview || '',
      unread: this.isUnread(room.id, latest?.createdAt),
      needsYou: this.deriveNeedsYou(latest),
      expiresAt: room.expiresAt ? String(room.expiresAt) : prior?.expiresAt
    }
  }

  private deriveNeedsYou(message?: RoomMessage): boolean {
    if (!message || !this.owner) return false
    const haystack = message.content.toLowerCase()
    const mentions = message.mentions || []
    return Boolean(
      (this.owner.pubkey && mentions.some(mention => mention.toLowerCase() === this.owner?.pubkey?.toLowerCase())) ||
        (this.owner.name && haystack.includes(`@${this.owner.name.toLowerCase()}`)) ||
        (this.owner.pubkey && haystack.includes(this.owner.pubkey.toLowerCase()))
    )
  }
}

function eventAttachments(event: RoomLiveEvent): RoomMessage['attachments'] {
  const attachments = (event.tags || []).flatMap(tag => {
    if (!Array.isArray(tag) || tag[0] !== 'imeta') return []
    let url: string | undefined
    let mimeType = 'application/octet-stream'
    let name: string | undefined
    let sizeBytes: number | undefined
    for (const part of tag.slice(1)) {
      if (typeof part !== 'string') continue
      if (part.startsWith('url ')) url = part.slice(4)
      else if (part.startsWith('m ')) mimeType = part.slice(2)
      else if (part.startsWith('alt ')) name = part.slice(4)
      else if (part.startsWith('size ')) {
        const parsed = Number(part.slice(5))
        if (Number.isFinite(parsed)) sizeBytes = parsed
      }
    }
    return url ? [{ url, mimeType, name, sizeBytes }] : []
  })
  return attachments.length ? attachments : undefined
}

function toRoomMessage(message: BuzzMessage): RoomMessage {
  return {
    id: message.id,
    roomId: message.roomId,
    content: message.content,
    createdAt: message.createdAt,
    author: message.author,
    threadRootId: message.threadRootId,
    replyToId: message.replyToId,
    attachments: message.attachments,
    mentions: message.mentions
  }
}

export type { OutgoingState }
