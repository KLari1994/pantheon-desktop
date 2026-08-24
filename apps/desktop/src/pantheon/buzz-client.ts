export interface BuzzMember {
  pubkey: string
  name?: string
}

export interface BuzzRoom {
  id: string
  name: string
  members: BuzzMember[]
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
}

export interface BuzzMessageWindow {
  messages: BuzzMessage[]
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
  | { type: 'room.event'; roomId: string; event: unknown }

export interface PantheonBuzzApi {
  status(): Promise<BuzzStatus>
  listRooms(input?: { cursor?: string }): Promise<BuzzRoomPage>
  getRoom(input: { roomId: string }): Promise<BuzzRoom>
  getMessages(input: { roomId: string; before?: string; limit: number }): Promise<BuzzMessageWindow>
  subscribe(callback: (event: BuzzBridgeEvent) => void): () => void
}

const MIN_LIMIT = 1
const MAX_LIMIT = 200

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
