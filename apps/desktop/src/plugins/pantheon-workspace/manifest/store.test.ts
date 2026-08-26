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
    applyRoomMembership(api, {
      roomId: 'room-a',
      pubkey: 'pk-exact',
      agentId: 'agent-ops',
      memberAgentIds: ['agent-ops'],
      add: true
    })
  ).rejects.toThrow(/relay_down/)
  expect(api.inviteMember).toHaveBeenCalledWith({ roomId: 'room-a', pubkey: 'pk-exact' })
  expect(api.updateRoomMembership).toHaveBeenCalledTimes(2)
  expect((api.updateRoomMembership.mock.calls[1]?.[0] as { memberAgentIds: string[] }).memberAgentIds).toEqual([])
})

test('failed remove rolls back the agent id, not the pubkey', async () => {
  const api = {
    updateRoomMembership: vi.fn(async input => ({
      version: 1,
      rooms: [{ id: input.roomId, memberAgentIds: input.memberAgentIds }]
    })),
    inviteMember: vi.fn(),
    removeMember: vi.fn(async () => {
      throw new Error('relay_down')
    })
  }

  await expect(
    applyRoomMembership(api, {
      roomId: 'room-a',
      pubkey: 'pk-exact',
      agentId: 'agent-ops',
      memberAgentIds: ['alice'],
      add: false
    })
  ).rejects.toThrow(/relay_down/)
  expect((api.updateRoomMembership.mock.calls[1]?.[0] as { memberAgentIds: string[] }).memberAgentIds).toEqual([
    'alice',
    'agent-ops'
  ])
})
