import { expect, test } from 'vitest'

import {
  approvalLogicalId,
  type ApprovalOwnerRoute,
  projectApproval,
  respondToApproval
} from './approval-projections'

const owner: ApprovalOwnerRoute = { connectionId: 'conn-a', profile: 'daedalus', machine: 'win' }

test('one logical item per requestId across inline and centralized surfaces', () => {
  const request = { requestId: 'req-1', sessionId: 'sess-1', command: 'rm', description: 'delete' }
  expect(approvalLogicalId(request, owner)).toBe('approval:req-1')
  expect(approvalLogicalId(request, { ...owner, profile: 'inline' })).toBe('approval:req-1')
})

test('legacy id-free fallback is scoped to owner route plus session', () => {
  expect(approvalLogicalId({ sessionId: 'sess-1', command: 'rm', description: 'x' }, owner)).toBe(
    'approval-legacy:conn-a:daedalus:sess-1'
  )
})

test('projected approval names agent, room/session, action, and machine', () => {
  const card = projectApproval(
    {
      requestId: 'req-2',
      sessionId: 'sess-9',
      command: 'git push',
      description: 'push staging',
      choices: ['once', 'session', 'deny']
    },
    { agent: 'Daedalus', context: 'room/ops', machine: 'windows-workstation', owner }
  )

  expect(card).toMatchObject({
    id: 'approval:req-2',
    agent: 'Daedalus',
    context: 'room/ops',
    action: 'git push',
    machine: 'windows-workstation',
    choices: ['once', 'session', 'deny']
  })
})

test('choices stay within once, session, and deny even if backend also offers always', () => {
  const card = projectApproval(
    { requestId: 'req-3', sessionId: 's', command: 'x', description: 'y', choices: ['once', 'session', 'always', 'deny'] },
    { agent: 'A', context: 'c', machine: 'm', owner }
  )

  expect(card.choices).toEqual(['once', 'session', 'deny'])
})

test('in-flight guard prevents double submission', async () => {
  const calls: unknown[] = []
  const inFlight = new Set<string>()
  const request = { requestId: 'req-4', sessionId: 'sess-4', command: 'x', description: 'y' }

  const first = respondToApproval({ request, choice: 'once', owner, inFlight }, {
    requestOwned: async (...args) => {
      calls.push(args)

      return { resolved: true }
    },
    clear: () => undefined
  })

  const second = await respondToApproval({ request, choice: 'deny', owner, inFlight }, {
    requestOwned: async (...args) => {
      calls.push(args)

      return { resolved: true }
    },
    clear: () => undefined
  })

  expect(second.ok).toBe(false)

  if (second.ok === false) {expect(second.reason).toBe('in-flight')}
  await first
  expect(calls).toHaveLength(1)
})

test('respond routes approval.respond through the session owner with request_id and session_id', async () => {
  const calls: unknown[] = []
  const request = { requestId: 'req-5', sessionId: 'sess-5', command: 'x', description: 'y' }

  const result = await respondToApproval(
    { request, choice: 'session', owner, inFlight: new Set() },
    {
      requestOwned: async (sessionId, method, params) => {
        calls.push({ sessionId, method, params })

        return { resolved: true }
      },
      clear: () => undefined
    }
  )

  expect(result.ok).toBe(true)
  expect(calls).toEqual([
    {
      sessionId: 'sess-5',
      method: 'approval.respond',
      params: { choice: 'session', request_id: 'req-5', session_id: 'sess-5' }
    }
  ])
})

test('successful resolution clears the shared prompt and every Home projection of that id', async () => {
  const cleared: unknown[] = []
  const request = { requestId: 'req-6', sessionId: 'sess-6', command: 'x', description: 'y' }

  const result = await respondToApproval(
    { request, choice: 'deny', owner, inFlight: new Set() },
    {
      requestOwned: async () => ({ resolved: true }),
      clear: (sessionId, requestId) => cleared.push({ sessionId, requestId })
    }
  )

  expect(result.ok).toBe(true)
  expect(result.settledId).toBe('approval:req-6')
  expect(cleared).toEqual([{ sessionId: 'sess-6', requestId: 'req-6' }])
})

test('stale success from an older request never clears a newer request', async () => {
  const cleared: unknown[] = []
  const older = { requestId: 'req-old', sessionId: 'sess-7', command: 'old', description: 'old' }
  const newer = { requestId: 'req-new', sessionId: 'sess-7', command: 'new', description: 'new' }
  let current = newer

  const result = await respondToApproval(
    { request: older, choice: 'once', owner, inFlight: new Set(), currentRequest: () => current },
    {
      requestOwned: async () => ({ resolved: true }),
      clear: (sessionId, requestId) => cleared.push({ sessionId, requestId })
    }
  )

  expect(result.ok).toBe(false)

  if (result.ok === false) {expect(result.reason).toBe('stale')}
  expect(cleared).toEqual([])
})

test('failed responses retain the card with a recoverable error', async () => {
  const cleared: unknown[] = []
  const request = { requestId: 'req-8', sessionId: 'sess-8', command: 'x', description: 'y' }

  const result = await respondToApproval(
    { request, choice: 'once', owner, inFlight: new Set() },
    {
      requestOwned: async () => {
        throw new Error('gateway down')
      },
      clear: (sessionId, requestId) => cleared.push({ sessionId, requestId })
    }
  )

  expect(result.ok).toBe(false)

  if (result.ok === false) {expect(result.error).toBe('gateway down')}
  expect(result.settledId).toBeUndefined()
  expect(cleared).toEqual([])
})
