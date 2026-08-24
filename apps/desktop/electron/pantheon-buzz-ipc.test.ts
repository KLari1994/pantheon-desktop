import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'

import { afterEach, test } from 'vitest'

import {
  isPrivateKeyShaped,
  PANTHEON_BUZZ_IPC,
  parseBuzzRelayUrlFromWorkspaceConfig,
  registerPantheonBuzzIpc,
  resolveBuzzRelayUrl,
  RESTART_BACKOFF_MS,
  sanitizeBridgeEnv,
  validateMessageLimit
} from './pantheon-buzz-ipc'
import { createPantheonBuzzProcess } from './pantheon-buzz-process'

class FakeChild extends EventEmitter {
  pid = 4242
  stdin = new PassThrough()
  stdout = new PassThrough()
  stderr = new PassThrough()
  killed = false
  kill = () => {
    this.killed = true
    this.emit('exit', 0, null)
    return true
  }
}

const handlers = new Map<string, (...args: unknown[]) => unknown>()

const ipcMain = {
  handle(channel: string, listener: (...args: unknown[]) => unknown) {
    handlers.set(channel, listener)
  },
  removeHandler(channel: string) {
    handlers.delete(channel)
  }
}

afterEach(() => {
  handlers.clear()
})

test('spawn uses shell false and strips key-shaped env/args', () => {
  const canary = `nsec1${'qpzry9x8gf2tvdw0s3jn54khce6mua7l'}`
  const hexCanary = 'ab'.repeat(32)
  let captured: { args: string[]; command: string; options: Record<string, unknown> } | undefined
  const child = new FakeChild()
  const processHandle = createPantheonBuzzProcess({
    binaryPath: '/opt/pantheon/buzz-bridge',
    relayUrl: 'https://relay.example.test',
    env: { PATH: '/usr/bin', LEAK: canary, HEX: hexCanary, PANTHEON_BUZZ_RELAY_URL: 'https://relay.example.test' },
    spawnImpl: (command, args, options) => {
      captured = { args, command, options: options as Record<string, unknown> }
      return child as never
    }
  })

  assert.equal(captured?.options.shell, false)
  assert.deepEqual(captured?.args, ['--relay-url', 'https://relay.example.test'])
  const env = captured?.options.env as Record<string, string>
  assert.equal(env.LEAK, undefined)
  assert.equal(env.HEX, undefined)
  assert.equal(env.PANTHEON_BUZZ_RELAY_URL, undefined)
  assert.equal(env.PATH, '/usr/bin')
  assert.equal(JSON.stringify(captured).includes(canary), false)
  assert.equal(JSON.stringify(captured).includes(hexCanary), false)
  processHandle.dispose()
  assert.equal(child.killed, true)
})

test('message limit is 1 through 200', () => {
  assert.equal(validateMessageLimit(1), 1)
  assert.equal(validateMessageLimit(200), 200)
  assert.throws(() => validateMessageLimit(0))
  assert.throws(() => validateMessageLimit(201))
})

test('ipc rejects out-of-range limits and unknown rooms stay typed', async () => {
  const child = new FakeChild()
  child.stdout.on('pipe', () => undefined)
  const api = registerPantheonBuzzIpc({
    ipcMain: ipcMain as never,
    createProcess: () =>
      createPantheonBuzzProcess({
        binaryPath: '/opt/pantheon/buzz-bridge',
        spawnImpl: () => child as never
      })
  })

  queueMicrotask(() => {
    child.stdout.write(
      `${JSON.stringify({ id: '00000000-0000-4000-8000-000000000001', ok: false, error: { code: 'invalid_limit' } })}\n`
    )
  })

  await assert.rejects(async () =>
    handlers.get(PANTHEON_BUZZ_IPC.getMessages)!({}, { roomId: 'room-a', limit: 201 })
  )
  api.dispose()
})

test('crash restarts with 250ms then 1s then 4s and then stops', async () => {
  assert.deepEqual(RESTART_BACKOFF_MS, [250, 1000, 4000])
  const delays: number[] = []
  const children = [new FakeChild(), new FakeChild(), new FakeChild(), new FakeChild()]
  let index = 0
  const handle = createPantheonBuzzProcess({
    binaryPath: '/opt/pantheon/buzz-bridge',
    now: () => 0,
    sleep: ms => {
      delays.push(ms)
    },
    spawnImpl: () => children[index++] as never
  })
  children[0].emit('exit', 1, null)
  await Promise.resolve()
  children[1].emit('exit', 1, null)
  await Promise.resolve()
  children[2].emit('exit', 1, null)
  await Promise.resolve()
  children[3].emit('exit', 1, null)
  await Promise.resolve()
  assert.deepEqual(delays, [250, 1000, 4000])
  handle.dispose()
})

test('timeout fails the in-flight request without leaking canaries', async () => {
  const canary = `nsec1${'qpzry9x8gf2tvdw0s3jn54khce6mua7l'}`
  const child = new FakeChild()
  const handle = createPantheonBuzzProcess({
    binaryPath: '/opt/pantheon/buzz-bridge',
    requestTimeoutMs: 5,
    env: { SECRET: canary },
    spawnImpl: () => child as never
  })
  await assert.rejects(() => handle.request('status', {}))
  assert.equal(isPrivateKeyShaped(canary), true)
  assert.equal(isPrivateKeyShaped('room-a'), false)
  handle.dispose()
})

test('sanitizeBridgeEnv allowlists PATH and drops secret-bearing keys', () => {
  const canary = 'cd'.repeat(32)
  const env = sanitizeBridgeEnv({
    PATH: '/bin',
    KEY: canary,
    OK: 'relay',
    BUZZ_PRIVATE_KEY: 'not-hex-but-secret',
    PANTHEON_BUZZ_RELAY_URL: 'https://relay.example.test'
  })
  assert.equal(env.KEY, undefined)
  assert.equal(env.OK, undefined)
  assert.equal(env.BUZZ_PRIVATE_KEY, undefined)
  assert.equal(env.PANTHEON_BUZZ_RELAY_URL, undefined)
  assert.equal(env.PATH, '/bin')
})

test('workspace config supplies relay URL and ignores env escape hatches', () => {
  const homeDir = path.join('home', 'user', '.hermes')
  const workspacePath = path.join(homeDir, 'pantheon', 'workspace.json')
  const files: Record<string, string> = {
    [workspacePath]: JSON.stringify({
      buzz: { relayUrl: 'https://community.example.test' }
    })
  }
  assert.equal(
    resolveBuzzRelayUrl({
      homeDir,
      readFile: filePath => files[filePath]
    }),
    'https://community.example.test'
  )
  assert.equal(parseBuzzRelayUrlFromWorkspaceConfig('relay_url: https://from-yaml.example.test'), 'https://from-yaml.example.test')
  assert.equal(resolveBuzzRelayUrl({ homeDir: undefined }), undefined)
})

test('spawn error is swallowed so the desktop shell stays up', () => {
  const child = new FakeChild()
  const handle = createPantheonBuzzProcess({
    binaryPath: '/missing/buzz-bridge',
    spawnImpl: () => {
      queueMicrotask(() => child.emit('error', new Error('ENOENT')))
      return child as never
    }
  })
  child.emit('error', new Error('ENOENT'))
  handle.dispose()
})
