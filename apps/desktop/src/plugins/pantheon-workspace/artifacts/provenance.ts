export type ArtifactOwnerRoute = {
  connectionId: string
  profile: string
}

export type PantheonArtifactSource =
  | {
      kind: 'session'
      connectionId: string
      profile: string
      storedSessionId: string
      machine?: string
    }
  | {
      kind: 'room'
      roomId: string
      messageId?: string
      machine?: string
    }
  | {
      kind: 'project'
      projectId: string
      prId?: string
      worktree?: string
      machine?: string
    }
  | {
      kind: 'file'
      connectionId: string
      profile: string
      path: string
      machine?: string
    }

export function sessionArtifactSource(input: {
  connectionId: string
  profile: string
  storedSessionId: string
  machine?: string
}): Extract<PantheonArtifactSource, { kind: 'session' }> {
  return {
    kind: 'session',
    connectionId: input.connectionId.trim(),
    profile: input.profile.trim(),
    storedSessionId: input.storedSessionId.trim(),
    ...(input.machine ? { machine: input.machine } : {})
  }
}

export function artifactIdentityKey(source: PantheonArtifactSource): string {
  switch (source.kind) {
    case 'session':
      return `session:${source.connectionId}:${source.profile}:${source.storedSessionId}`

    case 'room':
      return `room:${source.roomId}:${source.messageId ?? ''}`

    case 'project':
      return `project:${source.projectId}:${source.prId ?? ''}:${source.worktree ?? ''}`

    case 'file':
      return `file:${source.connectionId}:${source.profile}:${source.path}`
  }
}

export function roomMessageHref(roomId: string, messageId?: string): string {
  const params = new URLSearchParams({ room: roomId })
  const concreteMessageId = concreteRoomMessageId(messageId)

  if (concreteMessageId) {
    params.set('message', concreteMessageId)
  }

  return `/rooms?${params.toString()}`
}

export function concreteRoomMessageId(messageId?: string): string | undefined {
  const trimmed = messageId?.trim()

  if (!trimmed || trimmed === 'latest') {
    return undefined
  }

  return trimmed
}

export function requireOwningRoute(route: Partial<ArtifactOwnerRoute>): ArtifactOwnerRoute {
  const connectionId = route.connectionId?.trim() ?? ''
  const profile = route.profile?.trim() ?? ''

  if (!connectionId || !profile) {
    throw new Error('Artifact open requires an exact owning route (connectionId + profile)')
  }

  return { connectionId, profile }
}

export interface OpenArtifactDeps {
  navigate?: (href: string) => void
  openRemotePath?: (route: ArtifactOwnerRoute, path: string) => void
  openSession?: (storedSessionId: string, route: ArtifactOwnerRoute) => void
}

export function openArtifactSource(source: PantheonArtifactSource, deps: OpenArtifactDeps): void {
  if (source.kind === 'file') {
    const route = requireOwningRoute(source)
    deps.openRemotePath?.(route, source.path)

    return
  }

  if (source.kind === 'room') {
    deps.navigate?.(roomMessageHref(source.roomId, source.messageId))

    return
  }

  if (source.kind === 'session') {
    const route = requireOwningRoute(source)
    deps.openSession?.(source.storedSessionId, route)

    return
  }

  const params = new URLSearchParams({ project: source.projectId })

  if (source.prId) {
    params.set('pr', source.prId)
  }
  deps.navigate?.(`/projects?${params.toString()}`)
}
