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

  if (requested) {
    return requested
  }

  return roomIds[0] ?? null
}

export function membershipHref(botId: string): string {
  return `/rooms/memberships?bot=${encodeURIComponent(botId)}`
}

export function botIdFromMembershipSearch(search: string): string | null {
  const raw = search.startsWith('?') ? search.slice(1) : search

  return new URLSearchParams(raw).get('bot')
}

export function registeredHref(
  kind: HomeSourceKind,
  sourceId: string,
  owner?: { connectionId?: null | string; profile?: null | string }
): string {
  switch (kind) {
    case 'bot':
      return membershipHref(sourceId)

    case 'room':

    case 'project':

    case 'pr':
      return roomsSearchHref(kind, sourceId)

    case 'session':
      return `/${encodeURIComponent(sourceId)}`
    case 'cron': {
      const params = new URLSearchParams({ job: sourceId })

      if (owner?.connectionId) {
        params.set('connection', owner.connectionId)
      }

      if (owner?.profile) {
        params.set('profile', owner.profile)
      }

      return `/cron-center?${params.toString()}`
    }

    case 'artifact':
      return `/artifacts?id=${encodeURIComponent(sourceId)}`
  }
}

export function cronCenterJobKeyFromSearch(search: string): null | string {
  const raw = search.startsWith('?') ? search.slice(1) : search
  const params = new URLSearchParams(raw)
  const job = params.get('job')
  const connection = params.get('connection')
  const profile = params.get('profile')

  if (!job || !connection || !profile) {
    return null
  }

  return `${connection}::${profile}::${job}`
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

  if (path === '/cron-center' || path === '/cron') {
    const search = url.searchParams.toString()
    deps.navigate(`/cron-center${search ? `?${search}` : ''}`)

    return
  }

  if (path === '/artifacts') {
    const id = url.searchParams.get('id')

    if (id) {
      deps.openArtifact(id)
    }
    deps.navigate('/artifacts')

    return
  }

  if (path === '/agents' || path === '/rooms/memberships') {
    const bot = url.searchParams.get('bot')
    deps.navigate(bot ? membershipHref(bot) : '/rooms/memberships')

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
