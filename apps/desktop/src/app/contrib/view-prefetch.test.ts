import { afterEach, describe, expect, it, vi } from 'vitest'

import { createViewPrefetcher } from './view-prefetch'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('createViewPrefetcher', () => {
  it('does not re-call a successful loader on a second prefetch', async () => {
    let calls = 0
    const loaders = {
      '/skills': () => {
        calls += 1
        return Promise.resolve({ ok: true })
      }
    }
    const prefetcher = createViewPrefetcher(loaders)

    prefetcher.prefetch('/skills')
    prefetcher.prefetch('/skills?tab=mcp')
    await Promise.resolve()
    prefetcher.prefetch('/skills')

    expect(calls).toBe(1)
  })

  it('no-ops unknown paths (contributed/bundled pages)', () => {
    let calls = 0
    const prefetcher = createViewPrefetcher({
      '/skills': () => {
        calls += 1
        return Promise.resolve({})
      }
    })

    prefetcher.prefetch('/home')
    prefetcher.prefetch('/kanban')

    expect(calls).toBe(0)
  })

  it('clears dedupe on failure so a later prefetch retries', async () => {
    let calls = 0
    let fail = true
    const prefetcher = createViewPrefetcher({
      '/skills': () => {
        calls += 1
        return fail ? Promise.reject(new Error('chunk miss')) : Promise.resolve({})
      }
    })

    prefetcher.prefetch('/skills')
    await Promise.resolve()
    await Promise.resolve()

    fail = false
    prefetcher.prefetch('/skills')
    await Promise.resolve()

    expect(calls).toBe(2)
  })

  it('prefetchAllOnIdle cancel stops pending slices', () => {
    const cancelIdle = vi.fn()
    let scheduled: ((deadline: IdleDeadline) => void) | undefined
    vi.stubGlobal('requestIdleCallback', (callback: (deadline: IdleDeadline) => void) => {
      scheduled = callback
      return 7
    })
    vi.stubGlobal('cancelIdleCallback', cancelIdle)

    let calls = 0
    const prefetcher = createViewPrefetcher({
      '/skills': () => {
        calls += 1
        return Promise.resolve({})
      },
      '/messaging': () => {
        calls += 1
        return Promise.resolve({})
      }
    })

    const cancel = prefetcher.prefetchAllOnIdle()
    expect(scheduled).toBeTruthy()

    cancel()
    expect(cancelIdle).toHaveBeenCalledWith(7)

    scheduled?.({ didTimeout: false, timeRemaining: () => 50 })
    expect(calls).toBe(0)
  })
})
