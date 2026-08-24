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
    const next = rooms.map(room => {
      const prior = previous.get(room.id)
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
      } satisfies RoomSummary
    })
    this.$rooms.set(next)
    return next
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

  queueOptimistic(roomId: string, content: string, nonce: string): RoomMessage {
    const row: RoomMessage = {
      id: `pending:${nonce}`,
      roomId,
      content,
      createdAt: Date.now(),
      author: 'you',
      outgoing: 'pending',
      nonce
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

  ingestEvent(roomId: string, event: { id?: string; content?: string; created_at?: number; pubkey?: string }): void {
    if (!event.id) return
    const window = this.$windows.get()[roomId] || { messages: [], reactions: [] }
    if (window.messages.some(message => message.id === event.id)) return
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
            createdAt: event.created_at || Date.now(),
            author: event.pubkey || 'unknown'
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
