export interface MuteStorage {
  get<T>(key: string, fallback: T): T
  set(key: string, value: unknown): void
  remove(key: string): void
}

export interface MuteScope {
  workspace: string
  connectionId: string
}

export interface MuteTarget {
  kind: 'bot' | 'room'
  id: string
}

export interface MuteState {
  key: string
  mutedBots: string[]
  mutedRooms: string[]
}

const VERSION = 'notification-mutes-v1'

export function mutesKey(scope: MuteScope): string {
  return `${VERSION}:${scope.workspace}:${scope.connectionId}`
}

function empty(key: string): MuteState {
  return { key, mutedBots: [], mutedRooms: [] }
}

export function loadMutes(storage: MuteStorage, scope: MuteScope): MuteState {
  const key = mutesKey(scope)
  const raw = storage.get<unknown>(key, empty(key))
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return empty(key)
  const value = raw as { mutedBots?: unknown; mutedRooms?: unknown }
  return {
    key,
    mutedBots: Array.isArray(value.mutedBots) ? value.mutedBots.filter((id): id is string => typeof id === 'string') : [],
    mutedRooms: Array.isArray(value.mutedRooms) ? value.mutedRooms.filter((id): id is string => typeof id === 'string') : []
  }
}

export function isMuted(state: MuteState, target: MuteTarget): boolean {
  return target.kind === 'bot' ? state.mutedBots.includes(target.id) : state.mutedRooms.includes(target.id)
}

function write(storage: MuteStorage, state: MuteState): MuteState {
  storage.set(state.key, { mutedBots: state.mutedBots, mutedRooms: state.mutedRooms })
  return state
}

export function muteScope(storage: MuteStorage, scope: MuteScope, target: MuteTarget): MuteState {
  const current = loadMutes(storage, scope)
  if (isMuted(current, target)) return current
  if (target.kind === 'bot') current.mutedBots = [...current.mutedBots, target.id]
  else current.mutedRooms = [...current.mutedRooms, target.id]
  return write(storage, current)
}

export function mutesForCurrentScope(storage: MuteStorage, scope: MuteScope, current?: MuteState): MuteState {
  const key = mutesKey(scope)
  if (current?.key === key) return current
  return loadMutes(storage, scope)
}

export function unmuteScope(storage: MuteStorage, scope: MuteScope, target: MuteTarget): MuteState {
  const current = loadMutes(storage, scope)
  if (target.kind === 'bot') current.mutedBots = current.mutedBots.filter(id => id !== target.id)
  else current.mutedRooms = current.mutedRooms.filter(id => id !== target.id)
  return write(storage, current)
}
