import type { PantheonBuzzApi, WorkspaceManifest } from '@hermes/plugin-sdk'

import { parseWorkspaceManifest } from './schema'

export async function applyRoomMembership(
  api: Pick<PantheonBuzzApi, 'updateRoomMembership' | 'inviteMember' | 'removeMember'>,
  input: { roomId: string; pubkey: string; agentId: string; memberAgentIds: string[]; add: boolean }
): Promise<WorkspaceManifest> {
  const manifest = await api.updateRoomMembership({
    roomId: input.roomId,
    memberAgentIds: input.memberAgentIds
  })

  try {
    if (input.add) {
      await api.inviteMember({ roomId: input.roomId, pubkey: input.pubkey })
    } else {
      await api.removeMember({ roomId: input.roomId, pubkey: input.pubkey })
    }

    return parseWorkspaceManifest(manifest)
  } catch (error) {
    await api.updateRoomMembership({
      roomId: input.roomId,
      memberAgentIds: input.add
        ? input.memberAgentIds.filter(id => id !== input.agentId)
        : [...input.memberAgentIds, input.agentId]
    })
    throw error
  }
}
