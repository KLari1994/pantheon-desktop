import type { PluginProfileRoute } from '@hermes/plugin-sdk'
import { afterEach, expect, test, vi } from 'vitest'

import { CronCenterApi, type CronCenterApiDeps, type CronCenterRequest } from './api'
import type { CronCenterOwner } from './types'

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

function route(owner: CronCenterOwner): PluginProfileRoute {
  return {
    connectionId: owner.connectionId,
    profile: owner.profile,
    targetProfile: owner.targetProfile,
    mode: owner.mode
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

function createApi(handler: (request: CronCenterRequest) => Promise<unknown>) {
  const requests: CronCenterRequest[] = []

  const api = new CronCenterApi({
    hermesApi: (async (request: CronCenterRequest) => {
      requests.push(request)

      return handler(request)
    }) as CronCenterApiDeps['hermesApi'],
    profileRoutes: async () => [route(ownerA), route(ownerB)],
    connections: async () => [
      { id: 'conn-a', label: 'Homelab' },
      { id: 'conn-b', label: 'Office' }
    ]
  })

  return { api, requests }
}

test('inventory keeps duplicate profile names distinct by connection', async () => {
  const { api } = createApi(async () => [])
  const owners = await api.listOwners()
  expect(owners.map(owner => `${owner.connectionId}::${owner.profile}`)).toEqual([
    'conn-a::worker',
    'conn-b::worker'
  ])
  expect(owners[0]?.label).toContain('Homelab')
  expect(owners[1]?.label).toContain('Office')
})

test('reads, history, and every mutation include the captured owner', async () => {
  const { api, requests } = createApi(async request => {
    if (request.path.includes('/runs')) {return { runs: [] }}

    if (request.method === 'DELETE') {return { ok: true }}

    return { id: 'job-1', enabled: true }
  })

  await api.listJobs(ownerA)
  await api.getHistory(ownerA, 'job-1')
  await api.pause(ownerA, 'job-1')
  await api.resume(ownerA, 'job-1')
  await api.trigger(ownerA, 'job-1')
  await api.update(ownerA, 'job-1', { name: 'renamed' })
  await api.remove(ownerA, 'job-1')
  expect(requests.length).toBe(7)

  for (const request of requests) {
    expect(request.connectionId).toBe('conn-a')
    expect(request.profile).toBe('worker')
  }

  expect(requests[0]?.path).toBe('/api/cron/jobs?profile=backend-a')
  expect(requests[1]?.path).toBe('/api/cron/jobs/job-1/runs?limit=20')
  expect(requests[2]?.path).toBe('/api/cron/jobs/job-1/pause')
  expect(requests[3]?.path).toBe('/api/cron/jobs/job-1/resume')
  expect(requests[4]?.path).toBe('/api/cron/jobs/job-1/trigger')
  expect(requests[5]?.path).toBe('/api/cron/jobs/job-1')
  expect(requests[5]?.method).toBe('PUT')
  expect(requests[6]?.method).toBe('DELETE')
})

test('an in-flight action keeps the captured owner after the foreground connection changes', async () => {
  let currentConnection = 'conn-a'
  const requests: CronCenterRequest[] = []

  const api = new CronCenterApi({
    hermesApi: (async (request: CronCenterRequest) => {
      requests.push(request)
      currentConnection = 'conn-b'

      return { id: 'job-1', enabled: true }
    }) as CronCenterApiDeps['hermesApi'],
    profileRoutes: async () => [route(ownerA), route(ownerB)],
    connections: async () => [],
    activeConnectionId: () => currentConnection
  })

  await api.pause(ownerA, 'job-1')
  expect(currentConnection).toBe('conn-b')
  expect(requests[0]?.connectionId).toBe('conn-a')
  expect(requests[0]?.profile).toBe('worker')
})

test('one failed owner list does not reject the remaining owners', async () => {
  const api = new CronCenterApi({
    hermesApi: (async (request: CronCenterRequest) => {
      if (request.connectionId === 'conn-a') {throw new Error('conn-a down')}

      return [{ id: 'job-1', enabled: true, name: 'alive' }]
    }) as CronCenterApiDeps['hermesApi'],
    profileRoutes: async () => [route(ownerA), route(ownerB)],
    connections: async () => []
  })

  const results = await api.listAllJobs()
  expect(results).toHaveLength(2)
  expect(results[0]?.status).toBe('rejected')
  expect(results[1]?.status).toBe('fulfilled')

  if (results[1]?.status === 'fulfilled') {
    expect(results[1].value.jobs).toHaveLength(1)
    expect(results[1].value.owner.connectionId).toBe('conn-b')
  }
})
