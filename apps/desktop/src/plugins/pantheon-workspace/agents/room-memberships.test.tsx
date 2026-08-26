import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { RoomMemberships } from './room-memberships'

afterEach(() => cleanup())

test('lists manifest and live rooms and toggles with exact connection/profile/pubkey', () => {
  const onToggle = vi.fn()
  render(
    <RoomMemberships
      agent={{ id: 'agent-1', connectionId: 'conn-9', profile: 'ops', pubkey: 'pk-1' }}
      liveRooms={[{ id: 'room-b', name: 'Ops', members: [] }]}
      manifest={{ version: 1, rooms: [{ id: 'room-a', name: 'General', memberAgentIds: ['pk-1'] }] }}
      onToggle={onToggle}
    />
  )
  expect(screen.getByText('General')).toBeTruthy()
  expect(screen.getByText('Ops')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Add to Ops' }))
  expect(onToggle).toHaveBeenCalledWith({
    roomId: 'room-b',
    pubkey: 'pk-1',
    connectionId: 'conn-9',
    profile: 'ops',
    add: true
  })
})
