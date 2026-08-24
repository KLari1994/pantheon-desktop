import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { RoomComposer } from './room-composer'

afterEach(() => cleanup())

test('enter sends and failed sends offer retry/remove', () => {
  const onSend = vi.fn()
  const onRetry = vi.fn()
  render(
    <RoomComposer
      members={[{ pubkey: 'alice', name: 'Alice' }]}
      failed={{ id: 'pending:1', roomId: 'room-a', content: 'x', createdAt: 1, author: 'you', outgoing: 'failed' }}
      onSend={onSend}
      onRetry={onRetry}
    />
  )
  const box = screen.getByLabelText('Room message')
  fireEvent.change(box, { target: { value: 'hello @Alice' } })
  fireEvent.keyDown(box, { key: 'Enter' })
  expect(onSend).toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(onRetry).toHaveBeenCalled()
})
