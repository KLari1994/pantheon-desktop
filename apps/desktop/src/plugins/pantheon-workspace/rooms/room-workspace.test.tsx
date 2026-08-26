import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

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
      hasCredential
      messages={[
        { id: 'evt-1', roomId: 'room-a', content: 'hello', createdAt: 1, author: 'Alice', threadRootId: 'evt-1' }
      ]}
      onSend={() => undefined}
      reactions={[{ id: 'r1', targetEventId: 'evt-1', emoji: '👍', author: 'bob' }]}
      relayOpen
      room={room}
    />
  )
  expect(screen.getByRole('heading', { name: 'General' })).toBeTruthy()
  expect((screen.getByRole('button', { name: 'Invite' }) as HTMLButtonElement).disabled).toBe(true)
  expect((screen.getByRole('button', { name: 'Remove' }) as HTMLButtonElement).disabled).toBe(true)
  expect(screen.queryByText(/set key/i)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Thread' }))
  expect(screen.getByText('hello')).toBeTruthy()
})

test('reactions can be removed and thread reply stays selected', () => {
  const onRemoveReaction = vi.fn()
  const onSend = vi.fn()
  render(
    <RoomWorkspace
      hasCredential
      messages={[
        { id: 'evt-1', roomId: 'room-a', content: 'hello', createdAt: 1, author: 'Alice', threadRootId: 'evt-1' }
      ]}
      onRemoveReaction={onRemoveReaction}
      onSend={onSend}
      reactions={[{ id: 'r1', targetEventId: 'evt-1', emoji: '👍', author: 'bob' }]}
      relayOpen
      room={{ ...room, selfRole: 'admin' }}
    />
  )
  fireEvent.click(screen.getByRole('button', { name: 'Remove 👍' }))
  expect(onRemoveReaction).toHaveBeenCalledWith('r1')
  fireEvent.click(screen.getByRole('button', { name: 'Thread' }))
  expect(screen.getByText('Replying in thread')).toBeTruthy()
})
