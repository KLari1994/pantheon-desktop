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

export interface HomeNavigationDeps {
  navigate: (href: string) => void
  openSession: (
    storedSessionId: string,
    navigate: (href: string) => void,
    intent: 'stack',
    workspaceScope: {
      workspaceMode: 'sessions'
      ownerRoute?: { connectionId: string; profile: string }
    }
  ) => void
  setCronFocusJobId: (id: string | null) => void
  openArtifact: (artifactId: string) => void
  owner?: { connectionId: string; profile: string }
}

export function openHomeTarget(href: string, deps: HomeNavigationDeps): void {
  const url = new URL(href, 'hermes://home')
  const path = url.pathname
  if (path === '/cron') {
    const job = url.searchParams.get('job')
    if (job) deps.setCronFocusJobId(job)
    deps.navigate('/cron')
    return
  }
  if (path === '/artifacts') {
    const id = url.searchParams.get('id')
    if (id) deps.openArtifact(id)
    deps.navigate('/artifacts')
    return
  }
  if (path === '/agents') {
    deps.navigate('/agents')
    return
  }
  if (path === '/rooms') {
    deps.navigate(href)
    return
  }
  const sessionId = decodeURIComponent(path.replace(/^\//, ''))
  if (sessionId) {
    deps.openSession(sessionId, deps.navigate, 'stack', {
      workspaceMode: 'sessions',
      ownerRoute: deps.owner
    })
    return
  }
  deps.navigate(href)
}
