import { existsSync, readFileSync } from 'node:fs'
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
  getMessages: 'pantheon-buzz:messages.window'
} as const

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

  const handle = {
    dispose() {
      ipcMain.removeHandler(PANTHEON_BUZZ_IPC.status)
      ipcMain.removeHandler(PANTHEON_BUZZ_IPC.listRooms)
      ipcMain.removeHandler(PANTHEON_BUZZ_IPC.getRoom)
      ipcMain.removeHandler(PANTHEON_BUZZ_IPC.getMessages)
      processHandle.dispose()
      if (active === handle) {
        active = null
      }
    }
  }
  active = handle
  return handle
}

export function disposePantheonBuzzIpc(): void {
  active?.dispose()
  active = null
}
