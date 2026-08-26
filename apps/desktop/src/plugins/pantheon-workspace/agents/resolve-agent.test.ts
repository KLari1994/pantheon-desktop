import { expect, test } from 'vitest'

import { resolveAgentPubkey, resolveMemberAgent, selectMembershipAgent } from './resolve-agent'

test('selects the named editor agent and never falls back to the first agent', () => {
  const agents = [
    { id: 'agent-1', connectionId: 'c1', profile: 'ops' },
    { id: 'agent-2', connectionId: 'c2', profile: 'research' }
  ]

  expect(selectMembershipAgent(agents)).toBeUndefined()
  expect(selectMembershipAgent(agents, { connectionId: 'c2', profile: 'research' })?.id).toBe('agent-2')
})

test('resolves buzz pubkey separately from manifest agent id', () => {
  expect(
    resolveAgentPubkey({ id: 'agent-2', profile: 'research' }, [
      { id: 'room-a', name: 'Ops', members: [{ pubkey: 'pk-research', name: 'research' }] }
    ])
  ).toBe('pk-research')
  expect(resolveAgentPubkey({ id: 'agent-2', profile: 'research' }, [])).toBeUndefined()
  expect(resolveAgentPubkey({ id: 'ab'.repeat(32), profile: 'ops' }, [])).toBe('ab'.repeat(32))
})

test('joins a room member to a workspace agent without treating pubkey as connectionId', () => {
  const agent = resolveMemberAgent({ pubkey: 'pk-research', name: 'research' }, [
    { id: 'agent-2', connectionId: 'c2', profile: 'research' }
  ])

  expect(agent).toMatchObject({ connectionId: 'c2', profile: 'research' })
})
