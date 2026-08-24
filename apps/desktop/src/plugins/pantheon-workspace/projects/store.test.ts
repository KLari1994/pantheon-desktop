import { expect, test } from 'vitest'

import { archiveProjectRoom } from './pr-lifecycle'
import {
  joinProjectRooms,
  parseBindingRecord,
  preflightWorktree,
  ProjectStore
} from './store'
import type { ProjectRoomBinding } from './types'

const worktree = '/opt/data/worktrees/pantheon-desktop/PAN-7'
const repo = '/opt/data/repos/pantheon-desktop'

const validRaw = {
  projectId: 'p_demo',
  projectName: 'Pantheon Desktop',
  buzzRoomId: 'room-pr-7',
  repoPath: repo,
  worktreePath: worktree,
  targetBranch: 'feat/PAN-7-projects-pr-rooms',
  baseBranch: 'staging',
  machine: {
    connectionId: 'homelab',
    machineId: 'install-aaa',
    profile: 'daedalus',
    label: 'Homelab / daedalus'
  },
  artifactIds: ['art-1'],
  evidence: { ci: { status: 'green' } },
  linearUrl: 'https://linear.app/syntropickelc/issue/PAN-7/task-7',
  lifecycle: 'working'
}

const linked = {
  path: worktree,
  branch: 'feat/PAN-7-projects-pr-rooms',
  detached: false,
  isMain: false,
  locked: false
}

test('valid test project joins one PR room to one linked worktree', () => {
  const parsed = parseBindingRecord(validRaw)
  expect(parsed.status).toBe('valid')
  if (parsed.status !== 'valid') {return}

  const joined = joinProjectRooms({
    bindings: [parsed.binding],
    projects: [{ id: 'p_demo', name: 'Pantheon Desktop', primary_path: repo }],
    rooms: [{ id: 'room-pr-7', name: 'PAN-7' }],
    trees: [{ id: 'p_demo', path: repo, repos: [{ path: repo }] }]
  })
  expect(joined).toHaveLength(1)
  expect(joined[0]?.status).toBe('valid')
  if (joined[0]?.status !== 'valid') {return}
  expect(joined[0].binding.buzzRoomId).toBe('room-pr-7')
  expect(joined[0].binding.worktreePath).toBe(worktree)

  expect(preflightWorktree(parsed.binding, [linked])).toEqual({ ok: true })
})

test('exact /opt/data/repos/CRM fixture is rejected when returned as isMain', () => {
  const crm = parseBindingRecord({
    ...validRaw,
    repoPath: '/opt/data/repos/CRM',
    worktreePath: '/opt/data/repos/CRM',
    targetBranch: 'main'
  })
  expect(crm.status).toBe('valid')
  if (crm.status !== 'valid') {return}

  expect(
    preflightWorktree(crm.binding, [
      { path: '/opt/data/repos/CRM', branch: 'main', detached: false, isMain: true, locked: false }
    ])
  ).toMatchObject({ ok: false, reason: 'canonical-checkout' })
})

test('missing, detached, wrong-branch, relative, non-staging, duplicate, and mismatched bindings fail closed', () => {
  expect(parseBindingRecord({ ...validRaw, buzzRoomId: '' }).status).toBe('invalid')
  expect(parseBindingRecord({ ...validRaw, worktreePath: 'relative/path' }).status).toBe('invalid')
  expect(parseBindingRecord({ ...validRaw, baseBranch: 'main' }).status).toBe('invalid')
  expect(parseBindingRecord({ ...validRaw, machine: { ...validRaw.machine, machineId: '' } }).status).toBe('invalid')

  const parsed = parseBindingRecord(validRaw)
  expect(parsed.status).toBe('valid')
  if (parsed.status !== 'valid') {return}

  expect(preflightWorktree(parsed.binding, [])).toMatchObject({ ok: false, reason: 'unlisted' })
  expect(
    preflightWorktree(parsed.binding, [{ ...linked, detached: true }])
  ).toMatchObject({ ok: false, reason: 'detached' })
  expect(
    preflightWorktree(parsed.binding, [{ ...linked, branch: 'wrong-branch' }])
  ).toMatchObject({ ok: false, reason: 'wrong-branch' })

  const duplicate = joinProjectRooms({
    bindings: [parsed.binding, { ...parsed.binding, projectId: 'p_other' }],
    projects: [
      { id: 'p_demo', name: 'Pantheon Desktop', primary_path: repo },
      { id: 'p_other', name: 'Other', primary_path: repo }
    ],
    rooms: [{ id: 'room-pr-7', name: 'PAN-7' }],
    trees: [{ id: 'p_demo', path: repo, repos: [{ path: repo }] }]
  })
  expect(duplicate.some(item => item.status === 'invalid' && item.reason === 'duplicate-room')).toBe(true)

  const mismatch = joinProjectRooms({
    bindings: [parsed.binding],
    projects: [{ id: 'p_other', name: 'Other', primary_path: '/somewhere/else' }],
    rooms: [{ id: 'room-pr-7', name: 'PAN-7' }],
    trees: [{ id: 'p_other', path: '/somewhere/else', repos: [{ path: '/somewhere/else' }] }]
  })
  expect(mismatch[0]?.status).toBe('invalid')
})

test('stale refreshes cannot replace the selected foreground PR room', async () => {
  const store = new ProjectStore()
  const first = parseBindingRecord(validRaw)
  const second = parseBindingRecord({
    ...validRaw,
    buzzRoomId: 'room-pr-8',
    worktreePath: `${worktree}-other`,
    targetBranch: 'feat/other'
  })
  expect(first.status).toBe('valid')
  expect(second.status).toBe('valid')
  if (first.status !== 'valid' || second.status !== 'valid') {return}

  store.applyProjection([first])
  store.select('room-pr-7')

  let release: () => void = () => undefined
  const gate = new Promise<void>(resolve => {
    release = resolve
  })

  const stale = store.refresh(async () => {
    await gate

    return [second]
  })
  const fresh = store.refresh(async () => [first, second])
  await fresh
  expect(store.selected()?.status === 'valid' && store.selected()?.status === 'valid' ? store.selected() : null)
  expect(store.selectedId()).toBe('room-pr-7')
  const selected = store.selected()
  expect(selected?.status).toBe('valid')
  if (selected?.status === 'valid') {
    expect(selected.binding.buzzRoomId).toBe('room-pr-7')
  }
  release()
  await stale
  expect(store.selectedId()).toBe('room-pr-7')
  const still = store.selected()
  expect(still?.status).toBe('valid')
  if (still?.status === 'valid') {
    expect(still.binding.buzzRoomId).toBe('room-pr-7')
  }
})

test('archive preserves room, artifact, and evidence provenance', () => {
  const parsed = parseBindingRecord(validRaw)
  expect(parsed.status).toBe('valid')
  if (parsed.status !== 'valid') {return}
  const archived = archiveProjectRoom({ ...parsed.binding, lifecycle: 'merged' })
  expect(archived.lifecycle).toBe('archived')
  expect(archived.buzzRoomId).toBe(parsed.binding.buzzRoomId)
  expect(archived.artifactIds).toEqual(parsed.binding.artifactIds)
  expect(archived.evidence).toEqual(parsed.binding.evidence)
  expect(archived.worktreePath).toBe(parsed.binding.worktreePath)
})
