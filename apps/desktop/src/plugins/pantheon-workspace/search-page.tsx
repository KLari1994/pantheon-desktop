import { desktopBuzzClient, host, listAllProfileSessions } from '@hermes/plugin-sdk'
import { useEffect, useMemo, useState } from 'react'

import { openArtifactSource } from './artifacts/provenance'
import { federateSearch } from './search/federation'
import { collectSearchHits } from './search/sources'

export function SearchPage() {
  const [query, setQuery] = useState('')
  const [advanced, setAdvanced] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hits, setHits] = useState(collectSearchHits({}))

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      try {
        const client = desktopBuzzClient()

        const [sessionsPage, roomsPage, manifest] = await Promise.all([
          listAllProfileSessions(40, 1),
          client.listRooms(),
          client.getWorkspaceManifest().catch(() => ({ version: 1, agents: [], rooms: [] }))
        ])

        if (cancelled) {
          return
        }

        const fallbackConnection = host.state.connectionId.get() || 'local'
        const fallbackProfile = host.state.profile.get() || 'default'

        setHits(
          collectSearchHits({
            bots: (manifest.agents || []).map(agent => ({
              connectionId: agent.connectionId,
              id: agent.id,
              machine: agent.machineId || agent.connectionId,
              profile: agent.profile,
              title: agent.id
            })),
            rooms: roomsPage.rooms.map(room => ({
              connectionId: fallbackConnection,
              id: room.id,
              machine: 'relay',
              profile: fallbackProfile,
              title: room.name || room.id
            })),
            sessions: sessionsPage.sessions.map(session => ({
              connectionId: session.connection_id || fallbackConnection,
              hidden: session.source === 'hidden',
              id: session.id,
              machine: session.connection_id || fallbackConnection,
              profile: session.profile || fallbackProfile,
              title: session.title || session.preview || session.id
            }))
          })
        )
        setError(null)
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
  }, [])

  const results = useMemo(() => federateSearch(query, hits, { advanced }), [advanced, hits, query])

  return (
    <section className="flex h-full min-w-0 flex-col overflow-hidden bg-(--ui-chat-surface-background)">
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          <input
            aria-label="Search sessions, bots, and rooms"
            className="min-w-0 flex-1 rounded-md border border-(--ui-stroke-secondary) bg-transparent px-3 py-2 text-sm"
            onChange={event => setQuery(event.target.value)}
            placeholder="Search sessions, bots, and rooms"
            value={query}
          />
          <label className="flex items-center gap-2 text-xs text-(--ui-text-secondary)">
            <input checked={advanced} onChange={event => setAdvanced(event.target.checked)} type="checkbox" />
            Advanced
          </label>
        </div>
        {error ? <p className="text-sm text-(--ui-text-secondary)">{error}</p> : null}
        <ul className="flex flex-col gap-2 overflow-y-auto">
          {results.map(result => (
            <li key={result.id}>
              <button
                className="w-full rounded-md border border-(--ui-stroke-secondary) px-3 py-2 text-left text-sm"
                onClick={() => {
                  if (result.sourceType === 'session') {
                    openArtifactSource(
                      {
                        kind: 'session',
                        connectionId: result.ownerRoute.connectionId,
                        profile: result.ownerRoute.profile,
                        storedSessionId: result.destinationId,
                        machine: result.machine
                      },
                      {
                        openSession: (storedSessionId, route) => {
                          void host.openSession(storedSessionId, {
                            intent: 'stack',
                            route: {
                              connectionId: route.connectionId,
                              mode: route.connectionId === 'local' ? 'local' : 'remote',
                              profile: route.profile,
                              targetProfile: route.profile
                            },
                            workspaceMode: 'sessions'
                          })
                        }
                      }
                    )

                    return
                  }

                  if (result.sourceType === 'room') {
                    openArtifactSource(
                      { kind: 'room', roomId: result.destinationId, machine: result.machine },
                      { navigate: href => host.navigate(href) }
                    )

                    return
                  }

                  host.navigate(`/rooms/memberships?bot=${encodeURIComponent(result.destinationId)}`)
                }}
                type="button"
              >
                <div className="font-medium">{result.title}</div>
                <div className="text-xs text-(--ui-text-secondary)">
                  {result.sourceType} · {result.machine} · {result.ownerRoute.connectionId}/{result.ownerRoute.profile}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
