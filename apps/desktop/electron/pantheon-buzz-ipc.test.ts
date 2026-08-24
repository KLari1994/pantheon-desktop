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
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pantheon-buzz-home-'))
  try {
    const workspacePath = path.join(homeDir, 'pantheon', 'workspace.json')
    fs.mkdirSync(path.dirname(workspacePath), { recursive: true })
    fs.writeFileSync(
      workspacePath,
      JSON.stringify({ buzz: { relayUrl: 'https://community.example.test' } })
    )
    process.env.PANTHEON_BUZZ_RELAY_URL = 'https://env-escape.example.test'
    assert.equal(resolveBuzzRelayUrl({ homeDir }), 'https://community.example.test')
    assert.equal(
      parseBuzzRelayUrlFromWorkspaceConfig('relay_url: https://from-yaml.example.test'),
      'https://from-yaml.example.test'
    )
    assert.equal(resolveBuzzRelayUrl({ homeDir: undefined }), undefined)
  } finally {
    delete process.env.PANTHEON_BUZZ_RELAY_URL
    fs.rmSync(homeDir, { recursive: true, force: true })
  }
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

test('write IPC channels are allowlisted and validators reject oversized payloads', async () => {
  assert.deepEqual(Object.values(PANTHEON_BUZZ_IPC).sort(), [
    'pantheon-buzz:members.add',
    'pantheon-buzz:members.remove',
    'pantheon-buzz:messages.send',
    'pantheon-buzz:messages.window',
    'pantheon-buzz:reactions.add',
    'pantheon-buzz:reactions.remove',
    'pantheon-buzz:rooms.get',
    'pantheon-buzz:rooms.list',
    'pantheon-buzz:status',
    'pantheon-buzz:subscribe.start',
    'pantheon-buzz:subscribe.stop',
    'pantheon-buzz:workspace.manifest',
    'pantheon-buzz:workspace.updateRoomMembership'
  ].sort())
  const api = registerPantheonBuzzIpc({
    ipcMain: ipcMain as never,
    createProcess: () => ({
      request: async () => ({}),
      onEvent: () => () => undefined,
      dispose: () => undefined
    })
  })
  await assert.rejects(async () => {
    await handlers.get(PANTHEON_BUZZ_IPC.sendMessage)!({}, { roomId: 'room-a', content: 'x'.repeat(64 * 1024 + 1) })
  })
  await assert.rejects(async () => {
    await handlers.get(PANTHEON_BUZZ_IPC.addReaction)!({}, { roomId: 'room-a', targetEventId: 'evt-1', emoji: '🙂'.repeat(65) })
  })
  api.dispose()
})

test('sidecar events fan out and skip key-shaped frames', () => {
  const forwarded: unknown[] = []
  let emit: ((frame: unknown) => void) | undefined
  const api = registerPantheonBuzzIpc({
    ipcMain: ipcMain as never,
    broadcast: (_channel, payload) => forwarded.push(payload),
    createProcess: () => ({
      request: async () => ({}),
      onEvent: callback => {
        emit = callback
        return () => undefined
      },
      dispose: () => undefined
    })
  })
  emit?.({ type: 'room.event', room_id: 'room-a', event: { id: 'evt-2' } })
  emit?.({ type: 'room.event', event: { secret: 'ab'.repeat(32) } })
  assert.equal(forwarded.length, 1)
  assert.equal((forwarded[0] as { room_id: string }).room_id, 'room-a')
  api.dispose()
})

test('workspace manifest read and membership update round-trip', async () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pantheon-buzz-manifest-'))
  try {
    const filePath = path.join(homeDir, 'pantheon', 'workspace.json')
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify({ version: 1, buzz: { relayUrl: 'https://relay.example.test' } }))
    const api = registerPantheonBuzzIpc({
      ipcMain: ipcMain as never,
      homeDir,
      createProcess: () => ({
        request: async () => ({}),
        onEvent: () => () => undefined,
        dispose: () => undefined
      })
    })
    const read = await handlers.get(PANTHEON_BUZZ_IPC.workspaceManifest)!({}) as Record<string, unknown>
    assert.equal((read.buzz as { relayUrl: string }).relayUrl, 'https://relay.example.test')
    const updated = await handlers.get(PANTHEON_BUZZ_IPC.updateRoomMembership)!({}, {
      roomId: 'room-a',
      kind: 'office',
      memberAgentIds: ['agent-1']
    }) as { rooms: Array<{ id: string; memberAgentIds: string[] }> }
    assert.deepEqual(updated.rooms[0], { id: 'room-a', kind: 'office', name: 'room-a', memberAgentIds: ['agent-1'] })
    const persisted = JSON.parse(fs.readFileSync(filePath, 'utf8')) as typeof updated
    assert.deepEqual(persisted.rooms[0].memberAgentIds, ['agent-1'])
    api.dispose()
  } finally {
    fs.rmSync(homeDir, { recursive: true, force: true })
  }
})
