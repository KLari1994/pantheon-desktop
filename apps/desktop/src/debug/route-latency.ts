// Click-to-paint profiler for Pantheon nav. Local evidence only — never
// uploaded. Lives in the debug graph (aliased out of plain production builds;
// VITE_PERF_PROBE=1 opts a packaged build back in).
//
//   window.__ROUTE_PERF__.table()
//   window.__ROUTE_PERF__.last()
//   window.__ROUTE_PERF__.reset()

interface RouteSample {
  label: string
  route: string | null
  phase: 'cold' | 'warm'
  clickToPaintMs: number
}

const NAV_SELECTOR = '[data-sidebar] a, [data-sidebar] button, [role="menuitem"]'
const PENDING_TTL_MS = 5_000
const WARM_BUDGET_MS = 100
const COLD_BUDGET_MS = 300

const samples: RouteSample[] = []
const seenKeys = new Set<string>()

let pending: { label: string; t: number; timer: number; token: number } | null = null
let nextToken = 0
let measuringToken: number | null = null
let sawRouteCommit = false

// HashRouter keeps the in-app path in location.hash. location.pathname is
// `/` in dev and `/…/index.html` in the packaged build for every nav.
export function currentRoute(): string {
  const hash = window.location.hash
  if (hash.startsWith('#')) {
    return hash.slice(1).split('?')[0]
  }

  return window.location.pathname
}

function navLabel(node: Element): string {
  const labelled = node.closest('[aria-label]')
  const source = labelled?.getAttribute('aria-label') || node.textContent || ''
  return source.replace(/\s+/g, ' ').trim()
}

function clearPending() {
  if (pending) {
    window.clearTimeout(pending.timer)
  }

  pending = null
  measuringToken = null
  sawRouteCommit = false
}

function beginMeasure(route: string | null) {
  const current = pending
  if (!current || measuringToken === current.token) {
    return
  }

  measuringToken = current.token
  const token = current.token

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!pending || pending.token !== token) {
        return
      }

      const clickToPaintMs = performance.now() - current.t
      const key = route ?? current.label
      const phase: RouteSample['phase'] = seenKeys.has(key) ? 'warm' : 'cold'
      seenKeys.add(key)
      const sample: RouteSample = { clickToPaintMs, label: current.label, phase, route }
      samples.push(sample)
      clearPending()

      const budget = phase === 'warm' ? WARM_BUDGET_MS : COLD_BUDGET_MS
      const ok = clickToPaintMs < budget
      const line = `[route-perf] ${phase} ${current.label || '(nav)'} ${route ?? '—'} ${clickToPaintMs.toFixed(1)}ms`
      console.log(`%c${line}`, `color:${ok ? '#3dd68c' : '#ff6b6b'}`)
    })
  })
}

function onPointerDown(event: PointerEvent) {
  const target = event.target
  if (!(target instanceof Element) || !target.closest(NAV_SELECTOR)) {
    return
  }

  clearPending()
  const token = (nextToken += 1)
  pending = {
    label: navLabel(target),
    t: performance.now(),
    timer: window.setTimeout(() => {
      if (pending?.token === token) {
        clearPending()
      }
    }, PENDING_TTL_MS),
    token
  }

  requestAnimationFrame(() => {
    beginMeasure(sawRouteCommit ? currentRoute() : null)
  })
}

function onRouteCommit() {
  if (!pending) {
    return
  }

  sawRouteCommit = true
  beginMeasure(currentRoute())
}

function install() {
  if (typeof window === 'undefined' || window.__ROUTE_PERF__) {
    return
  }

  window.addEventListener('pointerdown', onPointerDown, true)

  const { history } = window
  const pushState = history.pushState.bind(history)
  const replaceState = history.replaceState.bind(history)
  history.pushState = (...args: Parameters<History['pushState']>) => {
    pushState(...args)
    onRouteCommit()
  }
  history.replaceState = (...args: Parameters<History['replaceState']>) => {
    replaceState(...args)
    onRouteCommit()
  }
  window.addEventListener('popstate', onRouteCommit)

  window.__ROUTE_PERF__ = {
    last: () => samples.at(-1) ?? null,
    reset: () => {
      samples.length = 0
      seenKeys.clear()
      clearPending()
    },
    table: () => samples.slice()
  }
}

declare global {
  interface Window {
    __ROUTE_PERF__?: {
      table: () => RouteSample[]
      last: () => null | RouteSample
      reset: () => void
    }
  }
}

install()
