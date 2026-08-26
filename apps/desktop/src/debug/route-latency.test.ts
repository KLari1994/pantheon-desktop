import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

describe('click-to-paint sampler (F1)', () => {
  const originalHref = window.location.href
  let sidebar: HTMLElement
  let button: HTMLButtonElement

  beforeEach(() => {
    window.__ROUTE_PERF__?.reset()
    sidebar = document.createElement('div')
    sidebar.setAttribute('data-sidebar', '')
    button = document.createElement('button')
    button.setAttribute('aria-label', 'Artifacts')
    button.textContent = 'Artifacts'
    sidebar.appendChild(button)
    document.body.appendChild(sidebar)
  })

  afterEach(() => {
    sidebar.remove()
    window.__ROUTE_PERF__?.reset()
    window.history.replaceState({}, '', originalHref)
  })

  it('does not record on pointerdown alone (waits for route commit)', async () => {
    button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    // flush a few frames — old bug recorded route=null here
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
    expect(window.__ROUTE_PERF__?.table() ?? []).toEqual([])
  })

  it('records click-to-paint from pointerdown through pushState with the HashRouter route', async () => {
    button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    window.history.pushState({}, '', '/index.html#/artifacts')
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
    const samples = window.__ROUTE_PERF__?.table() ?? []
    expect(samples).toHaveLength(1)
    expect(samples[0]?.label).toBe('Artifacts')
    expect(samples[0]?.route).toBe('/artifacts')
    expect(samples[0]?.phase).toBe('cold')
    expect(samples[0]?.clickToPaintMs).toBeGreaterThanOrEqual(0)
  })

  it('drops pending without a sample when no route commit arrives', async () => {
    vi.useFakeTimers()
    try {
      button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
      await vi.advanceTimersByTimeAsync(5_001)
      expect(window.__ROUTE_PERF__?.table() ?? []).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })
})
