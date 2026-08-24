import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'

import { RoomWorkspace } from './room-workspace'

afterEach(() => cleanup())

const room = {
  id: 'room-a',
  name: 'General',
  kind: 'office',
  selfRole: 'member',
  members: [{ pubkey: 'alice', name: 'Alice', role: 'admin' }]
}

test('role-gates invite and remove, shows TTL-less chat, and hides credential UI', () => {
  render(
    <RoomWorkspace
      room={room}
      messages={[{ id: 'evt-1', roomId: 'room-a', content: 'hello', createdAt: 1, author: 'Alice', threadRootId: 'evt-1' }]}
      reactions={[{ id: 'r1', targetEventId: 'evt-1', emoji: '👍', author: 'bob' }]}
      relayOpen
      hasCredential
      onSend={() => undefined}
    />
  )
  expect(screen.getByRole('heading', { name: 'General' })).toBeTruthy()
  expect((screen.getByRole('button', { name: 'Invite' }) as HTMLButtonElement).disabled).toBe(true)
  expect((screen.getByRole('button', { name: 'Remove' }) as HTMLButtonElement).disabled).toBe(true)
  expect(screen.queryByText(/set key/i)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Thread' }))
  expect(screen.getByText('hello')).toBeTruthy()
})
