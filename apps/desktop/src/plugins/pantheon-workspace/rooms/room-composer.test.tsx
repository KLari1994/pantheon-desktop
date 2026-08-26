import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { RoomComposer } from './room-composer'

afterEach(() => cleanup())

test('enter sends and failed sends offer retry/remove', () => {
  const onSend = vi.fn()
  const onRetry = vi.fn()
  render(
    <RoomComposer
      failed={{ id: 'pending:1', roomId: 'room-a', content: 'x', createdAt: 1, author: 'you', outgoing: 'failed' }}
      members={[{ pubkey: 'alice', name: 'Alice' }]}
      onRetry={onRetry}
      onSend={onSend}
    />
  )
  const box = screen.getByLabelText('Room message')
  fireEvent.change(box, { target: { value: 'hello @Alice' } })
  fireEvent.keyDown(box, { key: 'Enter' })
  expect(onSend).toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(onRetry).toHaveBeenCalled()
})

test('room composer exposes dictation without auto-speaking', () => {
  render(<RoomComposer members={[{ pubkey: 'alice', name: 'Alice' }]} onSend={vi.fn()} />)
  expect(screen.getByRole('button', { name: 'Dictate' })).toBeTruthy()
})

test('composer can attach a descriptor and keep thread root', () => {
  const onSend = vi.fn()
  render(<RoomComposer members={[{ pubkey: 'alice', name: 'Alice' }]} onSend={onSend} threadRootId="evt-1" />)
  fireEvent.change(screen.getByLabelText('Attachment URL'), { target: { value: 'https://files.example/a.png' } })
  fireEvent.change(screen.getByLabelText('Attachment MIME type'), { target: { value: 'image/png' } })
  fireEvent.change(screen.getByLabelText('Room message'), { target: { value: 'see this' } })
  fireEvent.keyDown(screen.getByLabelText('Room message'), { key: 'Enter' })
  expect(onSend).toHaveBeenCalledWith('see this', [], {
    threadRootId: 'evt-1',
    attachments: [{ url: 'https://files.example/a.png', mimeType: 'image/png', name: undefined }]
  })
})
