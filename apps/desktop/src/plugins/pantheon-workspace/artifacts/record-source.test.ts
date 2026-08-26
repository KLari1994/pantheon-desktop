import { collectArtifactsForSession, type SessionInfo } from '@hermes/plugin-sdk'
import { expect, test } from 'vitest'

import { artifactIdentityKey, sessionArtifactSource } from './provenance'

function session(overrides: Partial<SessionInfo> = {}): SessionInfo {
  return {
    connection_id: 'homelab',
    ended_at: null,
    id: 'sess-1',
    input_tokens: 0,
    is_active: false,
    last_active: 1000,
    message_count: 1,
    model: null,
    output_tokens: 0,
    preview: null,
    profile: 'ops',
    source: null,
    started_at: 1000,
    title: 'Ops chat',
    tool_call_count: 0,
    ...overrides
  }
}

test('collected artifacts keep the owning connection and profile on the existing record', () => {
  const [artifact] = collectArtifactsForSession(session(), [
    { content: 'Created /tmp/report.pdf', role: 'assistant', timestamp: 2000 }
  ])

  expect(artifact?.connectionId).toBe('homelab')
  expect(artifact?.profile).toBe('ops')
  expect(artifactIdentityKey(sessionArtifactSource({
    connectionId: artifact!.connectionId!,
    profile: artifact!.profile!,
    storedSessionId: artifact!.sessionId
  }))).toContain('homelab')
})

test('the same stored session id on two connections stays distinct after collection', () => {
  const local = collectArtifactsForSession(session({ connection_id: 'local' }), [
    { content: 'Created /tmp/report.pdf', role: 'assistant', timestamp: 2000 }
  ])[0]

  const remote = collectArtifactsForSession(session({ connection_id: 'homelab' }), [
    { content: 'Created /tmp/report.pdf', role: 'assistant', timestamp: 2000 }
  ])[0]

  expect(local?.sessionId).toBe(remote?.sessionId)
  expect(local?.connectionId).not.toBe(remote?.connectionId)
})
