export type RoomKind = 'office' | 'project' | 'pr' | 'temporary'

export type OutgoingState = 'pending' | 'sent' | 'failed'

export interface RoomSummary {
  id: string
  kind: RoomKind
  name: string
  memberAgentIds: string[]
  latestPreview: string
  unread: boolean
  needsYou: boolean
  expiresAt?: string
}

export interface RoomMessage {
  id: string
  roomId: string
  content: string
  createdAt: number
  author: string
  threadRootId?: string
  replyToId?: string
  attachments?: { url: string; mimeType: string; name?: string; sizeBytes?: number }[]
  mentions?: string[]
  outgoing?: OutgoingState
  nonce?: string
}

export interface RoomReaction {
  id: string
  targetEventId: string
  emoji: string
  author: string
}

export const ROOMS_READ_WATERMARKS_KEY = 'rooms-read-watermarks-v1'
export const VIRTUALIZE_THRESHOLD = 25
