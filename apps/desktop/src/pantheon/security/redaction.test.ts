import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  pantheonAdapterInstallBlockReason,
  secretShapedValue,
  verifyPinnedArtifacts
} from '../../../electron/hardening'
import { createPantheonUpdateBackup } from '../../../electron/pantheon-backup'
import { isPrivateKeyShaped, sanitizeBridgeEnv } from '../../../electron/pantheon-buzz-process'
import { buildCompatibilityReceipt } from '../../../electron/pantheon-compatibility'
import { resolveUpdateScriptHandoff, wrapHandoffForDetachedConsole } from '../../../electron/updater-process'

function tmp(tag: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `pantheon-redaction-${tag}-`))
}

function writeFile(root: string, rel: string, body: string | Buffer) {
  const dest = path.join(root, rel)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, body)
}

function hasSecretShape(value: unknown, key = ''): boolean {
  if (key === 'sha256' || key === 'pinnedVersion') {
    return false
  }

  if (typeof value === 'string') {
    return (
      secretShapedValue(value) ||
      value.split(/[\s"'=:{},[\]]+/).some(token => token.length > 0 && secretShapedValue(token))
    )
  }

  if (Array.isArray(value)) {
    return value.some(item => hasSecretShape(item))
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).some(([nextKey, next]) => hasSecretShape(next, nextKey))
  }

  return false
}

describe('desktop security receipts', () => {
  it('catches secret shapes and passes benign values', () => {
    expect(secretShapedValue(`nsec1${'q'.repeat(24)}`)).toBe(true)
    expect(isPrivateKeyShaped('a'.repeat(64))).toBe(true)
    expect(secretShapedValue('sk-abcdefghijklmnop')).toBe(true)
    expect(secretShapedValue('Bearer abcdefghijklmnopqr')).toBe(true)
    expect(secretShapedValue('npub1alice')).toBe(false)
    expect(secretShapedValue('deadbeef')).toBe(false)
    expect(secretShapedValue('https://relay.example')).toBe(false)
  })

  it('drops secret-shaped and non-allowlisted env vars', () => {
    const env = sanitizeBridgeEnv({
      PATH: '/usr/bin',
      OPENAI_API_KEY: 'sk-abcdefghijklmnop',
      RELAY: 'a'.repeat(64),
      LANG: 'C'
    })

    expect(env).toEqual({ PATH: '/usr/bin', LANG: 'C' })
  })

  it('keeps planted keys out of backup and compatibility receipts', () => {
    const home = tmp('receipts')
    const updateRoot = path.join(home, 'hermes-agent')
    const resources = path.join(home, 'resources')
    writeFile(home, 'pantheon/workspace.json', JSON.stringify({ buzz: { relayUrl: 'https://relay.example' } }))
    writeFile(home, 'config.yaml', `relay_key: ${'b'.repeat(64)}\n`)
    writeFile(home, '.env', 'SECRET=sk-abcdefghijklmnop\n')
    const backup = createPantheonUpdateBackup(home)
    expect(hasSecretShape(backup)).toBe(false)

    const binary = process.platform === 'win32' ? 'buzz-bridge/buzz-bridge.exe' : 'buzz-bridge/buzz-bridge'
    const bytes = Buffer.from('bridge')
    writeFile(resources, binary, bytes)
    writeFile(
      resources,
      'pantheon-adapters.json',
      JSON.stringify({ artifacts: [{ relPath: binary, sha256: createHash('sha256').update(bytes).digest('hex') }] })
    )
    const receipt = buildCompatibilityReceipt({ hermesHome: home, updateRoot, resourcesPath: resources })
    expect(hasSecretShape(receipt)).toBe(false)
  })

  it('keeps update handoff args free of env-derived secrets', () => {
    const handoff = resolveUpdateScriptHandoff('/opt/hermes', {
      isWindows: true,
      fileExists: candidate => candidate.endsWith('windows.ps1')
    })

    expect(handoff).toBeTruthy()
    const wrapped = wrapHandoffForDetachedConsole(handoff!, ['--branch', 'staging'])
    const joined = [...wrapped.args, ...handoff!.args].join(' ')
    expect(secretShapedValue(joined)).toBe(false)
    expect(joined).not.toMatch(/sk-/)
    expect(joined).not.toMatch(/nsec1/)
  })

  it('rejects a tampered adapter and remote adapter identifiers', () => {
    const root = tmp('pin')
    writeFile(root, 'buzz-bridge/buzz-bridge', 'tampered')

    const result = verifyPinnedArtifacts(root, [{ relPath: 'buzz-bridge/buzz-bridge', sha256: '0'.repeat(64) }])

    expect(result.ok).toBe(false)
    expect(result.failures[0]?.reason).toBe('hash-mismatch')
    expect(pantheonAdapterInstallBlockReason('https://github.com/acme/buzz-bridge')).toMatch(/rejected/)
  })
})
