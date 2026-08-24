import {
  type HermesPlugin,
  host,
  type PluginContext,
  type RouteContribution,
  ROUTES_AREA,
  SIDEBAR_NAV_AREA,
  type SidebarNavContribution
} from '@hermes/plugin-sdk'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useSearchParams } from 'react-router'

import { openSession } from '@/app/open-session'
import {
  type BuzzRoom,
  type BuzzStatus,
  desktopBuzzClient,
  type WorkspaceAgent,
  type WorkspaceManifest
} from '@/pantheon/buzz-client'
import { openArtifact } from '@/store/artifacts'
import { setCronFocusJobId } from '@/store/cron'

import { resolveAgentPubkey, resolveMemberAgent, selectMembershipAgent } from './agents/resolve-agent'
import { RoomMemberships } from './agents/room-memberships'
import { CronCenterApi } from './cron-center/api'
import { CronCenterPage } from './cron-center/cron-center-page'
import { CRON_CENTER_LOCALES, useCronCenterText } from './cron-center/i18n'
import { CronCenterStore } from './cron-center/store'
import { HomePage } from './home/home-page'
import { startHomeIngestion } from './home/ingest'
import { botIdFromMembershipSearch, cronCenterJobKeyFromSearch, openHomeTarget, pickRoomId, registeredHref } from './home/navigation'
import {
  applyHomeSourceSnapshot,
  collectApprovalInboxRows,
  collectAuthoritativeHomeEvents,
  createPluginApprovalInbox,
  subscribeAuthoritativeHomeSources,
  toNotificationEvent
} from './home/sources'
import { HomeStore } from './home/store'
import { applyRoomMembership } from './manifest/store'
import type { ApprovalProjection } from './needs-you/approval-projections'
import { NotificationCoordinator } from './notifications/coordinator'
import { loadMutes, muteScope, mutesForCurrentScope, type MuteState } from './notifications/mutes'
import {
  deriveBindingHealth,
  diagnosticRuntimeForAgent,
  liveDiagnosticRoute,
  loadRoomDiagnostics,
  type RoomDiagnosticRow
} from './rooms/room-diagnostics'
import { RoomList } from './rooms/room-list'
import { RoomWorkspace } from './rooms/room-workspace'
import { type RoomLiveEvent, RoomsStore } from './rooms/store'

function useStoreValue<T>(store: { get: () => T; listen: (listener: (next: T) => void) => () => void }): T {
  return useSyncExternalStore(store.listen, store.get, store.get)
}

function useRoomsSearch(): string {
  try {
    const [params] = useSearchParams()

    return params.toString()
  } catch {
    return typeof window === 'undefined' ? '' : window.location.search.replace(/^\?/, '')
  }
}

function RoomsPage() {
  const store = useMemo(() => new RoomsStore(undefined, undefined), [])
  const rooms = useStoreValue(store.$rooms)
  const windows = useStoreValue(store.$windows)
  const search = useRoomsSearch()
  const [status, setStatus] = useState<BuzzStatus>({ state: 'connecting' })
  const [selected, setSelected] = useState<BuzzRoom | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [diagnostics, setDiagnostics] = useState<RoomDiagnosticRow[]>([])
  const [manifest, setManifest] = useState<WorkspaceManifest>({ version: 1, rooms: [] })

  useEffect(() => {
    let cancelled = false
    let unsubscribe: () => void = () => undefined

    const run = async () => {
      try {
        const client = desktopBuzzClient()
        const nextStatus = await client.status()
        const page = await client.listRooms()
        const nextManifest = await client.getWorkspaceManifest().catch(() => ({ version: 1, rooms: [] }))

        if (cancelled) {return}
        store.mergeRooms(page.rooms)
        setStatus(nextStatus)
        setManifest(nextManifest)
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
            const result = store.ingestEvent(roomId, event.event as RoomLiveEvent)
            if (result === 'refresh-room') {
              void refreshSelectedRoom(store, roomId, setSelected)
            }
          }
        })

        const targetId = pickRoomId(
          page.rooms.map(room => room.id),
          search
        )

        if (targetId) {
          await selectRoom(store, targetId, setSelected)
          await client.startSubscription({ roomIds: page.rooms.map(room => room.id) })
        }
      } catch (err) {
        if (!cancelled) {setError(err instanceof Error ? err.message : String(err))}
      }
    }

    void run()

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [search, store])

  useEffect(() => {
    if (!selected) {return}
    let cancelled = false
    const agents = (manifest.agents || []) as Array<WorkspaceAgent & { pubkey?: string }>
    const owner = host.state.focusedSessionOwner.get()
    const live = liveDiagnosticRoute(
      owner,
      {
        connectionId: host.state.connectionId.get(),
        profile: host.state.profile.get()
      },
      host.state.focusedSessionId.get()
    )
    const lastEventAt = windows[selected.id]?.messages.at(-1)?.createdAt
    void Promise.all(
      selected.members.map(async member => {
        const agent = resolveMemberAgent(member, agents)

        if (!agent) {
          return [
            {
              agent: member.name || member.pubkey,
              connectionId: '',
              lastEventAt,
              health: 'unknown' as const
            }
          ]
        }

        const runtime = diagnosticRuntimeForAgent(agent, live)

        return loadRoomDiagnostics((route, method, params) => host.requestProfile(route as never, method, params), {
          route: { connectionId: agent.connectionId, profile: agent.profile },
          machine: runtime.machine,
          runtimeSessionId: runtime.runtimeSessionId,
          lastEventAt
        })
      })
    )
      .then(groups => {
        if (!cancelled) {setDiagnostics(groups.flat())}
      })
      .catch(() => {
        if (!cancelled) {setDiagnostics([])}
      })

    return () => {
      cancelled = true
    }
  }, [selected, status.compatibilityCommit, windows, manifest])

  if (error) {return <div className="p-4 text-sm text-(--ui-text-secondary)">{error}</div>}

  if (!selected) {return <div className="p-4 text-sm text-(--ui-text-secondary)">Loading rooms…</div>}

  const window = windows[selected.id]
  const failed = window?.messages.find(message => message.outgoing === 'failed') || null

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-72 border-r border-(--ui-stroke-tertiary)">
        <RoomList
          onSelect={id => {
            void selectRoom(store, id, setSelected)
          }}
          rooms={rooms}
          selectedId={selected.id}
        />
      </aside>
      <RoomWorkspace
        diagnostics={diagnostics}
        failed={failed}
        hasCredential={status.hasCredential === true}
        messages={window?.messages || []}
        onInvite={pubkey => {
          if (!pubkey) {return}
          void desktopBuzzClient().inviteMember({ roomId: selected.id, pubkey })
        }}
        onKick={pubkey => {
          void desktopBuzzClient().removeMember({ roomId: selected.id, pubkey })
        }}
        onReact={(targetEventId, emoji) => {
          void desktopBuzzClient().addReaction({ roomId: selected.id, targetEventId, emoji })
        }}
        onRemove={() => {
          if (failed?.nonce) {store.removeOptimistic(failed.nonce)}
        }}
        onRemoveReaction={reactionEventId => {
          void desktopBuzzClient().removeReaction({ roomId: selected.id, reactionEventId })
        }}
        onRetry={() => {
          if (!failed?.nonce || !failed.content) {return}
          const nonce = failed.nonce
          void desktopBuzzClient()
            .sendMessage({
              roomId: selected.id,
              content: failed.content,
              threadRootId: failed.threadRootId,
              attachments: failed.attachments,
              mentions: failed.mentions
            })
            .then(result => store.ackOptimistic(nonce, result.eventId))
            .catch(() => store.failOptimistic(nonce))
        }}
        onSend={async (content, mentions, extras) => {
          const client = desktopBuzzClient()
          const nonce = `${Date.now()}`
          store.queueOptimistic(selected.id, content, nonce, {
            mentions,
            threadRootId: extras?.threadRootId,
            attachments: extras?.attachments
          })
          try {
            const result = await client.sendMessage({
              roomId: selected.id,
              content,
              mentions,
              threadRootId: extras?.threadRootId,
              attachments: extras?.attachments
            })

            store.ackOptimistic(nonce, result.eventId)
          } catch {
            store.failOptimistic(nonce)
          }
        }}
        onShowEarlier={() => {
          const oldest = window?.messages[0]?.id
          void desktopBuzzClient()
            .getMessages({ roomId: selected.id, before: oldest, limit: 50 })
            .then(next => store.applyWindow(selected.id, next.messages, next.reactions || []))
        }}
        reactions={window?.reactions || []}
        relayOpen={status.state === 'open'}
        room={selected}
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
  store.upsertRoom(detail)
  setSelected(detail)
}

async function refreshSelectedRoom(
  store: RoomsStore,
  roomId: string,
  setSelected: (room: BuzzRoom | ((current: BuzzRoom | null) => BuzzRoom | null)) => void
): Promise<void> {
  try {
    const detail = await desktopBuzzClient().getRoom({ roomId })
    store.upsertRoom(detail)
    setSelected(current => (current && current.id === roomId ? detail : current))
  } catch {
    /* keep the last painted room if the refresh misses */
  }
}

export function AgentEditorRoomsMount({
  bot,
  connectionId,
  profile
}: {
  bot?: { name?: string; connectionId?: string; route?: { connectionId?: string; profile?: string } }
  connectionId?: string
  profile?: string
}) {
  const search = useRoomsSearch()
  const requestedBot = botIdFromMembershipSearch(search)
  const [manifest, setManifest] = useState<WorkspaceManifest>({ version: 1, rooms: [] })
  const [liveRooms, setLiveRooms] = useState<BuzzRoom[]>([])
  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const client = desktopBuzzClient()
        const nextManifest = await client.getWorkspaceManifest()
        const page = await client.listRooms()

        if (cancelled) {return}
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

  const selected = {
    connectionId: connectionId || bot?.route?.connectionId || bot?.connectionId || host.state.connectionId.get() || undefined,
    profile: profile || bot?.route?.profile || bot?.name || requestedBot || undefined
  }

  const agentRecord = selectMembershipAgent((manifest.agents || []) as Array<WorkspaceAgent & { pubkey?: string }>, selected)

  if (!agentRecord) {
    return <div className="p-4 text-sm text-(--ui-text-secondary)">Select a bot in the Agent Editor to manage rooms</div>
  }

  const pubkey = resolveAgentPubkey(agentRecord, liveRooms)

  if (!pubkey) {
    return <div className="p-4 text-sm text-(--ui-text-secondary)">No Buzz pubkey for {agentRecord.profile}</div>
  }

  return (
    <RoomMemberships
      agent={{
        id: agentRecord.id,
        connectionId: agentRecord.connectionId,
        profile: agentRecord.profile,
        pubkey
      }}
      liveRooms={liveRooms}
      manifest={manifest}
      onToggle={async input => {
        const client = desktopBuzzClient()
        const current = (manifest.rooms || []).find(room => room.id === input.roomId)?.memberAgentIds || []

        const memberAgentIds = input.add
          ? [...new Set([...current, agentRecord.id])]
          : current.filter(id => id !== agentRecord.id && id !== pubkey)

        const next = await applyRoomMembership(client, {
          roomId: input.roomId,
          pubkey,
          agentId: agentRecord.id,
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

const homeStore = new HomeStore()
const homeInbox = createPluginApprovalInbox()
let muteStorage: PluginContext['storage'] | null = null
let muteState: MuteState = { key: 'notification-mutes-v1:pantheon:local', mutedBots: [], mutedRooms: [] }

function currentMuteScope() {
  return {
    workspace: host.state.profile.get() || 'pantheon',
    connectionId: host.state.connectionId.get() || 'local'
  }
}

function refreshMuteScope() {
  if (!muteStorage) {return}
  muteState = mutesForCurrentScope(muteStorage, currentMuteScope(), muteState)
}

function navigateHome(href: string, owner?: { connectionId: string; profile: string }) {
  openHomeTarget(href, {
    navigate: path => host.navigate(path),
    openSession,
    setCronFocusJobId,
    openArtifact,
    owner
  })
}

function CronCenterRoute() {
  const store = useMemo(() => new CronCenterStore(new CronCenterApi()), [])
  const search = useRoomsSearch()
  const text = useCronCenterText()
  const initialJobKey = cronCenterJobKeyFromSearch(search)
  useEffect(() => {
    void store.refreshAll()

    const unsub =
      typeof host.onEvent === 'function'
        ? host.onEvent('cron.changed', () => {
            void store.refreshAll()
          })
        : () => undefined

    const tick = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {return}
      void store.refreshAll()
    }, 60_000)

    return () => {
      unsub()
      window.clearInterval(tick)
    }
  }, [store])

  return (
    <CronCenterPage
      initialJobKey={initialJobKey}
      onOpenOwnerChat={route => host.newChat(route)}
      store={store}
      text={text}
    />
  )
}

function HomeRoute() {
  const [cards, setCards] = useState(homeInbox.cards())
  const [busyId, setBusyId] = useState(homeInbox.busyId())
  const [errors, setErrors] = useState(homeInbox.errors())
  useEffect(
    () =>
      homeInbox.listen(() => {
        setCards(homeInbox.cards())
        setBusyId(homeInbox.busyId())
        setErrors(homeInbox.errors())
      }),
    []
  )

  return (
    <HomePage
      approvals={{
        busyId,
        cards,
        errors,
        onMute: target => {
          if (!muteStorage) {return}
          refreshMuteScope()
          muteState = muteScope(muteStorage, currentMuteScope(), target)
        },
        onNavigate: (card: ApprovalProjection) => {
          navigateHome(registeredHref('session', card.sessionId || card.id), card.owner)
        },
        onRespond: (card, choice) => {
          void homeInbox.respond(card, choice).then(() => {
            homeInbox.replace(collectApprovalInboxRows())
          })
        }
      }}
      onNavigate={href => navigateHome(href)}
      store={homeStore}
    />
  )
}

function bindHomeNotifications(ctx: PluginContext) {
  muteStorage = ctx.storage
  muteState = loadMutes(ctx.storage, currentMuteScope())
  const unsubProfile = host.state.profile.listen(() => refreshMuteScope())
  const unsubConnection = host.state.connectionId.listen(() => refreshMuteScope())

  const coordinator = new NotificationCoordinator({
    toast: input => {
      host.notify({
        kind: 'info',
        title: input.title,
        message: input.message || input.title || 'Needs you',
        action: { label: 'Open', onClick: input.onActivate }
      })
    },
    native: input => {
      ctx.os.notify({ title: input.title || 'Pantheon', body: input.message || input.title || 'Needs you', onActivate: input.onActivate })
    },
    navigate: href => navigateHome(href),
    focused: () => typeof document !== 'undefined' && document.hasFocus(),
    mutes: () => {
      refreshMuteScope()

      return muteState
    },
    onRefresh: () => {
      homeInbox.replace(collectApprovalInboxRows())
    }
  })

  const runtime = startHomeIngestion({
    store: homeStore,
    listEvents: collectAuthoritativeHomeEvents,
    subscribe: subscribeAuthoritativeHomeSources,
    onHydrate: events => {
      coordinator.hydrate(
        events.flatMap(event => {
          const next = toNotificationEvent(event)

          return next ? [next] : []
        })
      )
      homeInbox.replace(collectApprovalInboxRows())
    },
    notifications: {
      subscribe: ingest =>
        subscribeAuthoritativeHomeSources(events => {
          applyHomeSourceSnapshot(events, {
            replaceInbox: rows => homeInbox.replace(rows),
            ingestNotification: ingest
          })
        }),
      ingest: event => coordinator.ingest(event as Parameters<NotificationCoordinator['ingest']>[0])
    }
  })

  runtime.startNotifications()

  return () => {
    unsubProfile()
    unsubConnection()
    runtime.dispose()
    coordinator.dispose()
  }
}

const plugin: HermesPlugin = {
  id: 'pantheon-workspace',
  name: 'Pantheon Rooms',
  description: 'Unified Buzz rooms through the key-safe local sidecar.',
  defaultEnabled: true,
  register(ctx) {
    ;(globalThis as { __PantheonAgentRooms?: typeof AgentEditorRoomsMount }).__PantheonAgentRooms =
      AgentEditorRoomsMount
    const disposeNotifications = bindHomeNotifications(ctx)
    ctx.i18n.register(CRON_CENTER_LOCALES)
    ctx.registerMany([
      {
        id: 'home-page',
        area: ROUTES_AREA,
        data: { path: '/home' } satisfies RouteContribution,
        render: () => <HomeRoute />
      },
      {
        id: 'home-nav',
        area: SIDEBAR_NAV_AREA,
        // Host sidebar renders [...SIDEBAR_NAV, ...contributions]. There is no
        // contribution placement API that inserts before permanent items.
        order: 20,
        data: { codicon: 'home', label: 'Home', path: '/home' } satisfies SidebarNavContribution
      },
      {
        id: 'cron-center-page',
        area: ROUTES_AREA,
        data: { path: '/cron-center' } satisfies RouteContribution,
        render: () => <CronCenterRoute />
      },
      {
        id: 'cron-center-nav',
        area: SIDEBAR_NAV_AREA,
        order: 22,
        data: { codicon: 'clock', label: 'Cron Center', path: '/cron-center' } satisfies SidebarNavContribution
      },
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
        render: () => <AgentEditorRoomsMount />
      }
    ])
    ctx.onDispose(() => {
      disposeNotifications()
      delete (globalThis as { __PantheonAgentRooms?: typeof AgentEditorRoomsMount }).__PantheonAgentRooms
      const path = window.location.pathname

      if (typeof host.navigate === 'function' && (path.startsWith('/rooms') || path === '/home' || path.startsWith('/cron-center'))) {
        host.navigate('/')
      }
    })
  }
}

export default plugin
