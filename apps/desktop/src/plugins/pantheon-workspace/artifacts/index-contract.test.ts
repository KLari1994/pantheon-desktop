import { expect, test } from 'vitest'

import { filterArtifactIndex, indexArtifact, type IndexedArtifact } from './index-contract'

function item(overrides: Partial<IndexedArtifact> & Pick<IndexedArtifact, 'id'>): IndexedArtifact {
  return {
    agent: 'ops',
    fileType: 'pdf',
    machine: 'lab-1',
    office: 'machine-room',
    pr: '14',
    project: 'pantheon-desktop',
    room: 'room-a',
    session: 'sess-1',
    title: 'report.pdf',
    ...overrides
  }
}

test('one shared index filters agent, office, project, PR, room, session, machine, and file type', () => {
  const items = [
    item({ id: 'a', agent: 'ops', fileType: 'pdf', project: 'pantheon-desktop' }),
    item({ id: 'b', agent: 'zeus', fileType: 'png', project: 'crm', room: 'room-b', session: 'sess-2' })
  ]

  expect(filterArtifactIndex(items, { agent: 'ops' }).map(row => row.id)).toEqual(['a'])
  expect(filterArtifactIndex(items, { fileType: 'png' }).map(row => row.id)).toEqual(['b'])
  expect(filterArtifactIndex(items, { project: 'pantheon-desktop', pr: '14' }).map(row => row.id)).toEqual(['a'])
  expect(filterArtifactIndex(items, { office: 'machine-room', machine: 'lab-1' }).map(row => row.id)).toEqual([
    'a',
    'b'
  ])
  expect(filterArtifactIndex(items, { room: 'room-b', session: 'sess-2' }).map(row => row.id)).toEqual(['b'])
})

test('indexArtifact projects an existing record without creating a second store', () => {
  const indexed = indexArtifact({
    href: '/tmp/report.pdf',
    id: 'legacy-1',
    kind: 'file',
    label: 'report.pdf',
    sessionId: 'sess-1',
    sessionTitle: 'Ops chat',
    timestamp: 1,
    value: '/tmp/report.pdf',
    source: {
      kind: 'session',
      connectionId: 'homelab',
      profile: 'ops',
      storedSessionId: 'sess-1',
      machine: 'lab-1'
    }
  })

  expect(indexed).toMatchObject({
    agent: 'ops',
    fileType: 'pdf',
    id: 'legacy-1',
    machine: 'lab-1',
    session: 'sess-1'
  })
})
