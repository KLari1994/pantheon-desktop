import { expect, test, vi } from 'vitest'

import { applyRoomMembership } from './store'

test('routes exact pubkey and rolls back the manifest when the relay write fails', async () => {
  const calls: unknown[] = []
  const api = {
    updateRoomMembership: vi.fn(async input => {
      calls.push(['manifest', input])
      return { version: 1, rooms: [{ id: input.roomId, memberAgentIds: input.memberAgentIds }] }
    }),
    inviteMember: vi.fn(async input => {
      calls.push(['invite', input])
      throw new Error('relay_down')
    }),
    removeMember: vi.fn()
  }
  await expect(
    applyRoomMembership(api, { roomId: 'room-a', pubkey: 'pk-exact', memberAgentIds: ['pk-exact'], add: true })
  ).rejects.toThrow(/relay_down/)
  expect(api.inviteMember).toHaveBeenCalledWith({ roomId: 'room-a', pubkey: 'pk-exact' })
  expect(api.updateRoomMembership).toHaveBeenCalledTimes(2)
  expect((api.updateRoomMembership.mock.calls[1]?.[0] as { memberAgentIds: string[] }).memberAgentIds).toEqual([])
})
