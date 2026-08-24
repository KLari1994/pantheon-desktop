import { type ChildProcess, spawn, type SpawnOptions } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

export const REQUEST_TIMEOUT_MS = 10_000
export const RESTART_BACKOFF_MS = [250, 1_000, 4_000] as const
export const MAX_RESTARTS = 3

const BRIDGE_ENV_ALLOWLIST = new Set([
  'PATH',
  'PATHEXT',
  'SystemRoot',
  'SYSTEMROOT',
  'TEMP',
  'TMP',
  'TMPDIR',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'LC_MESSAGES'
])

export function isPrivateKeyShaped(value: string): boolean {
  return /^nsec1[0-9a-z]{20,}$/i.test(value) || /^[0-9a-f]{64}$/i.test(value)
}

export function sanitizeBridgeEnv(env: NodeJS.ProcessEnv | Record<string, string | undefined>): Record<string, string> {
  const next: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (typeof value !== 'string' || isPrivateKeyShaped(value)) {
      continue
    }
    if (!BRIDGE_ENV_ALLOWLIST.has(key)) {
      continue
    }
    next[key] = value
  }
  return next
}

export interface BuzzProcessOptions {
  binaryPath: string
  relayUrl?: string
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>
  requestTimeoutMs?: number
  spawnImpl?: (command: string, args: string[], options: SpawnOptions) => ChildProcess
  sleep?: (ms: number) => void | Promise<void>
  now?: () => number
}

export interface BuzzBridgeRequestResult {
  ok: boolean
  result?: unknown
  error?: { code?: string; message?: string }
}

export interface PantheonBuzzProcess {
  request(method: string, params?: Record<string, unknown>): Promise<unknown>
  onEvent(callback: (frame: unknown) => void): () => void
  dispose(): void
}

export function resolveBuzzBridgeBinary(root = process.resourcesPath || process.cwd()): string {
  const name = process.platform === 'win32' ? 'buzz-bridge.exe' : 'buzz-bridge'
  return path.join(root, 'buzz-bridge', name)
}

export function createPantheonBuzzProcess(options: BuzzProcessOptions): PantheonBuzzProcess {
  const spawnImpl = options.spawnImpl ?? spawn
  const sleep =
    options.sleep ??
    ((ms: number) =>
      new Promise<void>(resolve => {
        setTimeout(resolve, ms)
      }))
  const timeoutMs = options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS
  let child: ChildProcess | null = null
  let restarts = 0
  let disposed = false
  let buffer = ''
  const pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  const eventListeners = new Set<(frame: unknown) => void>()

  const args = options.relayUrl ? ['--relay-url', options.relayUrl] : []
  const env = sanitizeBridgeEnv(options.env ?? process.env)

  const attach = (next: ChildProcess) => {
    child = next
    buffer = ''
    next.stdout?.setEncoding('utf8')
    next.stdout?.on('data', (chunk: string) => {
      buffer += chunk
      let newline = buffer.indexOf('\n')
      while (newline >= 0) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        handleLine(line)
        newline = buffer.indexOf('\n')
      }
    })
    next.on('error', () => {
      // Missing sidecar or spawn failure must not take down Electron.
    })
    next.on('exit', () => {
      if (disposed) {
        return
      }
      if (restarts >= MAX_RESTARTS) {
        return
      }
      const delay = RESTART_BACKOFF_MS[restarts] ?? RESTART_BACKOFF_MS[RESTART_BACKOFF_MS.length - 1]
      restarts += 1
      void Promise.resolve(sleep(delay)).then(() => {
        if (!disposed) {
          boot()
        }
      })
    })
  }

  const boot = () => {
    try {
      const next = spawnImpl(options.binaryPath, args, {
        shell: false,
        windowsHide: true,
        env,
        stdio: ['pipe', 'pipe', 'pipe']
      })
      attach(next)
    } catch {
      // A thrown spawn (missing binary in some stubs) must not crash the app.
    }
  }

  const handleLine = (line: string) => {
    if (!line.trim()) {
      return
    }
    try {
      const parsed = JSON.parse(line) as { id?: string; ok?: boolean; result?: unknown; error?: { message?: string }; type?: string }
      const waiter = parsed.id ? pending.get(parsed.id) : undefined
      if (!waiter) {
        if (parsed.type) {
          for (const listener of eventListeners) {
            listener(parsed)
          }
        }
        return
      }
      clearTimeout(waiter.timer)
      pending.delete(parsed.id as string)
      if (parsed.ok) {
        waiter.resolve(parsed.result)
      } else {
        waiter.reject(new Error(parsed.error?.message || 'buzz bridge error'))
      }
    } catch {
      /* malformed sidecar frames are ignored at the parent */
    }
  }

  boot()

  return {
    request(method, params = {}) {
      const id = randomUUID()
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id)
          reject(new Error('buzz bridge timeout'))
        }, timeoutMs)
        pending.set(id, { resolve, reject, timer })
        try {
          child?.stdin?.write(`${JSON.stringify({ id, method, params })}\n`)
        } catch {
          clearTimeout(timer)
          pending.delete(id)
          reject(new Error('buzz bridge unavailable'))
        }
      })
    },
    onEvent(callback) {
      eventListeners.add(callback)
      return () => {
        eventListeners.delete(callback)
      }
    },
    dispose() {
      disposed = true
      for (const waiter of pending.values()) {
        clearTimeout(waiter.timer)
        waiter.reject(new Error('buzz bridge disposed'))
      }
      pending.clear()
      child?.kill()
      child = null
    }
  }
}
