import { expect, test } from 'vitest'

import type { CronCenterApi } from './api'
import { CronCenterStore } from './store'
import type { CronCenterOwner, CronCenterPersistedJob } from './types'

const ownerA: CronCenterOwner = {
  connectionId: 'conn-a',
  profile: 'worker',
  targetProfile: 'backend-a',
  mode: 'remote',
  label: 'Homelab / worker'
}

const ownerB: CronCenterOwner = {
  connectionId: 'conn-b',
  profile: 'worker',
  targetProfile: 'backend-b',
  mode: 'remote',
  label: 'Office / worker'
}

function job(id: string, extra: Partial<CronCenterPersistedJob> = {}): CronCenterPersistedJob {
  return { id, enabled: true, name: id, last_status: 'ok', ...extra }
}

function fakeApi(overrides: Partial<CronCenterApi> = {}): CronCenterApi {
  return {
    listOwners: async () => [ownerA, ownerB],
    listJobs: async owner => [job(`${owner.connectionId}-job`)],
    listAllJobs: async () => [],
    getHistory: async () => ({ runs: [] }),
    pause: async (_owner, jobId) => job(jobId, { enabled: false, state: 'paused' }),
    resume: async (_owner, jobId) => job(jobId, { enabled: true, state: 'scheduled' }),
    trigger: async (_owner, jobId) => job(jobId),
    update: async (_owner, jobId, updates) => job(jobId, { name: updates.name, enabled: updates.enabled }),
    remove: async () => ({ ok: true }),
    ...overrides
  } as CronCenterApi
}

test('a stale owner refresh cannot overwrite a newer slice', async () => {
  let releaseFirst: () => void = () => undefined

  const firstGate = new Promise<void>(resolve => {
    releaseFirst = resolve
  })

  let calls = 0

  const api = fakeApi({
    listJobs: async () => {
      calls += 1

      if (calls === 1) {
        await firstGate

        return [job('old')]
      }

      return [job('new')]
    }
  })

  const store = new CronCenterStore(api)
  const stale = store.refreshOwner(ownerA)
  const fresh = store.refreshOwner(ownerA)
  await fresh
  expect(store.jobsFor(ownerA).map(item => item.id)).toEqual(['new'])
  releaseFirst()
  await stale
  expect(store.jobsFor(ownerA).map(item => item.id)).toEqual(['new'])
})

test('failed optimistic pause restores the snapshot and refreshes the exact owner', async () => {
  const refreshed: string[] = []

  const api = fakeApi({
    listJobs: async owner => {
      refreshed.push(owner.connectionId)

      return [job('job-1', { enabled: true, name: 'live' })]
    },
    pause: async () => {
      throw new Error('write failed')
    }
  })

  const store = new CronCenterStore(api)
  await store.refreshOwner(ownerA)
  await expect(store.pause(ownerA, 'job-1')).rejects.toThrow('write failed')
  expect(store.jobsFor(ownerA)[0]?.enabled).toBe(true)
  expect(store.jobsFor(ownerA)[0]?.name).toBe('live')
  expect(refreshed.filter(id => id === 'conn-a').length).toBeGreaterThan(1)
  expect(refreshed).not.toContain('conn-b')
})

test('successful writes reconcile from the backend job rather than the optimistic patch', async () => {
  let paused = false

  const api = fakeApi({
    listJobs: async () => [
      job('job-1', paused ? { enabled: false, state: 'paused', name: 'server-name' } : { enabled: true, name: 'before' })
    ],
    pause: async () => {
      paused = true

      return job('job-1', { enabled: false, state: 'paused', name: 'server-name' })
    }
  })

  const store = new CronCenterStore(api)
  await store.refreshOwner(ownerA)
  await store.pause(ownerA, 'job-1')
  expect(store.jobsFor(ownerA)[0]).toMatchObject({ enabled: false, name: 'server-name', state: 'paused' })
})

test('removed routes are dropped and transient failures keep the last good slice as degraded', async () => {
  let owners = [ownerA, ownerB]
  let failA = false

  const api = fakeApi({
    listOwners: async () => owners,
    listJobs: async owner => {
      if (failA && owner.connectionId === 'conn-a') {throw new Error('timeout')}

      return [job(`${owner.connectionId}-job`)]
    }
  })

  const store = new CronCenterStore(api)
  await store.refreshAll()
  expect(store.owners().map(owner => owner.connectionId)).toEqual(['conn-a', 'conn-b'])
  failA = true
  await store.refreshAll()
  expect(store.slice(ownerA)?.status).toBe('degraded')
  expect(store.jobsFor(ownerA)[0]?.id).toBe('conn-a-job')
  expect(store.slice(ownerB)?.status).toBe('ready')
  owners = [ownerB]
  failA = false
  await store.refreshAll()
  expect(store.owners().map(owner => owner.connectionId)).toEqual(['conn-b'])
  expect(store.slice(ownerA)).toBeUndefined()
})

test('run now records pending without inventing a success result', async () => {
  let finish: (job: CronCenterPersistedJob) => void = () => undefined
  let triggered = false

  const api = fakeApi({
    listJobs: async () => [
      job(
        'job-1',
        triggered
          ? { last_status: 'ok', latest_execution: { status: 'running' } }
          : { last_status: 'ok' }
      )
    ],
    trigger: () => {
      triggered = true

      return new Promise(resolve => {
        finish = resolve
      })
    }
  })

  const store = new CronCenterStore(api)
  await store.refreshOwner(ownerA)
  const pending = store.trigger(ownerA, 'job-1')
  expect(store.pendingKey()).toBe('conn-a::worker::job-1')
  expect(store.jobsFor(ownerA)[0]?.last_status).toBe('ok')
  finish(job('job-1', { last_status: 'ok', latest_execution: { status: 'running' } }))
  await pending
  expect(store.pendingKey()).toBeNull()
  expect(store.jobsFor(ownerA)[0]?.latest_execution?.status).toBe('running')
})

test('writes for one owner are serialized', async () => {
  const order: string[] = []
  let releaseFirst: () => void = () => undefined

  const firstGate = new Promise<void>(resolve => {
    releaseFirst = resolve
  })

  const api = fakeApi({
    listJobs: async () => [job('job-1', { enabled: true })],
    pause: async () => {
      order.push('pause-start')
      await firstGate
      order.push('pause-end')

      return job('job-1', { enabled: false })
    },
    resume: async () => {
      order.push('resume')

      return job('job-1', { enabled: true })
    }
  })

  const store = new CronCenterStore(api)
  await store.refreshOwner(ownerA)
  const pause = store.pause(ownerA, 'job-1')
  const resume = store.resume(ownerA, 'job-1')
  await Promise.resolve()
  expect(order).toEqual(['pause-start'])
  releaseFirst()
  await Promise.all([pause, resume])
  expect(order).toEqual(['pause-start', 'pause-end', 'resume'])
})
