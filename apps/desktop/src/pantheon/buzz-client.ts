export interface BuzzMember {
  pubkey: string
  name?: string
  role?: string
}

export interface BuzzAttachment {
  url: string
  mimeType: string
  name?: string
  sizeBytes?: number
}

export interface BuzzRoom {
  id: string
  name: string
  members: BuzzMember[]
  kind?: 'office' | 'project' | 'pr' | 'temporary' | string
  about?: string
  visibility?: string
  ttlSeconds?: number
  expiresAt?: number
  selfRole?: string
}

export interface BuzzRoomPage {
  rooms: BuzzRoom[]
  nextCursor?: string | null
}

export interface BuzzMessage {
  id: string
  roomId: string
  content: string
  createdAt: number
  author: string
  threadRootId?: string
  replyToId?: string
  attachments?: BuzzAttachment[]
  mentions?: string[]
}

export interface BuzzReaction {
  id: string
  targetEventId: string
  emoji: string
  author: string
}

export interface BuzzMessageWindow {
  messages: BuzzMessage[]
  reactions?: BuzzReaction[]
}

export interface BuzzStatus {
  state: 'closed' | 'connecting' | 'open' | string
  error?: string
  compatibilityCommit?: string
  relayUrl?: string
  hasCredential?: boolean
  pubkey?: string
}

export type BuzzBridgeEvent =
  | { type: 'relay.status'; state: 'closed' | 'connecting' | 'open'; error?: string }
  | { type: 'room.event'; roomId?: string; room_id?: string; event: unknown }

export interface WorkspaceAgent {
  id: string
  connectionId: string
  profile: string
  machineId?: string
  residency?: string
  pubkey?: string
}

export interface WorkspaceRoom {
  id: string
  kind?: string
  name?: string
  memberAgentIds?: string[]
}

export interface WorkspaceManifest {
  version: number
  buzz?: { relayUrl?: string }
  agents?: WorkspaceAgent[]
  rooms?: WorkspaceRoom[]
  [key: string]: unknown
}

/** PAN-3 durable session binder pin. Room-session resume is owned by buzz-acp's
 *  SQLite session store at this commit — never by a renderer cache (see PAN-4). */
export const BUZZ_ACP_PIN = {
  repo: 'https://github.com/KLari1994/buzz',
  branch: 'pantheon',
  commit: 'c11e582ec17293f0036f4363e1b26d2fdde86c71',
  upstreamPr: 'https://github.com/block/buzz/pull/6682'
} as const

export interface PantheonBuzzApi {
  status(): Promise<BuzzStatus>
  listRooms(input?: { cursor?: string }): Promise<BuzzRoomPage>
  getRoom(input: { roomId: string }): Promise<BuzzRoom>
  getMessages(input: { roomId: string; before?: string; limit: number }): Promise<BuzzMessageWindow>
  sendMessage(input: {
    roomId: string
    content: string
    threadRootId?: string
    mentions?: string[]
    attachments?: BuzzAttachment[]
  }): Promise<{ eventId: string; createdAt: number }>
  addReaction(input: { roomId: string; targetEventId: string; emoji: string }): Promise<{ eventId: string }>
  removeReaction(input: { roomId: string; reactionEventId: string }): Promise<{ eventId: string }>
  inviteMember(input: { roomId: string; pubkey: string; role?: string }): Promise<{ eventId: string }>
  removeMember(input: { roomId: string; pubkey: string }): Promise<{ eventId: string }>
  startSubscription(input: { roomIds: string[] }): Promise<{ started?: boolean }>
  stopSubscription(): Promise<{ stopped?: boolean }>
  getWorkspaceManifest(): Promise<WorkspaceManifest>
  updateRoomMembership(input: {
    roomId: string
    kind?: string
    name?: string
    memberAgentIds?: string[]
  }): Promise<WorkspaceManifest>
  subscribe(callback: (event: BuzzBridgeEvent) => void): () => void
}

const MIN_LIMIT = 1
const MAX_LIMIT = 200
const MAX_CONTENT = 64 * 1024
const MAX_EMOJI = 64
const MAX_ARRAY = 32

function rejectIf(condition: boolean, code: string): void {
  if (condition) {
    throw new Error(code)
  }
}

export function createBuzzClient(api: PantheonBuzzApi): PantheonBuzzApi {
  return {
    status: () => api.status(),
    listRooms: input => api.listRooms(input),
    getRoom: input => api.getRoom(input),
    getMessages: input => {
      if (!Number.isInteger(input.limit) || input.limit < MIN_LIMIT || input.limit > MAX_LIMIT) {
        return Promise.reject(new Error('invalid_limit'))
      }

      return api.getMessages(input)
    },
    sendMessage: input => {
      try {
        rejectIf(typeof input.content !== 'string' || input.content.length > MAX_CONTENT, 'invalid_content')
        rejectIf((input.mentions?.length ?? 0) > MAX_ARRAY, 'invalid_mentions')
        rejectIf((input.attachments?.length ?? 0) > MAX_ARRAY, 'invalid_attachments')
      } catch (error) {
        return Promise.reject(error)
      }

      return api.sendMessage(input)
    },
    addReaction: input => {
      if (!input.emoji || [...input.emoji].length > MAX_EMOJI) {
        return Promise.reject(new Error('invalid_emoji'))
      }

      return api.addReaction(input)
    },
    removeReaction: input => api.removeReaction(input),
    inviteMember: input => api.inviteMember(input),
    removeMember: input => api.removeMember(input),
    startSubscription: input => api.startSubscription(input),
    stopSubscription: () => api.stopSubscription(),
    getWorkspaceManifest: () => api.getWorkspaceManifest(),
    updateRoomMembership: input => api.updateRoomMembership(input),
    subscribe: callback => api.subscribe(callback)
  }
}

export function desktopBuzzClient(): PantheonBuzzApi {
  const bridge = typeof window === 'undefined' ? undefined : window.pantheonBuzz

  if (!bridge) {
    throw new Error('Pantheon Buzz bridge is unavailable')
  }

  return createBuzzClient(bridge)
}
