import { afterEach, describe, expect, it } from 'vitest'

import { registry } from '@/contrib/registry'

import {
  contributedRoutes,
  NEW_CHAT_ROUTE,
  primaryRouteSelectedSessionId,
  ROUTES_AREA,
  routeSessionId,
  sessionRoute,
  SETTINGS_ROUTE
} from './routes'

const SESS_A = 'sess-a'
const SESS_B = 'sess-b'

describe('primaryRouteSelectedSessionId', () => {
  it('prefers the routed session id over a stale/different store selection (#59305)', () => {
    // The route already committed to B while the store selection hasn't
    // caught up yet (still reads A) — the route wins.
    expect(primaryRouteSelectedSessionId(sessionRoute(SESS_B), SESS_A)).toBe(SESS_B)
  })

  it('returns null on the new-chat route even with a leftover selection from the previous chat', () => {
    expect(primaryRouteSelectedSessionId(NEW_CHAT_ROUTE, SESS_A)).toBeNull()
  })

  it('falls back to the store selection on a non-chat route (settings, overlays)', () => {
    expect(primaryRouteSelectedSessionId(SETTINGS_ROUTE, SESS_A)).toBe(SESS_A)
  })

  it('falls back to the store selection when the route matches the same session', () => {
    expect(primaryRouteSelectedSessionId(sessionRoute(SESS_A), SESS_A)).toBe(SESS_A)
  })

  it('returns null on a non-chat route with no store selection', () => {
    expect(primaryRouteSelectedSessionId(SETTINGS_ROUTE, null)).toBeNull()
  })
})

describe('contributedRoutes cache', () => {
  const disposers: Array<() => void> = []

  afterEach(() => {
    while (disposers.length > 0) {
      disposers.pop()?.()
    }
  })

  it('returns the same array identity when the registry has not mutated', () => {
    expect(contributedRoutes()).toBe(contributedRoutes())
  })

  it('invalidates when a routes contribution is registered and when it is disposed', () => {
    const before = contributedRoutes()
    const dispose = registry.register({
      area: ROUTES_AREA,
      data: { path: '/pan-17-cache-probe' },
      id: 'pan-17-cache-probe',
      render: () => null
    })
    disposers.push(dispose)

    const afterRegister = contributedRoutes()
    expect(afterRegister).not.toBe(before)
    expect(afterRegister.some(route => route.path === '/pan-17-cache-probe')).toBe(true)

    dispose()
    disposers.pop()

    const afterDispose = contributedRoutes()
    expect(afterDispose).not.toBe(afterRegister)
    expect(afterDispose.some(route => route.path === '/pan-17-cache-probe')).toBe(false)
  })
})

describe('routeSessionId reserved paths', () => {
  it('does not treat reserved app paths as session ids', () => {
    expect(routeSessionId('/')).toBeNull()
    expect(routeSessionId(SETTINGS_ROUTE)).toBeNull()
    expect(routeSessionId('/skills')).toBeNull()
    expect(routeSessionId('/messaging')).toBeNull()
    expect(routeSessionId('/artifacts')).toBeNull()
  })

  it('parses a single-segment session id', () => {
    expect(routeSessionId('/abc')).toBe('abc')
    expect(routeSessionId(sessionRoute(SESS_A))).toBe(SESS_A)
  })
})
