import { Button } from '@hermes/plugin-sdk'

import type { BuzzRoom, WorkspaceManifest } from '@/pantheon/buzz-client'

export interface RoomMembershipAgent {
  id: string
  connectionId: string
  profile: string
  pubkey: string
}

export function RoomMemberships({
  agent,
  manifest,
  liveRooms,
  onToggle
}: {
  agent: RoomMembershipAgent
  manifest: WorkspaceManifest
  liveRooms: BuzzRoom[]
  onToggle: (input: {
    roomId: string
    pubkey: string
    connectionId: string
    profile: string
    add: boolean
  }) => void
}) {
  const listed = new Map<string, string>()
  for (const room of manifest.rooms || []) listed.set(room.id, room.name || room.id)
  for (const room of liveRooms) listed.set(room.id, room.name)
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">Room memberships</h3>
      {[...listed.entries()].map(([id, name]) => {
        const inManifest = (manifest.rooms || []).some(room => room.id === id && room.memberAgentIds?.includes(agent.pubkey))
        const live = liveRooms.find(room => room.id === id)?.members.some(member => member.pubkey === agent.pubkey)
        const member = Boolean(inManifest || live)
        return (
          <div key={id} className="flex items-center justify-between gap-2 text-sm">
            <span>{name}</span>
            <span className="text-xs text-(--ui-text-tertiary)">{member ? 'member' : 'out'}</span>
            <Button
              type="button"
              onClick={() =>
                onToggle({
                  roomId: id,
                  pubkey: agent.pubkey,
                  connectionId: agent.connectionId,
                  profile: agent.profile,
                  add: !member
                })
              }
            >
              {member ? `Remove from ${name}` : `Add to ${name}`}
            </Button>
          </div>
        )
      })}
    </section>
  )
}
