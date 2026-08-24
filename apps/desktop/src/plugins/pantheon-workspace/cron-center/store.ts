import type { CronCenterApi } from './api'
import { jobKey, ownerKey, projectCronHistory } from './projections'
import type {
  CronCenterHistoryRow,
  CronCenterJobUpdates,
  CronCenterOwner,
  CronCenterOwnerSlice,
  CronCenterPersistedJob,
  CronCenterSliceStatus
} from './types'

function atom<T>(initial: T) {
  let value = initial
  const listeners = new Set<(next: T) => void>()

  return {
    get: () => value,
    set: (next: T) => {
      value = next

      for (const listener of listeners) {listener(next)}
    },
    listen: (listener: (next: T) => void) => {
      listeners.add(listener)

      return () => listeners.delete(listener)
    }
  }
}

function cloneJobs(jobs: CronCenterPersistedJob[]): CronCenterPersistedJob[] {
  return jobs.map(job => ({ ...job }))
}

export class CronCenterStore {
  readonly $slices = atom<Record<string, CronCenterOwnerSlice>>({})
  readonly $pendingKey = atom<null | string>(null)
  readonly $history = atom<{ key: null | string; rows: CronCenterHistoryRow[] }>({ key: null, rows: [] })
  readonly $status = atom<'error' | 'idle' | 'loading' | 'ready'>('idle')
  private readonly generations = new Map<string, number>()
  private readonly writeQueues = new Map<string, Promise<unknown>>()

  constructor(private readonly api: CronCenterApi) {}

  owners(): CronCenterOwner[] {
    return Object.values(this.$slices.get()).map(slice => slice.owner)
  }

  slice(owner: Pick<CronCenterOwner, 'connectionId' | 'profile'>): CronCenterOwnerSlice | undefined {
    return this.$slices.get()[ownerKey(owner)]
  }

  jobsFor(owner: Pick<CronCenterOwner, 'connectionId' | 'profile'>): CronCenterPersistedJob[] {
    return this.slice(owner)?.jobs ?? []
  }

  pendingKey(): null | string {
    return this.$pendingKey.get()
  }

  private nextGeneration(key: string): number {
    const generation = (this.generations.get(key) ?? 0) + 1
    this.generations.set(key, generation)

    return generation
  }

  private currentGeneration(key: string): number {
    return this.generations.get(key) ?? 0
  }

  private publishSlice(slice: CronCenterOwnerSlice): void {
    if (slice.generation !== this.currentGeneration(ownerKey(slice.owner))) {return}
    this.$slices.set({ ...this.$slices.get(), [ownerKey(slice.owner)]: slice })
  }

  private setSliceJobs(
    owner: CronCenterOwner,
    jobs: CronCenterPersistedJob[],
    status: CronCenterSliceStatus,
    error: null | string = null
  ): void {
    const existing = this.slice(owner)
    this.publishSlice({
      owner,
      jobs,
      generation: this.currentGeneration(ownerKey(owner)),
      status,
      error
    })

    if (!existing) {return}
  }

  private enqueue<T>(owner: CronCenterOwner, work: () => Promise<T>): Promise<T> {
    const key = ownerKey(owner)
    const previous = this.writeQueues.get(key)
    const next = previous ? previous.catch(() => undefined).then(work) : work()
    this.writeQueues.set(
      key,
      next.then(
        () => undefined,
        () => undefined
      )
    )

    return next
  }

  async refreshOwner(owner: CronCenterOwner): Promise<void> {
    const key = ownerKey(owner)
    const generation = this.nextGeneration(key)
    const previous = this.slice(owner)
    this.publishSlice({
      owner,
      jobs: previous?.jobs ?? [],
      generation,
      status: previous?.jobs.length ? previous.status : 'loading',
      error: previous?.error ?? null
    })

    try {
      const jobs = await this.api.listJobs(owner)

      if (generation !== this.currentGeneration(key)) {return}
      this.publishSlice({ owner, jobs, generation, status: 'ready', error: null })
    } catch (error) {
      if (generation !== this.currentGeneration(key)) {return}
      this.publishSlice({
        owner,
        jobs: previous?.jobs ?? [],
        generation,
        status: previous?.jobs.length ? 'degraded' : 'error',
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  async refreshAll(): Promise<void> {
    this.$status.set('loading')
    let owners: CronCenterOwner[]

    try {
      owners = await this.api.listOwners()
    } catch (error) {
      const slices = this.$slices.get()
      const next: Record<string, CronCenterOwnerSlice> = {}

      for (const [key, slice] of Object.entries(slices)) {
        next[key] = {
          ...slice,
          status: slice.jobs.length ? 'degraded' : 'error',
          error: error instanceof Error ? error.message : String(error)
        }
      }

      this.$slices.set(next)
      this.$status.set(Object.keys(next).length ? 'ready' : 'error')

      return
    }

    const keep = new Set(owners.map(owner => ownerKey(owner)))
    const retained: Record<string, CronCenterOwnerSlice> = {}

    for (const [key, slice] of Object.entries(this.$slices.get())) {
      if (keep.has(key)) {retained[key] = slice}
    }

    this.$slices.set(retained)
    await Promise.all(owners.map(owner => this.refreshOwner(owner)))
    const slices = Object.values(this.$slices.get())
    const allFailed = slices.length > 0 && slices.every(slice => slice.status === 'error' && slice.jobs.length === 0)
    this.$status.set(allFailed ? 'error' : 'ready')
  }

  private snapshot(owner: CronCenterOwner): CronCenterPersistedJob[] {
    return cloneJobs(this.jobsFor(owner))
  }

  private replaceJob(owner: CronCenterOwner, nextJob: CronCenterPersistedJob): void {
    const jobs = this.jobsFor(owner)
    const index = jobs.findIndex(job => job.id === nextJob.id)
    const next = index === -1 ? [...jobs, nextJob] : jobs.map((job, jobIndex) => (jobIndex === index ? nextJob : job))
    this.setSliceJobs(owner, next, 'ready')
  }

  private applyOptimistic(owner: CronCenterOwner, jobId: string, patch: Partial<CronCenterPersistedJob>): void {
    this.setSliceJobs(
      owner,
      this.jobsFor(owner).map(job => (job.id === jobId ? { ...job, ...patch } : job)),
      this.slice(owner)?.status ?? 'ready'
    )
  }

  pause(owner: CronCenterOwner, jobId: string): Promise<void> {
    return this.enqueue(owner, async () => {
      const snapshot = this.snapshot(owner)
      this.nextGeneration(ownerKey(owner))
      this.applyOptimistic(owner, jobId, { enabled: false, state: 'paused' })

      try {
        const next = await this.api.pause(owner, jobId)
        this.replaceJob(owner, next)
      } catch (error) {
        this.setSliceJobs(owner, snapshot, this.slice(owner)?.status ?? 'ready')
        throw error
      } finally {
        await this.refreshOwner(owner)
      }
    })
  }

  resume(owner: CronCenterOwner, jobId: string): Promise<void> {
    return this.enqueue(owner, async () => {
      const snapshot = this.snapshot(owner)
      this.nextGeneration(ownerKey(owner))
      this.applyOptimistic(owner, jobId, { enabled: true, state: 'scheduled' })

      try {
        const next = await this.api.resume(owner, jobId)
        this.replaceJob(owner, next)
      } catch (error) {
        this.setSliceJobs(owner, snapshot, this.slice(owner)?.status ?? 'ready')
        throw error
      } finally {
        await this.refreshOwner(owner)
      }
    })
  }

  update(owner: CronCenterOwner, jobId: string, updates: CronCenterJobUpdates): Promise<void> {
    return this.enqueue(owner, async () => {
      const snapshot = this.snapshot(owner)
      this.nextGeneration(ownerKey(owner))
      this.applyOptimistic(owner, jobId, {
        name: updates.name ?? snapshot.find(job => job.id === jobId)?.name,
        prompt: updates.prompt ?? snapshot.find(job => job.id === jobId)?.prompt,
        deliver: updates.deliver ?? snapshot.find(job => job.id === jobId)?.deliver
      })

      try {
        const next = await this.api.update(owner, jobId, updates)
        this.replaceJob(owner, next)
      } catch (error) {
        this.setSliceJobs(owner, snapshot, this.slice(owner)?.status ?? 'ready')
        throw error
      } finally {
        await this.refreshOwner(owner)
      }
    })
  }

  remove(owner: CronCenterOwner, jobId: string): Promise<void> {
    return this.enqueue(owner, async () => {
      const snapshot = this.snapshot(owner)
      this.nextGeneration(ownerKey(owner))
      this.setSliceJobs(
        owner,
        this.jobsFor(owner).filter(job => job.id !== jobId),
        'ready'
      )

      try {
        await this.api.remove(owner, jobId)
      } catch (error) {
        this.setSliceJobs(owner, snapshot, this.slice(owner)?.status ?? 'ready')
        throw error
      } finally {
        await this.refreshOwner(owner)
      }
    })
  }

  async loadHistory(owner: CronCenterOwner, jobId: string): Promise<void> {
    const key = jobKey(owner, jobId)

    try {
      const { runs } = await this.api.getHistory(owner, jobId, 20)
      this.$history.set({ key, rows: projectCronHistory(runs ?? [], 20) })
    } catch {
      this.$history.set({ key, rows: [] })
    }
  }

  trigger(owner: CronCenterOwner, jobId: string): Promise<void> {
    this.$pendingKey.set(jobKey(owner, jobId))

    return this.enqueue(owner, async () => {
      this.nextGeneration(ownerKey(owner))

      try {
        const next = await this.api.trigger(owner, jobId)
        this.replaceJob(owner, next)
      } finally {
        this.$pendingKey.set(null)
        await this.refreshOwner(owner)
      }
    })
  }
}
