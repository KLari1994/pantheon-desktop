export type SearchSourceType = 'bot' | 'room' | 'session'

export interface SearchOwnerRoute {
  connectionId: string
  profile: string
}

export interface SearchSourceHit {
  destinationId: string
  hidden?: boolean
  machine: string
  ownerRoute: SearchOwnerRoute
  sourceType: SearchSourceType
  title: string
}

export interface FederatedSearchResult extends SearchSourceHit {
  id: string
}

export function federateSearch(
  query: string,
  hits: readonly SearchSourceHit[],
  options: { advanced?: boolean } = {}
): FederatedSearchResult[] {
  const needle = query.trim().toLowerCase()
  const includeHidden = options.advanced === true

  const matched = hits.filter(hit => {
    if (!includeHidden && hit.hidden) {
      return false
    }

    if (!needle) {
      return true
    }

    return (
      hit.title.toLowerCase().includes(needle) ||
      hit.sourceType.includes(needle) ||
      hit.machine.toLowerCase().includes(needle) ||
      hit.destinationId.toLowerCase().includes(needle)
    )
  })

  const seen = new Set<string>()
  const results: FederatedSearchResult[] = []

  for (const hit of matched) {
    const id =
      hit.sourceType === 'session'
        ? `session:${hit.ownerRoute.connectionId.trim()}:${hit.ownerRoute.profile.trim()}:${hit.destinationId.trim()}`
        : `${hit.sourceType}:${hit.ownerRoute.connectionId}:${hit.ownerRoute.profile}:${hit.destinationId}`

    if (seen.has(id)) {
      continue
    }

    seen.add(id)
    results.push({ ...hit, id })
  }

  return results.sort((left, right) => {
    const rank: Record<SearchSourceType, number> = { session: 0, bot: 1, room: 2 }

    return rank[left.sourceType] - rank[right.sourceType] || left.title.localeCompare(right.title)
  })
}
