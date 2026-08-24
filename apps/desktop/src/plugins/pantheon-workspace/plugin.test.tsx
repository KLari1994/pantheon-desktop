import { expect, test, vi } from 'vitest'

import type { PluginContext } from '@hermes/plugin-sdk'

import { NEW_CHAT_ROUTE } from '@/app/routes'

import plugin from './plugin'

function fakeCtx() {
  const contributions: Array<{ id: string; area: string; order?: number; data?: { path?: string; label?: string } }> = []
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
    i18n: { register: () => undefined, t: {} }
  }
}

test('registers /home and places Home nav before Rooms', () => {
  const ctx = fakeCtx()
  plugin.register(ctx as unknown as PluginContext)
  const paths = ctx.contributions.map(item => item.data?.path)
  expect(paths).toContain('/home')
  expect(NEW_CHAT_ROUTE).not.toBe('/home')
  const homeNav = ctx.contributions.find(item => item.data?.label === 'Home')
  const roomsNav = ctx.contributions.find(item => item.data?.label === 'Rooms')
  expect(homeNav).toBeTruthy()
  expect(roomsNav).toBeTruthy()
  expect((homeNav?.order ?? 99) < (roomsNav?.order ?? 0)).toBe(true)
  expect(ctx.contributions.findIndex(item => item.data?.label === 'Home')).toBeLessThan(
    ctx.contributions.findIndex(item => item.data?.label === 'Rooms')
  )
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
