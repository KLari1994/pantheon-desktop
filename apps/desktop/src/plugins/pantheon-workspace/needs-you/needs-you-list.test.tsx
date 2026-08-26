import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import type { ApprovalProjection } from './approval-projections'
import { NeedsYouList } from './needs-you-list'

afterEach(() => cleanup())

const first: ApprovalProjection = {
  id: 'approval:req-1',
  agent: 'Daedalus',
  context: 'session sess-1',
  action: 'rm',
  machine: 'win',
  sessionId: 'sess-1',
  requestId: 'req-1',
  choices: ['once', 'session', 'deny'],
  botId: 'bot-daedalus'
}

const duplicate: ApprovalProjection = { ...first, context: 'inline copy' }

test('dedupes cards by logical approval id', () => {
  render(
    <NeedsYouList
      cards={[first, duplicate]}
      onMute={() => undefined}
      onNavigate={() => undefined}
      onRespond={() => undefined}
    />
  )
  expect(screen.getAllByText('rm')).toHaveLength(1)
})

test('navigates to the exact source only after an explicit click', () => {
  const onNavigate = vi.fn()
  render(<NeedsYouList cards={[first]} onMute={() => undefined} onNavigate={onNavigate} onRespond={() => undefined} />)
  expect(onNavigate).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Open Daedalus session sess-1' }))
  expect(onNavigate).toHaveBeenCalledWith(first)
})

test('settled cards disappear and empty state is shown', () => {
  const { rerender } = render(
    <NeedsYouList cards={[first]} onMute={() => undefined} onNavigate={() => undefined} onRespond={() => undefined} />
  )

  expect(screen.getByText('rm')).toBeTruthy()
  rerender(
    <NeedsYouList cards={[]} onMute={() => undefined} onNavigate={() => undefined} onRespond={() => undefined} />
  )
  expect(screen.queryByText('rm')).toBeNull()
  expect(screen.getByText('Nothing needs you')).toBeTruthy()
})

test('per-bot and per-room mutes exist and there is no estate-wide approve-all', () => {
  render(
    <NeedsYouList cards={[first]} onMute={() => undefined} onNavigate={() => undefined} onRespond={() => undefined} />
  )
  expect(screen.getByRole('button', { name: 'Mute notifications from Daedalus' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Mute notifications from session sess-1' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: /approve all/i })).toBeNull()
  expect(screen.queryByRole('button', { name: /allow all/i })).toBeNull()
})
