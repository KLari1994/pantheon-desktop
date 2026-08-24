import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'

import {
  type HermesPlugin,
  host,
  type RouteContribution,
  ROUTES_AREA,
  SIDEBAR_NAV_AREA,
  type SidebarNavContribution
} from '@hermes/plugin-sdk'

import {
  desktopBuzzClient,
  type BuzzRoom,
  type BuzzStatus,
  type WorkspaceManifest
} from '@/pantheon/buzz-client'

import { RoomMemberships } from './agents/room-memberships'
import { applyRoomMembership } from './manifest/store'
import { RoomList } from './rooms/room-list'
import { RoomWorkspace } from './rooms/room-workspace'
import {
  deriveBindingHealth,
  loadRoomDiagnostics,
  type RoomDiagnosticRow
} from './rooms/room-diagnostics'
import { RoomsStore } from './rooms/store'

function useStoreValue<T>(store: { get: () => T; listen: (listener: (next: T) => void) => () => void }): T {
  return useSyncExternalStore(store.listen, store.get, store.get)
}

function RoomsPage() {
  const store = useMemo(() => new RoomsStore(undefined, undefined), [])
  const rooms = useStoreValue(store.$rooms)
  const windows = useStoreValue(store.$windows)
  const [status, setStatus] = useState<BuzzStatus>({ state: 'connecting' })
  const [selected, setSelected] = useState<BuzzRoom | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [diagnostics, setDiagnostics] = useState<RoomDiagnosticRow[]>([])

  useEffect(() => {
    let cancelled = false
    let unsubscribe: () => void = () => undefined
    const run = async () => {
      try {
        const client = desktopBuzzClient()
        const nextStatus = await client.status()
        const page = await client.listRooms()
        if (cancelled) return
        store.mergeRooms(page.rooms)
        setStatus(nextStatus)
        unsubscribe = client.subscribe(event => {
          if (event.type === 'relay.status') {
            setStatus(current => ({ ...current, state: event.state, error: event.error }))
            if (event.state === 'open') {
              store.reconnectKeepPending()
            }
            return
          }
          const roomId = event.roomId || event.room_id
          if (event.type === 'room.event' && roomId && event.event && typeof event.event === 'object') {
            store.ingestEvent(roomId, event.event as { id?: string; content?: string; created_at?: number; pubkey?: string })
          }
        })
        const first = page.rooms[0]
        if (first) {
          await selectRoom(store, first.id, setSelected)
          await client.startSubscription({ roomIds: page.rooms.map(room => room.id) })
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      }
    }
    void run()
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [store])

  useEffect(() => {
    if (!selected) return
    let cancelled = false
    void Promise.all(
      (selected.members.length ? selected.members : [{ pubkey: selected.id, name: selected.name }]).map(member =>
        loadRoomDiagnostics((route, method, params) => host.requestProfile(route as never, method, params), {
          route: { connectionId: member.pubkey, profile: member.name || member.pubkey },
          lastEventAt: windows[selected.id]?.messages.at(-1)?.createdAt
        })
      )
    )
      .then(groups => {
        if (!cancelled) setDiagnostics(groups.flat())
      })
      .catch(() => {
        if (!cancelled) setDiagnostics([])
      })
    return () => {
      cancelled = true
    }
  }, [selected, status.compatibilityCommit, windows])

  if (error) return <div className="p-4 text-sm text-(--ui-text-secondary)">{error}</div>
  if (!selected) return <div className="p-4 text-sm text-(--ui-text-secondary)">Loading rooms…</div>

  const window = windows[selected.id]
  const failed = window?.messages.find(message => message.outgoing === 'failed') || null

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-72 border-r border-(--ui-stroke-tertiary)">
        <RoomList
          rooms={rooms}
          selectedId={selected.id}
          onSelect={id => {
            void selectRoom(store, id, setSelected)
          }}
        />
      </aside>
      <RoomWorkspace
        room={selected}
        messages={window?.messages || []}
        reactions={window?.reactions || []}
        relayOpen={status.state === 'open'}
        hasCredential={status.hasCredential === true}
        failed={failed}
        diagnostics={diagnostics}
        onShowEarlier={() => {
          const oldest = window?.messages[0]?.id
          void desktopBuzzClient()
            .getMessages({ roomId: selected.id, before: oldest, limit: 50 })
            .then(next => store.applyWindow(selected.id, next.messages, next.reactions || []))
        }}
        onReact={(targetEventId, emoji) => {
          void desktopBuzzClient().addReaction({ roomId: selected.id, targetEventId, emoji })
        }}
        onInvite={pubkey => {
          if (!pubkey) return
          void desktopBuzzClient().inviteMember({ roomId: selected.id, pubkey })
        }}
        onKick={pubkey => {
          void desktopBuzzClient().removeMember({ roomId: selected.id, pubkey })
        }}
        onRetry={() => {
          if (!failed?.nonce || !failed.content) return
          const nonce = failed.nonce
          void desktopBuzzClient()
            .sendMessage({ roomId: selected.id, content: failed.content })
            .then(result => store.ackOptimistic(nonce, result.eventId))
            .catch(() => store.failOptimistic(nonce))
        }}
        onRemove={() => {
          if (failed?.nonce) store.removeOptimistic(failed.nonce)
        }}
        onSend={async (content, mentions) => {
          const client = desktopBuzzClient()
          const nonce = `${Date.now()}`
          store.queueOptimistic(selected.id, content, nonce)
          try {
            const result = await client.sendMessage({ roomId: selected.id, content, mentions })
            store.ackOptimistic(nonce, result.eventId)
          } catch {
            store.failOptimistic(nonce)
          }
        }}
      />
    </div>
  )
}

async function selectRoom(
  store: RoomsStore,
  roomId: string,
  setSelected: (room: BuzzRoom) => void
): Promise<void> {
  const client = desktopBuzzClient()
  const detail = await client.getRoom({ roomId })
  const window = await client.getMessages({ roomId, limit: 50 })
  store.applyWindow(roomId, window.messages, window.reactions || [])
  setSelected(detail)
}

function AgentRoomsMount() {
  const [manifest, setManifest] = useState<WorkspaceManifest>({ version: 1, rooms: [] })
  const [liveRooms, setLiveRooms] = useState<BuzzRoom[]>([])
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const client = desktopBuzzClient()
        const nextManifest = await client.getWorkspaceManifest()
        const page = await client.listRooms()
        if (cancelled) return
        setManifest(nextManifest)
        setLiveRooms(page.rooms)
      } catch {
        /* manifest/live rooms stay empty until the sidecar is available */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])
  const agent = manifest.agents?.[0]
  if (!agent) {
    return <div className="p-4 text-sm text-(--ui-text-secondary)">No workspace agents</div>
  }
  return (
    <RoomMemberships
      agent={{
        id: agent.id,
        connectionId: agent.connectionId,
        profile: agent.profile,
        pubkey: agent.id
      }}
      manifest={manifest}
      liveRooms={liveRooms}
      onToggle={async input => {
        const client = desktopBuzzClient()
        const current = (manifest.rooms || []).find(room => room.id === input.roomId)?.memberAgentIds || []
        const memberAgentIds = input.add
          ? [...new Set([...current, input.pubkey])]
          : current.filter(id => id !== input.pubkey)
        const next = await applyRoomMembership(client, {
          roomId: input.roomId,
          pubkey: input.pubkey,
          memberAgentIds,
          add: input.add
        })
        setManifest(next)
      }}
    />
  )
}

export function diagnosticsFromSessions(
  sessions: Array<{ profile?: string; connectionId?: string; id?: string; _lineage_root_id?: string }>,
  runtimeId?: string
): RoomDiagnosticRow[] {
  return sessions.map(session => ({
    agent: session.profile || 'unknown',
    connectionId: session.connectionId || '',
    storedSessionId: session.id,
    lineageRootId: session._lineage_root_id,
    runtimeSessionId: runtimeId,
    health: deriveBindingHealth({ storedSessionId: session.id, runtimeSessionId: runtimeId })
  }))
}

const plugin: HermesPlugin = {
  id: 'pantheon-workspace',
  name: 'Pantheon Rooms',
  description: 'Unified Buzz rooms through the key-safe local sidecar.',
  defaultEnabled: true,
  register(ctx) {
    ctx.registerMany([
      {
        id: 'page',
        area: ROUTES_AREA,
        data: { path: '/rooms' } satisfies RouteContribution,
        render: () => <RoomsPage />
      },
      {
        id: 'nav',
        area: SIDEBAR_NAV_AREA,
        order: 25,
        data: { codicon: 'comment-discussion', label: 'Rooms', path: '/rooms' } satisfies SidebarNavContribution
      },
      {
        id: 'agent-rooms',
        area: ROUTES_AREA,
        data: { path: '/rooms/memberships' } satisfies RouteContribution,
        render: () => <AgentRoomsMount />
      }
    ])
    ctx.onDispose(() => {
      if (typeof host.navigate === 'function' && window.location.pathname.startsWith('/rooms')) {
        host.navigate('/')
      }
    })
  }
}

export default plugin
