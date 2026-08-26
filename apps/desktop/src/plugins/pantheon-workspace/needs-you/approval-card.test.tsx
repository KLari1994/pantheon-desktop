import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { ApprovalCard } from './approval-card'
import type { ApprovalProjection } from './approval-projections'

afterEach(() => cleanup())

const card: ApprovalProjection = {
  id: 'approval:req-1',
  agent: 'Daedalus',
  context: 'room/ops',
  action: 'git push',
  machine: 'windows-workstation',
  sessionId: 'sess-1',
  requestId: 'req-1',
  choices: ['once', 'session', 'deny'],
  botId: 'bot-daedalus'
}

test('renders agent, context, action, machine, and accessible actions', () => {
  render(<ApprovalCard card={card} onRespond={() => undefined} />)
  expect(screen.getByText('Daedalus')).toBeTruthy()
  expect(screen.getByText('room/ops')).toBeTruthy()
  expect(screen.getByText('git push')).toBeTruthy()
  expect(screen.getByText('windows-workstation')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Allow once' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Allow for this session' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Deny' })).toBeTruthy()
  expect(screen.getByText('Needs input')).toBeTruthy()
})

test('busy state disables actions and exposes a textual status', () => {
  render(<ApprovalCard busy="once" card={card} onRespond={() => undefined} />)
  expect(screen.getByRole('button', { name: 'Allow once' })).toHaveProperty('disabled', true)
  expect(screen.getByText('Submitting')).toBeTruthy()
})

test('error state keeps the card and is not color-only', () => {
  render(<ApprovalCard card={card} error="gateway down" onRespond={() => undefined} />)
  expect(screen.getByText('gateway down')).toBeTruthy()
  expect(screen.getByText('Needs retry')).toBeTruthy()
})

test('once, session, and deny fire exact callbacks', () => {
  const onRespond = vi.fn()
  render(<ApprovalCard card={card} onRespond={onRespond} />)
  fireEvent.click(screen.getByRole('button', { name: 'Allow once' }))
  fireEvent.click(screen.getByRole('button', { name: 'Allow for this session' }))
  fireEvent.click(screen.getByRole('button', { name: 'Deny' }))
  expect(onRespond.mock.calls).toEqual([['once'], ['session'], ['deny']])
})
