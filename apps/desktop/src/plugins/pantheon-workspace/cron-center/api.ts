import { host, type PluginProfileRoute } from '@hermes/plugin-sdk'

import type { CronCenterJobUpdates, CronCenterOwner, CronCenterPersistedJob, CronCenterSessionInfo } from './types'

export interface CronCenterRequest {
  path: string
  method?: string
  body?: unknown
  timeoutMs?: number
  profile?: null | string
  connectionId?: null | string
}

export interface CronCenterConnectionLabel {
  id: string
  label?: string
  name?: string
}

export interface CronCenterApiDeps {
  hermesApi: <T>(request: CronCenterRequest) => Promise<T>
  profileRoutes: () => Promise<PluginProfileRoute[]>
  connections: () => Promise<CronCenterConnectionLabel[]>
  activeConnectionId?: () => null | string
}

export interface CronCenterOwnerJobs {
  owner: CronCenterOwner
  jobs: CronCenterPersistedJob[]
}

const CRON_TRIGGER_REQUEST_TIMEOUT_MS = 24 * 60 * 60 * 1000

function ownerFromRoute(route: PluginProfileRoute, connections: CronCenterConnectionLabel[]): CronCenterOwner {
  const connection = connections.find(entry => entry.id === route.connectionId)
  const machine = connection?.label || connection?.name || route.connectionId

  return {
    connectionId: route.connectionId,
    profile: route.profile,
    targetProfile: route.targetProfile,
    mode: route.mode,
    label: `${machine} / ${route.profile}`
  }
}

function scope(owner: CronCenterOwner): Pick<CronCenterRequest, 'connectionId' | 'profile'> {
  return {
    connectionId: owner.connectionId,
    profile: owner.profile
  }
}

function profileQuery(owner: CronCenterOwner): string {
  return `profile=${encodeURIComponent(owner.targetProfile || owner.profile)}`
}

function jobPath(owner: CronCenterOwner, jobId: string, suffix = ''): string {
  const encoded = encodeURIComponent(jobId)
  const [pathSuffix, existingQuery] = suffix.split('?')
  const query = existingQuery ? `${existingQuery}&${profileQuery(owner)}` : profileQuery(owner)

  return `/api/cron/jobs/${encoded}${pathSuffix}?${query}`
}

function defaultDeps(): CronCenterApiDeps {
  return {
    hermesApi: request => window.hermesDesktop.api(request),
    profileRoutes: () => host.profileRoutes(),
    connections: async () => {
      try {
        return await host.connections()
      } catch {
        return []
      }
    }
  }
}

export class CronCenterApi {
  private readonly deps: CronCenterApiDeps

  constructor(deps: Partial<CronCenterApiDeps> = {}) {
    this.deps = { ...defaultDeps(), ...deps }
  }

  async listOwners(): Promise<CronCenterOwner[]> {
    const [routes, connections] = await Promise.all([this.deps.profileRoutes(), this.deps.connections()])

    return routes.map(route => ownerFromRoute(route, connections))
  }

  async listJobs(owner: CronCenterOwner): Promise<CronCenterPersistedJob[]> {
    const jobs = await this.deps.hermesApi<CronCenterPersistedJob[]>({
      ...scope(owner),
      path: `/api/cron/jobs?${profileQuery(owner)}`
    })

    return Array.isArray(jobs) ? jobs : []
  }

  async listAllJobs(): Promise<PromiseSettledResult<CronCenterOwnerJobs>[]> {
    const owners = await this.listOwners()

    return Promise.allSettled(
      owners.map(async owner => ({
        owner,
        jobs: await this.listJobs(owner)
      }))
    )
  }

  getHistory(owner: CronCenterOwner, jobId: string, limit = 20): Promise<{ runs: CronCenterSessionInfo[] }> {
    return this.deps.hermesApi<{ runs: CronCenterSessionInfo[] }>({
      ...scope(owner),
      path: jobPath(owner, jobId, `/runs?limit=${limit}`)
    })
  }

  pause(owner: CronCenterOwner, jobId: string): Promise<CronCenterPersistedJob> {
    return this.deps.hermesApi<CronCenterPersistedJob>({
      ...scope(owner),
      path: jobPath(owner, jobId, '/pause'),
      method: 'POST'
    })
  }

  resume(owner: CronCenterOwner, jobId: string): Promise<CronCenterPersistedJob> {
    return this.deps.hermesApi<CronCenterPersistedJob>({
      ...scope(owner),
      path: jobPath(owner, jobId, '/resume'),
      method: 'POST'
    })
  }

  trigger(owner: CronCenterOwner, jobId: string): Promise<CronCenterPersistedJob> {
    return this.deps.hermesApi<CronCenterPersistedJob>({
      ...scope(owner),
      path: jobPath(owner, jobId, '/trigger'),
      method: 'POST',
      timeoutMs: CRON_TRIGGER_REQUEST_TIMEOUT_MS
    })
  }

  update(owner: CronCenterOwner, jobId: string, updates: CronCenterJobUpdates): Promise<CronCenterPersistedJob> {
    return this.deps.hermesApi<CronCenterPersistedJob>({
      ...scope(owner),
      path: jobPath(owner, jobId),
      method: 'PUT',
      body: { updates }
    })
  }

  remove(owner: CronCenterOwner, jobId: string): Promise<{ ok: boolean }> {
    return this.deps.hermesApi<{ ok: boolean }>({
      ...scope(owner),
      path: jobPath(owner, jobId),
      method: 'DELETE'
    })
  }
}
