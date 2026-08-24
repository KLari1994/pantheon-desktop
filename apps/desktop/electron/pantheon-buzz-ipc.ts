import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { ipcMain as defaultIpcMain, type IpcMain } from 'electron'

import {
  createPantheonBuzzProcess,
  isPrivateKeyShaped,
  type PantheonBuzzProcess,
  resolveBuzzBridgeBinary,
  sanitizeBridgeEnv
} from './pantheon-buzz-process'

export { isPrivateKeyShaped, sanitizeBridgeEnv } from './pantheon-buzz-process'
export { RESTART_BACKOFF_MS } from './pantheon-buzz-process'

export const MIN_MESSAGE_LIMIT = 1
export const MAX_MESSAGE_LIMIT = 200

export const PANTHEON_BUZZ_IPC = {
  status: 'pantheon-buzz:status',
  listRooms: 'pantheon-buzz:rooms.list',
  getRoom: 'pantheon-buzz:rooms.get',
  getMessages: 'pantheon-buzz:messages.window',
  sendMessage: 'pantheon-buzz:messages.send',
  addReaction: 'pantheon-buzz:reactions.add',
  removeReaction: 'pantheon-buzz:reactions.remove',
  addMember: 'pantheon-buzz:members.add',
  removeMember: 'pantheon-buzz:members.remove',
  startSubscription: 'pantheon-buzz:subscribe.start',
  stopSubscription: 'pantheon-buzz:subscribe.stop',
  workspaceManifest: 'pantheon-buzz:workspace.manifest',
  updateRoomMembership: 'pantheon-buzz:workspace.updateRoomMembership'
} as const

export const MAX_CONTENT_BYTES = 64 * 1024
export const MAX_EMOJI_CHARS = 64
export const MAX_BOUNDED_ARRAY = 32

export function validateContent(content: unknown): string {
  if (typeof content !== 'string' || content.length > MAX_CONTENT_BYTES) {
    throw new Error('invalid_content')
  }
  return content
}

export function validateEmoji(emoji: unknown): string {
  if (typeof emoji !== 'string' || emoji.length === 0 || [...emoji].length > MAX_EMOJI_CHARS) {
    throw new Error('invalid_emoji')
  }
  return emoji
}

export function validateBoundedArray<T>(value: unknown, name: string): T[] {
  if (value === undefined) {
    return []
  }
  if (!Array.isArray(value) || value.length > MAX_BOUNDED_ARRAY) {
    throw new Error(`invalid_${name}`)
  }
  return value as T[]
}

export function validateMessageLimit(limit: unknown): number {
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < MIN_MESSAGE_LIMIT || limit > MAX_MESSAGE_LIMIT) {
    throw new Error('invalid_limit')
  }
  return limit
}

export function validateRoomId(roomId: unknown): string {
  if (typeof roomId !== 'string' || roomId.length === 0 || roomId.length > 128) {
    throw new Error('invalid_room_id')
  }
  return roomId
}

export function parseBuzzRelayUrlFromWorkspaceConfig(text: string): string | undefined {
  try {
    const parsed = JSON.parse(text) as {
      buzz?: { relayUrl?: unknown; relay_url?: unknown }
      relayUrl?: unknown
    }
    const candidates = [parsed.buzz?.relayUrl, parsed.buzz?.relay_url, parsed.relayUrl]
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && /^https?:\/\//i.test(candidate) && !isPrivateKeyShaped(candidate)) {
        return candidate
      }
    }
  } catch {
    /* workspace.yaml / config.yaml */
  }
  const match = text.match(/(?:^|\n)\s*relay_url:\s*['"]?(https?:\/\/[^\s#'"]+)/i)
  const url = match?.[1]
  if (url && !isPrivateKeyShaped(url)) {
    return url
  }
  return undefined
}

export function resolveBuzzRelayUrl(options?: {
  homeDir?: string
  readFile?: (filePath: string) => string | undefined
}): string | undefined {
  const home = options?.homeDir
  if (!home) {
    return undefined
  }
  const read =
    options?.readFile ??
    ((filePath: string) => {
      try {
        if (!existsSync(filePath)) {
          return undefined
        }
        return readFileSync(filePath, 'utf8')
      } catch {
        return undefined
      }
    })
  const candidates = [path.join(home, 'pantheon', 'workspace.json'), path.join(home, 'config.yaml')]
  for (const filePath of candidates) {
    const text = read(filePath)
    if (!text) {
      continue
    }
    const url = parseBuzzRelayUrlFromWorkspaceConfig(text)
    if (url) {
      return url
    }
  }
  return undefined
}

export interface PantheonBuzzIpcDeps {
  ipcMain?: Pick<IpcMain, 'handle' | 'removeHandler'>
  createProcess?: () => PantheonBuzzProcess
  homeDir?: string
  broadcast?: (channel: string, payload: unknown) => void
}

export interface PantheonBuzzIpcHandle {
  dispose(): void
}

let active: PantheonBuzzIpcHandle | null = null

export function registerPantheonBuzzIpc(deps?: PantheonBuzzIpcDeps): PantheonBuzzIpcHandle {
  const ipcMain = deps?.ipcMain ?? defaultIpcMain
  const processHandle = (deps?.createProcess ??
    (() =>
      createPantheonBuzzProcess({
        binaryPath: resolveBuzzBridgeBinary(),
        relayUrl: resolveBuzzRelayUrl({ homeDir: deps?.homeDir })
      })))()

  ipcMain.handle(PANTHEON_BUZZ_IPC.status, async () => processHandle.request('status'))
  ipcMain.handle(PANTHEON_BUZZ_IPC.listRooms, async (_event, input?: { cursor?: string }) =>
    processHandle.request('rooms.list', input ?? {})
  )
  ipcMain.handle(PANTHEON_BUZZ_IPC.getRoom, async (_event, input: { roomId: string }) =>
    processHandle.request('rooms.get', { roomId: validateRoomId(input?.roomId) })
  )
  ipcMain.handle(PANTHEON_BUZZ_IPC.getMessages, async (_event, input: { roomId: string; before?: string; limit: number }) =>
    processHandle.request('messages.window', {
      roomId: validateRoomId(input?.roomId),
      before: input?.before,
      limit: validateMessageLimit(input?.limit)
    })
  )
  ipcMain.handle(PANTHEON_BUZZ_IPC.sendMessage, async (_event, input: {
    roomId: string
    content: string
    threadRootId?: string
    mentions?: string[]
    attachments?: unknown[]
  }) =>
    processHandle.request('messages.send', {
      roomId: validateRoomId(input?.roomId),
      content: validateContent(input?.content),
      threadRootId: input?.threadRootId,
      mentions: validateBoundedArray<string>(input?.mentions, 'mentions'),
      attachments: validateBoundedArray(input?.attachments, 'attachments')
    })
  )
  ipcMain.handle(PANTHEON_BUZZ_IPC.addReaction, async (_event, input: { roomId: string; targetEventId: string; emoji: string }) =>
    processHandle.request('reactions.add', {
      roomId: validateRoomId(input?.roomId),
      targetEventId: validateRoomId(input?.targetEventId),
      emoji: validateEmoji(input?.emoji)
    })
  )
  ipcMain.handle(PANTHEON_BUZZ_IPC.removeReaction, async (_event, input: { roomId: string; reactionEventId: string }) =>
    processHandle.request('reactions.remove', {
      roomId: validateRoomId(input?.roomId),
      reactionEventId: validateRoomId(input?.reactionEventId)
    })
  )
  ipcMain.handle(PANTHEON_BUZZ_IPC.addMember, async (_event, input: { roomId: string; pubkey: string; role?: string }) =>
    processHandle.request('members.add', {
      roomId: validateRoomId(input?.roomId),
      pubkey: validateRoomId(input?.pubkey),
      role: input?.role
    })
  )
  ipcMain.handle(PANTHEON_BUZZ_IPC.removeMember, async (_event, input: { roomId: string; pubkey: string }) =>
    processHandle.request('members.remove', {
      roomId: validateRoomId(input?.roomId),
      pubkey: validateRoomId(input?.pubkey)
    })
  )
  ipcMain.handle(PANTHEON_BUZZ_IPC.startSubscription, async (_event, input: { roomIds: string[] }) => {
    const roomIds = validateBoundedArray<string>(input?.roomIds, 'roomIds').map(validateRoomId)
    return processHandle.request('subscribe.start', { roomIds })
  })
  ipcMain.handle(PANTHEON_BUZZ_IPC.stopSubscription, async () => processHandle.request('subscribe.stop', {}))
  ipcMain.handle(PANTHEON_BUZZ_IPC.workspaceManifest, async () => readWorkspaceManifest(deps?.homeDir))
  ipcMain.handle(PANTHEON_BUZZ_IPC.updateRoomMembership, async (_event, input: {
    roomId: string
    kind?: string
    name?: string
    memberAgentIds?: string[]
  }) => updateWorkspaceRoomMembership(deps?.homeDir, input))

  const stopEvents = processHandle.onEvent?.(frame => {
    if (frameContainsPrivateKey(frame)) {
      return
    }
    deps?.broadcast?.('pantheon-buzz:event', frame)
  })

  const handle = {
    dispose() {
      ipcMain.removeHandler(PANTHEON_BUZZ_IPC.status)
      ipcMain.removeHandler(PANTHEON_BUZZ_IPC.listRooms)
      ipcMain.removeHandler(PANTHEON_BUZZ_IPC.getRoom)
      ipcMain.removeHandler(PANTHEON_BUZZ_IPC.getMessages)
      ipcMain.removeHandler(PANTHEON_BUZZ_IPC.sendMessage)
      ipcMain.removeHandler(PANTHEON_BUZZ_IPC.addReaction)
      ipcMain.removeHandler(PANTHEON_BUZZ_IPC.removeReaction)
      ipcMain.removeHandler(PANTHEON_BUZZ_IPC.addMember)
      ipcMain.removeHandler(PANTHEON_BUZZ_IPC.removeMember)
      ipcMain.removeHandler(PANTHEON_BUZZ_IPC.startSubscription)
      ipcMain.removeHandler(PANTHEON_BUZZ_IPC.stopSubscription)
      ipcMain.removeHandler(PANTHEON_BUZZ_IPC.workspaceManifest)
      ipcMain.removeHandler(PANTHEON_BUZZ_IPC.updateRoomMembership)
      stopEvents?.()
      processHandle.dispose()
      if (active === handle) {
        active = null
      }
    }
  }
  active = handle
  return handle
}

function frameContainsPrivateKey(value: unknown): boolean {
  if (typeof value === 'string') {
    return isPrivateKeyShaped(value)
  }
  if (Array.isArray(value)) {
    return value.some(frameContainsPrivateKey)
  }
  if (value && typeof value === 'object') {
    return Object.values(value).some(frameContainsPrivateKey)
  }
  return false
}

export function disposePantheonBuzzIpc(): void {
  active?.dispose()
  active = null
}

export function workspaceManifestPath(homeDir?: string): string | undefined {
  if (!homeDir) {
    return undefined
  }
  return path.join(homeDir, 'pantheon', 'workspace.json')
}

export function readWorkspaceManifest(homeDir?: string): Record<string, unknown> {
  const filePath = workspaceManifestPath(homeDir)
  if (!filePath || !existsSync(filePath)) {
    return { version: 1 }
  }
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>
    return parsed && typeof parsed === 'object' ? parsed : { version: 1 }
  } catch {
    return { version: 1 }
  }
}

export function updateWorkspaceRoomMembership(
  homeDir: string | undefined,
  input: { roomId: string; kind?: string; name?: string; memberAgentIds?: string[] }
): Record<string, unknown> {
  const filePath = workspaceManifestPath(homeDir)
  if (!filePath) {
    throw new Error('missing_home')
  }
  const roomId = validateRoomId(input.roomId)
  const memberAgentIds = validateBoundedArray<string>(input.memberAgentIds, 'memberAgentIds')
  const current = readWorkspaceManifest(homeDir)
  const rooms = Array.isArray(current.rooms) ? [...(current.rooms as Record<string, unknown>[])] : []
  const index = rooms.findIndex(room => room && room.id === roomId)
  const nextRoom = {
    ...(index >= 0 ? rooms[index] : {}),
    id: roomId,
    kind: input.kind ?? (index >= 0 ? rooms[index]?.kind : 'office'),
    name: input.name ?? (index >= 0 ? rooms[index]?.name : roomId),
    memberAgentIds
  }
  if (index >= 0) {
    rooms[index] = nextRoom
  } else {
    rooms.push(nextRoom)
  }
  const next = { ...current, version: current.version ?? 1, rooms }
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`)
  return next
}
