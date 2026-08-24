export interface MemoryOwnerRoute {
  connectionId: string
  mode: 'local' | 'remote'
  profile: string
  targetProfile: string
}

export type MemoryScope =
  | { kind: 'active-bot'; route: MemoryOwnerRoute }
  | { kind: 'all-pantheon' }

export interface MemoryRecord {
  body: string
  id: string
  title: string
}

export interface MemoryGraphSlice {
  memories: MemoryRecord[]
  route: MemoryOwnerRoute
}

export interface MemoryReference {
  id: string
  ownerRoute: MemoryOwnerRoute
  title: string
}

export function requireExactMemoryRoute(route: MemoryOwnerRoute): MemoryOwnerRoute {
  if (!route.connectionId.trim() || !route.profile.trim() || !route.targetProfile.trim()) {
    throw new Error('Memory scope requires an exact connection/profile route')
  }

  return route
}

export function resolveMemoryScope(input: { activeBot?: MemoryOwnerRoute | null; allPantheon?: boolean }): MemoryScope {
  if (input.allPantheon) {
    return { kind: 'all-pantheon' }
  }

  if (!input.activeBot) {
    throw new Error('Memory Graph defaults to the active bot and requires an exact route')
  }

  return { kind: 'active-bot', route: requireExactMemoryRoute(input.activeBot) }
}

export function aggregateMemoryReferences(slices: readonly MemoryGraphSlice[]): MemoryReference[] {
  return slices.flatMap(slice => {
    const ownerRoute = requireExactMemoryRoute(slice.route)

    return slice.memories.map(memory => ({
      id: memory.id,
      ownerRoute,
      title: memory.title
    }))
  })
}
