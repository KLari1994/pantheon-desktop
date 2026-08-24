import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { ApprovalInbox } from './approval-inbox'
import { NeedsYouList } from './needs-you-list'
import { projectApproval, type ApprovalOwnerRoute, type ApprovalSource } from './approval-projections'

afterEach(() => cleanup())

const owner: ApprovalOwnerRoute = { connectionId: 'conn-a', profile: 'daedalus', machine: 'win' }

const request: ApprovalSource = {
  requestId: 'req-1',
  sessionId: 'sess-1',
  command: 'rm',
  description: 'delete'
}

test('one owner-routed response removes every copy with a single backend call', async () => {
  const calls: unknown[] = []
  const cleared: unknown[] = []
  const inbox = new ApprovalInbox({
    requestOwned: async (sessionId, method, params) => {
      calls.push({ sessionId, method, params })
      return { resolved: true }
    },
    clear: (sessionId, requestId) => {
      cleared.push({ sessionId, requestId })
    }
  })
  const inline = projectApproval(request, {
    agent: 'Daedalus',
    context: 'inline',
    machine: 'win',
    owner,
    botId: 'bot-daedalus',
    roomId: 'room-ops'
  })
  const central = projectApproval(request, {
    agent: 'Daedalus',
    context: 'needs-you',
    machine: 'win',
    owner,
    botId: 'bot-daedalus',
    roomId: 'room-ops'
  })
  inbox.replace([
    { request, card: inline },
    { request, card: central }
  ])
  expect(inbox.cards()).toHaveLength(1)
  const result = await inbox.respond(inline, 'once')
  expect(result.ok).toBe(true)
  expect(calls).toHaveLength(1)
  expect(calls[0]).toEqual({
    sessionId: 'sess-1',
    method: 'approval.respond',
    params: { choice: 'once', request_id: 'req-1', session_id: 'sess-1' }
  })
  expect(cleared).toEqual([{ sessionId: 'sess-1', requestId: 'req-1' }])
  expect(inbox.cards()).toEqual([])
})

test('mute clicks pass stable bot and room ids, not display labels', () => {
  const onMute = vi.fn()
  const card = projectApproval(request, {
    agent: 'Daedalus',
    context: 'session sess-1',
    machine: 'win',
    owner,
    botId: 'bot-daedalus',
    roomId: 'room-ops'
  })
  render(
    <NeedsYouList
      cards={[card]}
      onNavigate={() => undefined}
      onRespond={() => undefined}
      onMute={onMute}
    />
  )
  fireEvent.click(screen.getByRole('button', { name: 'Mute notifications from Daedalus' }))
  fireEvent.click(screen.getByRole('button', { name: 'Mute notifications from session sess-1' }))
  expect(onMute).toHaveBeenCalledWith({ kind: 'bot', id: 'bot-daedalus' })
  expect(onMute).toHaveBeenCalledWith({ kind: 'room', id: 'room-ops' })
})
