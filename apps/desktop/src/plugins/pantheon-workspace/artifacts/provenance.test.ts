import { expect, test } from 'vitest'

import {
  artifactIdentityKey,
  openArtifactSource,
  type PantheonArtifactSource,
  sessionArtifactSource
} from './provenance'

test('duplicate stored session ids on different routes never share an identity key', () => {
  const local = sessionArtifactSource({
    connectionId: 'local',
    profile: 'ops',
    storedSessionId: 'sess-1'
  })
  const remote = sessionArtifactSource({
    connectionId: 'homelab',
    profile: 'ops',
    storedSessionId: 'sess-1'
  })

  expect(artifactIdentityKey(local)).not.toBe(artifactIdentityKey(remote))
  expect(artifactIdentityKey(local)).toContain('local')
  expect(artifactIdentityKey(remote)).toContain('homelab')
})

test('remote file open uses the owning route, not the ambient profile', () => {
  const opened: Array<{ connectionId: string; profile: string; path: string }> = []
  const source: PantheonArtifactSource = {
    kind: 'file',
    connectionId: 'homelab',
    profile: 'ops',
    path: '/tmp/report.pdf',
    machine: 'lab-1'
  }

  openArtifactSource(source, {
    openRemotePath: (route, path) => {
      opened.push({ ...route, path })
    },
    navigate: () => {
      throw new Error('must not fall back to ambient navigation')
    }
  })

  expect(opened).toEqual([{ connectionId: 'homelab', profile: 'ops', path: '/tmp/report.pdf' }])
})

test('room artifact source opens the exact room and message ids', () => {
  const hrefs: string[] = []
  const source: PantheonArtifactSource = {
    kind: 'room',
    roomId: 'room-a',
    messageId: 'evt-42',
    machine: 'relay'
  }

  openArtifactSource(source, {
    navigate: href => hrefs.push(href)
  })

  expect(hrefs).toEqual(['/rooms?room=room-a&message=evt-42'])
})

test('room navigation without a concrete message id does not invent message=latest', () => {
  const hrefs: string[] = []

  openArtifactSource(
    { kind: 'room', roomId: 'room-a', machine: 'relay' },
    { navigate: href => hrefs.push(href) }
  )
  openArtifactSource(
    { kind: 'room', roomId: 'room-a', messageId: 'latest', machine: 'relay' },
    { navigate: href => hrefs.push(href) }
  )

  expect(hrefs).toEqual(['/rooms?room=room-a', '/rooms?room=room-a'])
  expect(hrefs.every(href => !href.includes('message=latest'))).toBe(true)
})

test('ambiguous file source fails closed instead of using the active profile', () => {
  expect(() =>
    openArtifactSource(
      { kind: 'file', connectionId: '', profile: 'ops', path: '/tmp/x.pdf' },
      { openRemotePath: () => undefined, navigate: () => undefined }
    )
  ).toThrow(/owning route/i)
})
