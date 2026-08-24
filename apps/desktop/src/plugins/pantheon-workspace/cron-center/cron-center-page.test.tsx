import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import type { CronCenterApi } from './api'
import { CronCenterPage } from './cron-center-page'
import { CronCenterStore } from './store'
import type { CronCenterOwner, CronCenterPersistedJob } from './types'

vi.mock('@/components/ui/confirm-dialog', () => ({
  ConfirmDialog: ({
    open,
    title,
    onConfirm,
    onClose
  }: {
    open: boolean
    title: string
    onConfirm: () => void
    onClose: () => void
  }) =>
    open ? (
      <div>
        <p>{title}</p>
        <button onClick={() => onConfirm()} type="button">
          Confirm delete
        </button>
        <button onClick={onClose} type="button">
          Cancel delete
        </button>
      </div>
    ) : null
}))

afterEach(() => cleanup())

const ownerA: CronCenterOwner = {
  connectionId: 'conn-a',
  profile: 'worker',
  targetProfile: 'backend-a',
  mode: 'remote',
  label: 'Homelab / worker'
}

const ownerB: CronCenterOwner = {
  connectionId: 'conn-b',
  profile: 'writer',
  targetProfile: 'backend-b',
  mode: 'remote',
  label: 'Office / writer'
}

function job(id: string, extra: Partial<CronCenterPersistedJob> = {}): CronCenterPersistedJob {
  return {
    id,
    enabled: true,
    name: id,
    prompt: 'summarize inbox',
    schedule_display: 'daily',
    last_status: 'ok',
    deliver: 'local',
    next_run_at: '2026-08-25T03:00:00Z',
    last_run_at: '2026-08-24T03:00:00Z',
    latest_execution: { id: 'exec-1', status: 'completed', claimed_at: '2026-08-24T03:00:00Z' },
    ...extra
  }
}

function seededStore(jobs: Array<{ owner: CronCenterOwner; jobs: CronCenterPersistedJob[]; status?: 'degraded' | 'error' | 'ready' }>) {
  const api = {
    listOwners: async () => jobs.map(entry => entry.owner),
    listJobs: async (owner: CronCenterOwner) => jobs.find(entry => entry.owner.connectionId === owner.connectionId)?.jobs ?? [],
    getHistory: async () => ({
      runs: Array.from({ length: 25 }, (_, index) => ({
        id: `run-${index}`,
        ended_at: null,
        input_tokens: 0,
        is_active: false,
        last_active: index,
        message_count: 0,
        model: null,
        output_tokens: 0,
        preview: index === 0 ? 'receipt ok' : null,
        source: 'cron',
        started_at: index,
        title: `Run ${index}`,
        tool_call_count: 0
      }))
    }),
    pause: vi.fn(),
    resume: vi.fn(),
    trigger: vi.fn(),
    update: vi.fn(),
    remove: vi.fn()
  } as unknown as CronCenterApi

  const store = new CronCenterStore(api)

  return { store, api, hydrate: () => store.refreshAll() }
}

test('loading, empty, partial-degraded, and exhausted error states are distinct', async () => {
  const loading = new CronCenterStore({
    listOwners: () => new Promise(() => undefined),
    listJobs: async () => []
  } as unknown as CronCenterApi)

  void loading.refreshAll()
  await Promise.resolve()
  render(<CronCenterPage store={loading} />)
  expect(screen.getByText('Loading cron jobs')).toBeTruthy()
  cleanup()

  const empty = seededStore([])
  await empty.hydrate()
  render(<CronCenterPage store={empty.store} />)
  expect(screen.getByText('No scheduled jobs')).toBeTruthy()
  cleanup()

  const api = {
    listOwners: async () => [ownerA, ownerB],
    listJobs: async (owner: CronCenterOwner) => {
      if (owner.connectionId === 'conn-b') {throw new Error('timeout')}

      return [job('ok-job')]
    }
  } as unknown as CronCenterApi

  const degradedStore = new CronCenterStore(api)
  await degradedStore.refreshAll()
  render(<CronCenterPage store={degradedStore} />)
  expect(screen.getByText('ok-job')).toBeTruthy()
  expect(screen.getByText(/degraded/i)).toBeTruthy()
  cleanup()

  const failed = new CronCenterStore({
    listOwners: async () => {
      throw new Error('no routes')
    },
    listJobs: async () => []
  } as unknown as CronCenterApi)

  await failed.refreshAll()
  render(<CronCenterPage store={failed} />)
  expect(screen.getByText('Unable to load cron jobs')).toBeTruthy()
  cleanup()

  const allFailed = new CronCenterStore({
    listOwners: async () => [ownerA, ownerB],
    listJobs: async () => {
      throw new Error('down')
    }
  } as unknown as CronCenterApi)

  await allFailed.refreshAll()
  render(<CronCenterPage store={allFailed} />)
  expect(screen.queryByText('No scheduled jobs')).toBeNull()
  expect(screen.getByText('Unable to load cron jobs')).toBeTruthy()
})

test('list rows render next and last run without requiring selection', async () => {
  const { store, hydrate } = seededStore([{ owner: ownerA, jobs: [job('nightly')] }])
  await hydrate()
  render(<CronCenterPage store={store} />)
  expect(screen.getByText(/Next run/)).toBeTruthy()
  expect(screen.getByText(/2026-08-25T03:00:00Z/)).toBeTruthy()
  expect(screen.getByText(/Last run/)).toBeTruthy()
  expect(screen.getByText(/2026-08-24T03:00:00Z/)).toBeTruthy()
})

test('deep links require an exact composite owner key', async () => {
  const { store, hydrate } = seededStore([
    { owner: ownerA, jobs: [job('shared')] },
    { owner: ownerB, jobs: [job('shared', { name: 'office-shared' })] }
  ])
  await hydrate()
  const { rerender } = render(<CronCenterPage initialJobKey="shared" store={store} />)
  expect(screen.queryByText('summarize inbox')).toBeNull()
  rerender(<CronCenterPage initialJobKey="conn-b::writer::shared" store={store} />)
  expect(screen.getByRole('heading', { name: 'office-shared' })).toBeTruthy()
  expect(screen.getByText('summarize inbox')).toBeTruthy()
})

test('expanded detail renders every populated source and receipt error field', async () => {
  const { store, hydrate } = seededStore([
    {
      owner: ownerA,
      jobs: [
        job('monitor', {
          prompt: 'watch status',
          script: 'echo start',
          monitor_script: 'curl https://status',
          monitor_url: 'https://status.example',
          last_error: 'persisted last error',
          last_delivery_error: 'telegram 401',
          last_fire_error: { detail: 'forward failed' },
          latest_execution: { id: 'exec-9', status: 'failed', claimed_at: '2026-08-24T03:00:00Z', error: 'receipt boom' }
        })
      ]
    }
  ])
  await hydrate()
  render(<CronCenterPage store={store} />)
  fireEvent.click(screen.getByRole('button', { name: 'monitor' }))
  expect(screen.getByText('watch status')).toBeTruthy()
  expect(screen.getByText('echo start')).toBeTruthy()
  expect(screen.getByText('curl https://status')).toBeTruthy()
  expect(screen.getByText('https://status.example')).toBeTruthy()
  expect(screen.getByText(/persisted last error/)).toBeTruthy()
  expect(screen.getByText(/telegram 401/)).toBeTruthy()
  expect(screen.getByText(/forward failed/)).toBeTruthy()
  expect(screen.getByText(/receipt boom/)).toBeTruthy()
})

test('failed writes surface an error instead of an unhandled rejection', async () => {
  const { store, api, hydrate } = seededStore([{ owner: ownerA, jobs: [job('nightly')] }])
  api.pause = vi.fn(async () => {
    throw new Error('pause failed')
  })
  api.update = vi.fn(async () => {
    throw new Error('save failed')
  })
  await hydrate()
  render(<CronCenterPage store={store} />)
  fireEvent.click(screen.getByRole('button', { name: 'nightly' }))
  fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
  await waitFor(() => {
    expect(screen.getByText(/pause failed/)).toBeTruthy()
  })
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => {
    expect(screen.getByText(/save failed/)).toBeTruthy()
  })
})

test('expanded detail is bounded and renders persisted source and receipt data', async () => {
  const { store, hydrate } = seededStore([{ owner: ownerA, jobs: [job('nightly')] }])
  await hydrate()
  render(<CronCenterPage store={store} />)
  fireEvent.click(screen.getByRole('button', { name: 'nightly' }))
  expect(screen.getByText('summarize inbox')).toBeTruthy()
  expect(screen.getByText(/exec-1/)).toBeTruthy()
  await waitFor(() => {
    expect(screen.getByText(/receipt ok/)).toBeTruthy()
  })
  expect(screen.getAllByText(/Run \d+/).length).toBeLessThanOrEqual(20)
})

test('primary actions are Run now, Edit, Pause/Resume, and Open owner chat; delete is overflow-only', async () => {
  const { store, hydrate } = seededStore([{ owner: ownerA, jobs: [job('nightly')] }])
  await hydrate()
  render(<CronCenterPage store={store} />)
  fireEvent.click(screen.getByRole('button', { name: 'nightly' }))
  expect(screen.getByRole('button', { name: 'Run now' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Open owner chat' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'More' }))
  expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
  expect(screen.getByText(/Delete nightly/)).toBeTruthy()
})

test('Open owner chat receives the complete owner route', async () => {
  const onOpenOwnerChat = vi.fn()
  const { store, hydrate } = seededStore([{ owner: ownerA, jobs: [job('nightly')] }])
  await hydrate()
  render(<CronCenterPage onOpenOwnerChat={onOpenOwnerChat} store={store} />)
  fireEvent.click(screen.getByRole('button', { name: 'nightly' }))
  fireEvent.click(screen.getByRole('button', { name: 'Open owner chat' }))
  expect(onOpenOwnerChat).toHaveBeenCalledWith({
    connectionId: 'conn-a',
    profile: 'worker',
    targetProfile: 'backend-a',
    mode: 'remote'
  })
})

test('refresh events never navigate or steal focus', async () => {
  const onNavigate = vi.fn()
  const { store, hydrate } = seededStore([{ owner: ownerA, jobs: [job('nightly')] }])
  await hydrate()
  render(<CronCenterPage onNavigate={onNavigate} store={store} />)
  const focused = document.activeElement
  await store.refreshAll()
  expect(onNavigate).not.toHaveBeenCalled()
  expect(document.activeElement).toBe(focused)
})
