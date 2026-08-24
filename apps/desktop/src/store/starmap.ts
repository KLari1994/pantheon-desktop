import { atom } from 'nanostores'

import type { ProfileScope } from '@/api/client'
import { getStarmapGraph } from '@/hermes'
import type { StarmapGraph } from '@/types/hermes'

// On-demand cache for the star map. The graph scan touches the skills catalog +
// usage ledger + memory files, so we fetch it only when the panel opens (and on
// an explicit refresh), never on a turn boundary. Routed loads are keyed so a
// Memory Graph switch cannot paint another profile's nodes from a shared atom.
export const $starmapGraph = atom<StarmapGraph | null>(null)
export const $starmapGraphKey = atom('')
export const $starmapLoading = atom(false)
export const $starmapError = atom<null | string>(null)

let inflight: Promise<void> | null = null
let inflightKey: string | null = null
let loadGeneration = 0

export function starmapScopeKey(scope?: ProfileScope): string {
  if (scope && typeof scope === 'object') {
    return `${String(scope.connectionId || '').trim()}::${String(scope.profile || '').trim()}`
  }

  if (typeof scope === 'string' && scope.trim()) {
    return `::${scope.trim()}`
  }

  return 'active'
}

export function starmapGraphForRoute(routeKey: string): StarmapGraph | null {
  if (routeKey && $starmapGraphKey.get() !== routeKey) {
    return null
  }

  return $starmapGraph.get()
}

export async function loadStarmapGraph(force = false, scope?: ProfileScope): Promise<void> {
  const key = starmapScopeKey(scope)

  if (inflight && inflightKey === key) {
    return inflight
  }

  if ($starmapGraph.get() && !force && $starmapGraphKey.get() === key) {
    return
  }

  const generation = ++loadGeneration
  $starmapLoading.set(true)
  $starmapError.set(null)
  inflightKey = key

  inflight = (async () => {
    try {
      const graph = await getStarmapGraph(scope)

      if (generation !== loadGeneration) {
        return
      }

      $starmapGraph.set(graph)
      $starmapGraphKey.set(key)
    } catch (err) {
      if (generation !== loadGeneration) {
        return
      }

      $starmapError.set(err instanceof Error ? err.message : String(err))
    } finally {
      if (generation === loadGeneration) {
        $starmapLoading.set(false)
        inflight = null
        inflightKey = null
      }
    }
  })()

  return inflight
}

/** Drop one node from the cached graph immediately; return rollback. */
export function evictStarmapNode(id: string): () => void {
  const prev = $starmapGraph.get()

  if (!prev) {
    return () => {}
  }

  const next: StarmapGraph = {
    ...prev,
    nodes: prev.nodes.filter(node => node.id !== id),
    edges: prev.edges.filter(edge => edge.source !== id && edge.target !== id)
  }

  $starmapGraph.set(next)

  return () => $starmapGraph.set(prev)
}

/** Drop the cache so the next open refetches against the now-active profile. */
export function resetStarmapGraph(): void {
  loadGeneration += 1
  inflight = null
  inflightKey = null
  $starmapGraph.set(null)
  $starmapGraphKey.set('')
  $starmapError.set(null)
}
