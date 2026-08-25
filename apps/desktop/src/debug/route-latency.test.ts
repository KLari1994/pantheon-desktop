import { afterEach, describe, expect, it } from 'vitest'

import { currentRoute } from './route-latency'

describe('currentRoute', () => {
  const originalHref = window.location.href

  afterEach(() => {
    window.history.replaceState({}, '', originalHref)
  })

  it('reads the HashRouter path, not location.pathname', () => {
    window.history.replaceState({}, '', '/index.html#/artifacts')
    expect(window.location.pathname).toBe('/index.html')
    expect(currentRoute()).toBe('/artifacts')
  })

  it('strips hash query params so cold/warm keys stay per-route', () => {
    window.history.replaceState({}, '', '/index.html#/skills?tab=mcp')
    expect(currentRoute()).toBe('/skills')
  })

  it('falls back to pathname when the hash is empty', () => {
    window.history.replaceState({}, '', '/index.html')
    expect(currentRoute()).toBe('/index.html')
  })
})
