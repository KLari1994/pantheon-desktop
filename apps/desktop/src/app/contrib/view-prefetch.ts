import { routePathname } from '../routes'

import { viewLoaders } from './view-loaders'

type ViewLoader = () => Promise<unknown>

export function createViewPrefetcher(loaders: Record<string, ViewLoader>) {
  const inflight = new Map<string, Promise<unknown>>()
  const loaded = new Set<string>()

  function prefetch(path: string): void {
    const key = routePathname(path)
    const load = loaders[key]

    if (!load || loaded.has(key) || inflight.has(key)) {
      return
    }

    const attempt = load()
    inflight.set(key, attempt)
    void attempt.then(
      () => {
        inflight.delete(key)
        loaded.add(key)
      },
      () => {
        inflight.delete(key)
      }
    )
  }

  function prefetchAllOnIdle(): () => void {
    const paths = Object.keys(loaders)
    let index = 0
    let cancelled = false
    let idleHandle: number | null = null
    let timeoutHandle: number | null = null

    const runSlice = () => {
      idleHandle = null
      timeoutHandle = null

      if (cancelled || index >= paths.length) {
        return
      }

      prefetch(paths[index]!)
      index += 1
      schedule()
    }

    const schedule = () => {
      if (cancelled || index >= paths.length) {
        return
      }

      if (typeof window.requestIdleCallback === 'function') {
        idleHandle = window.requestIdleCallback(runSlice)
        return
      }

      timeoutHandle = window.setTimeout(runSlice, 1500)
    }

    schedule()

    return () => {
      cancelled = true

      if (idleHandle !== null && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleHandle)
      }

      if (timeoutHandle !== null) {
        window.clearTimeout(timeoutHandle)
      }
    }
  }

  return { prefetch, prefetchAllOnIdle }
}

export const viewPrefetch = createViewPrefetcher(viewLoaders)
