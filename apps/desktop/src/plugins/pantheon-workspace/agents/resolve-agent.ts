import type { BuzzRoom, WorkspaceAgent } from '@hermes/plugin-sdk'

export function isHexPubkey(value: string | undefined): boolean {
  return Boolean(value && /^[0-9a-f]{64}$/i.test(value))
}

export function selectMembershipAgent(
  agents: Array<WorkspaceAgent & { pubkey?: string }>,
  selected?: { id?: string; connectionId?: string; profile?: string } | null
): (WorkspaceAgent & { pubkey?: string }) | undefined {
  if (!agents.length) {return undefined}

  if (!selected) {return undefined}

  return agents.find(agent => {
    if (selected.id && agent.id === selected.id) {return true}

    if (selected.connectionId && selected.profile) {
      return agent.connectionId === selected.connectionId && agent.profile === selected.profile
    }

    if (selected.profile) {return agent.profile === selected.profile}

    return false
  })
}

export function resolveAgentPubkey(
  agent: { id: string; profile: string; pubkey?: string },
  liveRooms: BuzzRoom[]
): string | undefined {
  if (agent.pubkey) {return agent.pubkey}

  for (const room of liveRooms) {
    const match = room.members.find(
      member => member.name === agent.profile || (isHexPubkey(agent.id) && member.pubkey === agent.id)
    )

    if (match) {return match.pubkey}
  }

  return isHexPubkey(agent.id) ? agent.id : undefined
}

export function resolveMemberAgent(
  member: { pubkey: string; name?: string },
  agents: Array<WorkspaceAgent & { pubkey?: string }>
): (WorkspaceAgent & { pubkey?: string }) | undefined {
  return agents.find(agent => {
    if (agent.pubkey && agent.pubkey === member.pubkey) {return true}

    if (member.name && agent.profile === member.name) {return true}

    return isHexPubkey(agent.id) && agent.id === member.pubkey
  })
}
