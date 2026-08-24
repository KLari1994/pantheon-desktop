import { useEffect, useState } from 'react'

import {
  type HermesPlugin,
  host,
  type RouteContribution,
  ROUTES_AREA,
  SIDEBAR_NAV_AREA,
  type SidebarNavContribution
} from '@hermes/plugin-sdk'

import { desktopBuzzClient, type BuzzMessage, type BuzzRoom } from '@/pantheon/buzz-client'

import { ReadOnlyRoom } from './rooms/read-only-room'

function RoomsPage() {
  const [room, setRoom] = useState<BuzzRoom | null>(null)
  const [messages, setMessages] = useState<BuzzMessage[]>([])
  const [status, setStatus] = useState('connecting')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const client = desktopBuzzClient()
        const nextStatus = await client.status()
        const page = await client.listRooms()
        const selected = page.rooms[0]
        if (!selected) {
          if (!cancelled) {
            setStatus(nextStatus.state)
            setError('No visible Buzz rooms')
          }
          return
        }
        const detail = await client.getRoom({ roomId: selected.id })
        const window = await client.getMessages({ roomId: selected.id, limit: 50 })
        if (!cancelled) {
          setStatus(nextStatus.state)
          setRoom(detail)
          setMessages(window.messages)
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
  }, [])

  if (error) {
    return <div className="p-4 text-sm text-(--ui-text-secondary)">{error}</div>
  }
  if (!room) {
    return <div className="p-4 text-sm text-(--ui-text-secondary)">Loading rooms…</div>
  }
  return <ReadOnlyRoom messages={messages} room={room} status={status} />
}

const plugin: HermesPlugin = {
  id: 'pantheon-workspace',
  name: 'Pantheon Rooms',
  description: 'Read-only Buzz rooms through the key-safe local sidecar.',
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
