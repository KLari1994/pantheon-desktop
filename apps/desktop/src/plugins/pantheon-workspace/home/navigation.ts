import type { HomeSourceKind } from './types'

export function roomsSearchHref(kind: 'pr' | 'project' | 'room', sourceId: string): string {
  const param = kind === 'room' ? 'room' : kind === 'project' ? 'project' : 'pr'
  return `/rooms?${param}=${encodeURIComponent(sourceId)}`
}

export function sourceIdFromRoomsSearch(search: string): string | null {
  const raw = search.startsWith('?') ? search.slice(1) : search
  const params = new URLSearchParams(raw)
  return params.get('room') || params.get('project') || params.get('pr')
}

export function pickRoomId(roomIds: readonly string[], search: string): string | null {
  const requested = sourceIdFromRoomsSearch(search)
  if (requested) return requested
  return roomIds[0] ?? null
}

export function registeredHref(kind: HomeSourceKind, sourceId: string): string {
  switch (kind) {
    case 'bot':
      return `/agents?bot=${encodeURIComponent(sourceId)}`
    case 'room':
    case 'project':
    case 'pr':
      return roomsSearchHref(kind, sourceId)
    case 'session':
      return `/${encodeURIComponent(sourceId)}`
    case 'cron':
      return `/cron?job=${encodeURIComponent(sourceId)}`
    case 'artifact':
      return `/artifacts?id=${encodeURIComponent(sourceId)}`
  }
}
