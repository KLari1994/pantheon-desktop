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

export interface PantheonBuzzIpcDeps {
  ipcMain: Pick<IpcMain, 'handle' | 'removeHandler'>
  createProcess?: () => PantheonBuzzProcess
}

export interface PantheonBuzzIpcHandle {
  dispose(): void
}

let active: PantheonBuzzIpcHandle | null = null

export function registerPantheonBuzzIpc(deps?: PantheonBuzzIpcDeps): PantheonBuzzIpcHandle {
  const ipcMain = deps?.ipcMain ?? defaultIpcMain
  const processHandle = (deps?.createProcess ?? (() => createPantheonBuzzProcess({
    binaryPath: resolveBuzzBridgeBinary()
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
