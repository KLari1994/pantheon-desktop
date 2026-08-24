import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const pluginSource = readFileSync(new URL('../plugin.js', import.meta.url), 'utf8')

function load() {
  const values = new Map()
  const atom = initial => {
    const slot = { get: () => values.get(slot), set: value => values.set(slot, value) }
    values.set(slot, initial)
    return slot
  }
  const requests = []
  const timeouts = []
  const context = {
    atom,
    PALETTE_AREA: 'palette',
    COMPOSER_AREAS: { middleware: 'middleware' },
    document: { getElementById: () => null, createElement: () => ({}), head: { appendChild: () => undefined } },
    setTimeout: (fn, delay) => {
      timeouts.push({ delay: Number(delay) || 0 })
      return timeouts.length
    },
    clearTimeout: () => undefined,
    host: {
      request: (method, params) => {
        requests.push({ method, params })
        return Promise.resolve({ profiles: [] })
      },
      state: {
        profile: { listen: () => undefined, get: () => 'default' },
        gateway: { listen: () => undefined, get: () => 'open' }
      }
    }
  }
  const source = pluginSource
    .replace(/^import\s+\*\s+as\s+sdk\s+from '@hermes\/plugin-sdk'\r?\n/m, '')
    .replace(/^import\s+\{[\s\S]*?\}\s+from '@hermes\/plugin-sdk'\r?\n/m, '')
    .replace(/^const \{ McpTab, ToolsetConfigPanel \} = sdk\r?\n/m, '')
    .replace(/^import .* from 'react'\r?\n/m, '')
    .replace(/^import .* from 'react\/jsx-runtime'\r?\n/m, '')
    .replace('export default {', 'globalThis.plugin = {')
    .concat(
      '\nglobalThis.__prefs = { $showLocalGroups, $showRoutines, setShowLocalGroups, setShowRoutines, SURFACE_DEFAULTS, setPluginCtx: value => { pluginCtx = value } };\n'
    )
  vm.runInNewContext(source, context, { filename: 'plugin.js' })
  return { ...context, requests, timeouts, __prefs: context.__prefs }
}

function storageFor(map) {
  return {
    get: key => (Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null),
    set: () => undefined
  }
}

async function drain() {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise(resolve => setImmediate(resolve))
}

test('shipped Pantheon defaults hide routines pane and local group sync', async () => {
  const runtime = load()
  const registered = []
  runtime.plugin.register({
    storage: { get: () => null },
    register: entry => registered.push(entry)
  })
  await drain()

  assert.equal(runtime.__prefs.SURFACE_DEFAULTS.showLocalGroups, false)
  assert.equal(runtime.__prefs.SURFACE_DEFAULTS.showRoutines, false)
  assert.equal(registered.some(entry => entry.id === 'pane'), true)
  assert.equal(registered.some(entry => entry.id === 'routines'), false)
  assert.equal(
    runtime.requests.some(call => call.method === 'profiles.configure' && call.params?.ui_meta?.['hermes-bots-groups']),
    false
  )
  assert.equal(
    runtime.requests.some(call => call.method === 'profiles.list'),
    false,
    'group hydration must not pull when local groups are off'
  )
  assert.equal(
    runtime.timeouts.some(timer => timer.delay === 350),
    false,
    'group-sync debounce must not be scheduled'
  )
})

test('persisted true restores upstream routines and group hydration', async () => {
  const runtime = load()
  const registered = []
  runtime.plugin.register({
    storage: storageFor({ 'show-routines': true, 'show-local-groups': true }),
    register: entry => registered.push(entry)
  })
  await drain()

  assert.equal(registered.some(entry => entry.id === 'routines'), true)
  assert.equal(runtime.requests.some(call => call.method === 'profiles.list'), true)
})

test('persisted false wins over a flipped SURFACE_DEFAULTS true', async () => {
  const runtime = load()
  runtime.__prefs.SURFACE_DEFAULTS.showLocalGroups = true
  runtime.__prefs.SURFACE_DEFAULTS.showRoutines = true
  const registered = []
  runtime.plugin.register({
    storage: storageFor({ 'show-routines': false, 'show-local-groups': false }),
    register: entry => registered.push(entry)
  })
  await drain()

  assert.equal(runtime.__prefs.$showLocalGroups.get(), false)
  assert.equal(runtime.__prefs.$showRoutines.get(), false)
  assert.equal(registered.some(entry => entry.id === 'routines'), false)
  assert.equal(runtime.requests.some(call => call.method === 'profiles.list'), false)
})
