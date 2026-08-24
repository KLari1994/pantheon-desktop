import { desktopBuzzClient, getStarmapGraph, host, StarmapView } from '@hermes/plugin-sdk'
import { useEffect, useMemo, useState } from 'react'

import { memorySliceFromGraph } from './graph-refs'
import {
  aggregateMemoryReferences,
  resolveMemoryScope,
  type MemoryOwnerRoute,
  type MemoryReference
} from './scope'

function activeBotRoute(): MemoryOwnerRoute | null {
  const connectionId = host.state.connectionId.get()?.trim()
  const profile = host.state.profile.get()?.trim()

  if (!connectionId || !profile) {
    return null
  }

  return {
    connectionId,
    mode: connectionId === 'local' ? 'local' : 'remote',
    profile,
    targetProfile: profile
  }
}

export function MemoryPage() {
  const [allPantheon, setAllPantheon] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [references, setReferences] = useState<MemoryReference[]>([])
  const activeBot = activeBotRoute()

  const scope = useMemo(() => {
    try {
      return resolveMemoryScope({ activeBot, allPantheon })
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  }, [activeBot, allPantheon])

  useEffect(() => {
    if (!('kind' in scope) || scope.kind !== 'all-pantheon') {
      return
    }

    let cancelled = false

    const run = async () => {
      try {
        const manifest = await desktopBuzzClient().getWorkspaceManifest()
        const slices = []

        for (const agent of manifest.agents || []) {
          const route: MemoryOwnerRoute = {
            connectionId: agent.connectionId,
            mode: agent.connectionId === 'local' ? 'local' : 'remote',
            profile: agent.profile,
            targetProfile: agent.profile
          }
          const graph = await getStarmapGraph({ connectionId: route.connectionId, profile: route.targetProfile })
          slices.push(memorySliceFromGraph(route, graph))
        }

        if (!cancelled) {
          setReferences(aggregateMemoryReferences(slices))
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
        }
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [scope])

  if ('error' in scope) {
    return <div className="p-4 text-sm text-(--ui-text-secondary)">{scope.error}</div>
  }

  return (
    <section className="flex h-full min-w-0 flex-col overflow-hidden bg-(--ui-chat-surface-background)">
      <div className="flex items-center gap-3 p-4">
        <label className="flex items-center gap-2 text-sm">
          <input checked={allPantheon} onChange={event => setAllPantheon(event.target.checked)} type="checkbox" />
          All Pantheon
        </label>
      </div>
      {scope.kind === 'active-bot' ? (
        <div className="min-h-0 flex-1">
          <StarmapView onClose={() => host.navigate('/')} route={scope.route} />
        </div>
      ) : (
        <ul className="flex flex-col gap-2 overflow-y-auto px-4 pb-4">
          {error ? <li className="text-sm text-(--ui-text-secondary)">{error}</li> : null}
          {references.map(reference => (
            <li
              className="rounded-md border border-(--ui-stroke-secondary) px-3 py-2 text-sm"
              key={`${reference.ownerRoute.connectionId}:${reference.ownerRoute.profile}:${reference.id}`}
            >
              <div className="font-medium">{reference.title}</div>
              <div className="text-xs text-(--ui-text-secondary)">
                {reference.ownerRoute.connectionId}/{reference.ownerRoute.profile}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
