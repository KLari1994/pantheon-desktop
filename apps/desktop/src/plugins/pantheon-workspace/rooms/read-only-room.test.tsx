import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'

import { ReadOnlyRoom } from './read-only-room'

afterEach(() => {
  cleanup()
})

const room = {
  id: 'room-a',
  name: 'General',
  members: [{ pubkey: 'alice', name: 'Alice' }]
}

const messages = [
  { id: 'evt-1', roomId: 'room-a', content: 'signed hello', createdAt: 1, author: 'Alice' }
]

test('renders a signed read-only room with members and disabled send', () => {
  render(<ReadOnlyRoom room={room} messages={messages} status="open" />)
  expect(screen.getByRole('heading', { name: 'General' })).toBeTruthy()
  expect(screen.getAllByText('Alice').length).toBeGreaterThan(0)
  expect(screen.getByText('signed hello')).toBeTruthy()
  const send = screen.getByRole('button', { name: 'Send' })
  expect(send).toHaveProperty('disabled', true)
})

test('does not expose a credential control', () => {
  render(<ReadOnlyRoom room={room} messages={messages} status="open" />)
  expect(screen.queryByText(/credential/i)).toBeNull()
  expect(screen.queryByRole('button', { name: /set key/i })).toBeNull()
})
