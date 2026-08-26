import type { PluginContext } from '@hermes/plugin-sdk'
import { host, NEW_CHAT_ROUTE } from '@hermes/plugin-sdk'
import { expect, test, vi } from 'vitest'

import plugin from './plugin'

function fakeCtx() {
  const contributions: Array<{ id: string; area: string; order?: number; data?: { path?: string; label?: string } }> =
    []
  const disposers: Array<() => void> = []

  return {
    contributions,
    disposers,
    source: 'plugin:pantheon-workspace',
    register: (contribution: (typeof contributions)[number]) => {
      contributions.push(contribution)

      return () => undefined
    },
    registerMany: (items: Array<(typeof contributions)[number]>) => {
      contributions.push(...items)

      return () => undefined
    },
    onDispose: (fn: () => void) => {
      disposers.push(fn)
    },
    rest: async () => ({}),
    socket: () => () => undefined,
    os: {
      notify: vi.fn(),
      openExternal: async () => false,
      revealPath: async () => false,
      writeClipboard: async () => false
    },
    storage: {
      get: <T,>(_key: string, fallback: T) => fallback,
      set: () => undefined,
      remove: () => undefined
    },
    i18n: { register: vi.fn(), t: {} }
  }
}

test('registers /home and places Home nav before Rooms', () => {
  const ctx = fakeCtx()
  plugin.register(ctx as unknown as PluginContext)
  const paths = ctx.contributions.map(item => item.data?.path)
  expect(paths).toContain('/home')
  expect(NEW_CHAT_ROUTE).not.toBe('/home')
  const homeNav = ctx.contributions.find(item => item.data?.label === 'Home')
  const cronNav = ctx.contributions.find(item => item.data?.label === 'Cron Center')
  const roomsNav = ctx.contributions.find(item => item.data?.label === 'Rooms')
  expect(homeNav).toBeTruthy()
  expect(cronNav).toBeTruthy()
  expect(roomsNav).toBeTruthy()
  expect((homeNav?.order ?? 99) < (cronNav?.order ?? 0)).toBe(true)
  expect((cronNav?.order ?? 99) < (roomsNav?.order ?? 0)).toBe(true)
  expect(ctx.contributions.findIndex(item => item.data?.label === 'Home')).toBeLessThan(
    ctx.contributions.findIndex(item => item.data?.label === 'Cron Center')
  )
  expect(ctx.contributions.findIndex(item => item.data?.label === 'Cron Center')).toBeLessThan(
    ctx.contributions.findIndex(item => item.data?.label === 'Rooms')
  )
})

test('registers /cron-center and the plugin locale bundle', () => {
  const ctx = fakeCtx()
  plugin.register(ctx as unknown as PluginContext)
  expect(ctx.contributions.some(item => item.area === 'routes' && item.data?.path === '/cron-center')).toBe(true)
  expect(ctx.i18n.register).toHaveBeenCalled()
})

test('Home uses the only host nav API; permanent sidebar items stay ahead of contributions', () => {
  const ctx = fakeCtx()
  plugin.register(ctx as unknown as PluginContext)
  const homeNav = ctx.contributions.find(item => item.data?.label === 'Home')
  expect(homeNav?.area).toBe('sidebar.nav')
  expect(Object.keys(homeNav?.data || {}).sort()).toEqual(['codicon', 'label', 'path'])
})

test('binds a notification coordinator and disposes it', () => {
  const ctx = fakeCtx()
  plugin.register(ctx as unknown as PluginContext)
  expect(ctx.disposers.length).toBeGreaterThan(0)
  expect(() => ctx.disposers.forEach(dispose => dispose())).not.toThrow()
})

test('registers the one-segment /rooms route rather than /rooms/:id', () => {
  const ctx = fakeCtx()
  plugin.register(ctx as unknown as PluginContext)
  const roomPaths = ctx.contributions.filter(item => item.area === 'routes').map(item => item.data?.path)
  expect(roomPaths).toContain('/rooms')
  expect(roomPaths.some(path => path?.includes('/rooms/'))).toBe(true)
  expect(roomPaths.some(path => path === '/rooms/:id' || path?.startsWith('/rooms/:'))).toBe(false)
})

test('registers the one-segment /projects route after Rooms', () => {
  const ctx = fakeCtx()
  plugin.register(ctx as unknown as PluginContext)
  const routePaths = ctx.contributions.filter(item => item.area === 'routes').map(item => item.data?.path)
  expect(routePaths).toContain('/projects')
  expect(routePaths.some(path => path === '/projects/:id' || path?.startsWith('/projects/:'))).toBe(false)
  const roomsNav = ctx.contributions.find(item => item.data?.label === 'Rooms')
  const projectsNav = ctx.contributions.find(item => item.data?.label === 'Projects')
  expect(projectsNav).toBeTruthy()
  expect((roomsNav?.order ?? 99) < (projectsNav?.order ?? 0)).toBe(true)
  expect(ctx.contributions.findIndex(item => item.data?.label === 'Rooms')).toBeLessThan(
    ctx.contributions.findIndex(item => item.data?.label === 'Projects')
  )
})

test('registers the project locale bundle', () => {
  const ctx = fakeCtx()
  plugin.register(ctx as unknown as PluginContext)
  expect(ctx.i18n.register).toHaveBeenCalledTimes(2)
})

test('disposal exits /projects', () => {
  const navigate = vi.fn()
  const original = host.navigate
  host.navigate = navigate
  vi.stubGlobal('window', { ...window, location: { ...window.location, pathname: '/projects' } })
  const ctx = fakeCtx()
  plugin.register(ctx as unknown as PluginContext)
  ctx.disposers.forEach(dispose => dispose())
  host.navigate = original
  expect(navigate).toHaveBeenCalledWith('/')
  vi.unstubAllGlobals()
})

test('registers thin /search and /memory route roots after Projects', () => {
  const ctx = fakeCtx()
  plugin.register(ctx as unknown as PluginContext)
  const routePaths = ctx.contributions.filter(item => item.area === 'routes').map(item => item.data?.path)
  expect(routePaths).toContain('/search')
  expect(routePaths).toContain('/memory')
  const projectsNav = ctx.contributions.find(item => item.data?.label === 'Projects')
  const searchNav = ctx.contributions.find(item => item.data?.label === 'Search')
  const memoryNav = ctx.contributions.find(item => item.data?.label === 'Memory')
  expect(searchNav).toBeTruthy()
  expect(memoryNav).toBeTruthy()
  expect((projectsNav?.order ?? 99) < (searchNav?.order ?? 0)).toBe(true)
  expect((searchNav?.order ?? 99) < (memoryNav?.order ?? 0)).toBe(true)
})

test('registers the Grok Bot unavailable surface after Memory', () => {
  const ctx = fakeCtx()
  plugin.register(ctx as unknown as PluginContext)
  const routePaths = ctx.contributions.filter(item => item.area === 'routes').map(item => item.data?.path)
  expect(routePaths).toContain('/grok')
  const memoryNav = ctx.contributions.find(item => item.data?.label === 'Memory')
  const grokNav = ctx.contributions.find(item => item.data?.label === 'Grok Bot')
  expect(grokNav).toBeTruthy()
  expect((memoryNav?.order ?? 99) < (grokNav?.order ?? 0)).toBe(true)
})
