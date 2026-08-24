import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  buildCompatibilityReceipt,
  evaluateCompatibility,
  writeCompatibilityReceipt,
  type PantheonCompatibilityReceipt
} from './pantheon-compatibility'

function tmpRoot(tag: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `pantheon-compat-${tag}-`))
}

function writeFile(root: string, rel: string, body: string | Buffer) {
  const dest = path.join(root, rel)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, body)
}

function digest(body: string | Buffer) {
  return createHash('sha256').update(body).digest('hex')
}

const T0 = Date.parse('2026-08-24T12:00:00.000Z')

describe('buildCompatibilityReceipt', () => {
  it('records pantheon, hermes, buzz, relay, acp, and windows fields', () => {
    const home = tmpRoot('fields')
    const updateRoot = path.join(home, 'hermes-agent')
    const resources = path.join(home, 'resources')
    const binary = process.platform === 'win32' ? 'buzz-bridge/buzz-bridge.exe' : 'buzz-bridge/buzz-bridge'
    const bytes = Buffer.from('bridge-bin')
    writeFile(updateRoot, 'package.json', JSON.stringify({ version: '9.9.9' }))
    writeFile(updateRoot, '.git/HEAD', 'ref: refs/heads/staging\n')
    writeFile(updateRoot, '.git/refs/heads/staging', 'abc123def456\n')
    writeFile(resources, 'install-stamp.json', JSON.stringify({ commit: 'd'.repeat(40) }))
    writeFile(resources, binary, bytes)
    writeFile(
      resources,
      'pantheon-adapters.json',
      JSON.stringify({ artifacts: [{ relPath: binary, sha256: digest(bytes) }] })
    )
    writeFile(home, 'pantheon/workspace.json', JSON.stringify({ buzz: { relayUrl: 'https://relay.example' } }))

    const receipt = buildCompatibilityReceipt({
      hermesHome: home,
      updateRoot,
      resourcesPath: resources,
      now: () => T0,
      platform: () => ({ platform: 'win32', release: '10.0.26100' })
    })

    expect(receipt.schemaVersion).toBe(1)
    expect(receipt.pantheon).toEqual({ version: '9.9.9', commit: 'd'.repeat(40) })
    expect(receipt.hermes.sourceCommit).toBe('abc123def456')
    expect(receipt.hermes.version).toBeNull()
    expect(receipt.buzzBridge.present).toBe(true)
    expect(receipt.buzzBridge.integrity).toBe('verified')
    expect(receipt.buzzBridge.pinnedVersion).not.toBe(receipt.buzzBridge.sha256)
    expect(receipt.relay.url).toBe('https://relay.example')
    expect(receipt.relay.protocolVersion).toBeNull()
    expect(receipt.acpBinder.schemaVersion).toBe(1)
    expect(receipt.windows).toEqual({ platform: 'win32', release: '10.0.26100' })
    expect(receipt.result).toBe('compatible')
  })

  it('refuses an unpinned or mismatched packaged adapter', () => {
    const home = tmpRoot('mismatch')
    const updateRoot = path.join(home, 'hermes-agent')
    const resources = path.join(home, 'resources')
    const binary = process.platform === 'win32' ? 'buzz-bridge/buzz-bridge.exe' : 'buzz-bridge/buzz-bridge'
    writeFile(resources, binary, 'tampered')
    writeFile(
      resources,
      'pantheon-adapters.json',
      JSON.stringify({ artifacts: [{ relPath: binary, sha256: digest('expected') }] })
    )

    const mismatched = buildCompatibilityReceipt({ hermesHome: home, updateRoot, resourcesPath: resources })
    expect(mismatched.result).toBe('incompatible')
    expect(mismatched.buzzBridge.integrity).toBe('mismatch')
    expect(evaluateCompatibility(mismatched).ok).toBe(false)

    const unpinnedHome = tmpRoot('unpinned')
    const unpinnedResources = path.join(unpinnedHome, 'resources')
    writeFile(unpinnedResources, binary, 'bridge')
    const unpinned = buildCompatibilityReceipt({
      hermesHome: unpinnedHome,
      updateRoot: path.join(unpinnedHome, 'src'),
      resourcesPath: unpinnedResources
    })
    expect(unpinned.result).toBe('incompatible')
    expect(unpinned.buzzBridge.integrity).toBe('unpinned')
  })

  it('verifies a packaged Windows sidecar receipt without pantheon-adapters.json', () => {
    const home = tmpRoot('sidecar')
    const updateRoot = path.join(home, 'hermes-agent')
    const resources = path.join(home, 'resources')
    const binary = process.platform === 'win32' ? 'buzz-bridge/buzz-bridge.exe' : 'buzz-bridge/buzz-bridge'
    const bytes = Buffer.from('packaged-bridge')
    writeFile(resources, binary, bytes)
    writeFile(resources, 'buzz-bridge/buzz-bridge.sha256', `${digest(bytes)}\n`)
    writeFile(updateRoot, 'hermes_cli/__init__.py', '__version__ = "0.20.5"\n')
    writeFile(updateRoot, 'pantheon/buzz-bridge/Cargo.toml', '[package]\nname = "buzz-bridge"\nversion = "0.1.0"\n')
    writeFile(home, 'pantheon/workspace.json', JSON.stringify({
      buzz: { relayUrl: 'https://user:secret@relay.example/path?token=abc#frag' }
    }))

    const receipt = buildCompatibilityReceipt({
      hermesHome: home,
      updateRoot,
      resourcesPath: resources
    })
    expect(receipt.buzzBridge.integrity).toBe('verified')
    expect(receipt.buzzBridge.version).toBe('0.1.0')
    expect(receipt.hermes.version).toBe('0.20.5')
    expect(receipt.acpBinder.version).toBeNull()
    expect(receipt.acpBinder.schemaVersion).toBe(1)
    expect(receipt.relay.url).toBe('https://relay.example/path')
    expect(receipt.result).toBe('compatible')
  })

  it('records hermes, buzz, and acp versions separately from hashes and schema numbers', () => {
    const home = tmpRoot('versions')
    const updateRoot = path.join(home, 'src')
    writeFile(updateRoot, 'hermes_cli/__init__.py', '__version__ = "1.2.3"\n')
    writeFile(updateRoot, 'pantheon/acp-binder/package.json', JSON.stringify({ version: '4.5.6' }))
    const receipt = buildCompatibilityReceipt({ hermesHome: home, updateRoot })
    expect(receipt.hermes).toEqual(expect.objectContaining({ version: '1.2.3', sourceCommit: null }))
    expect(receipt.acpBinder).toEqual(expect.objectContaining({ version: '4.5.6', schemaVersion: 1 }))
    expect(receipt.buzzBridge.sha256).toBeNull()
  })

  it('stays compatible when the bridge binary is absent', () => {
    const home = tmpRoot('absent')
    const receipt = buildCompatibilityReceipt({
      hermesHome: home,
      updateRoot: path.join(home, 'src'),
      resourcesPath: path.join(home, 'resources')
    })
    expect(receipt.buzzBridge.present).toBe(false)
    expect(receipt.buzzBridge.integrity).toBe('missing')
    expect(receipt.result).toBe('compatible')
    expect(receipt.reasons).toContain('buzz-bridge-absent')
  })

  it('stays compatible when the pantheon commit stamp is a fallback', () => {
    const home = tmpRoot('fallback')
    const updateRoot = path.join(home, 'src')
    const resources = path.join(home, 'resources')
    writeFile(resources, 'install-stamp.json', JSON.stringify({ commit: '0'.repeat(40), source: 'fallback' }))
    const receipt = buildCompatibilityReceipt({ hermesHome: home, updateRoot, resourcesPath: resources })
    expect(receipt.result).toBe('compatible')
    expect(receipt.reasons).toContain('pantheon-commit-unpinned')
  })

  it('writes a receipt under HERMES_HOME/pantheon/receipts', () => {
    const home = tmpRoot('write')
    const receipt: PantheonCompatibilityReceipt = {
      schemaVersion: 1,
      createdAt: '2026-08-24T12:00:00.000Z',
      pantheon: { version: '1.0.0', commit: null },
      hermes: { version: null, sourceCommit: null },
      buzzBridge: { present: false, version: null, pinnedVersion: null, sha256: null, integrity: 'missing' },
      relay: { url: null, protocolVersion: null },
      acpBinder: { version: null, schemaVersion: 1 },
      windows: { platform: 'linux', release: '6.8' },
      result: 'compatible',
      reasons: ['buzz-bridge-absent']
    }
    const dest = writeCompatibilityReceipt(home, receipt)
    expect(dest).toContain(`${path.join('pantheon', 'receipts')}${path.sep}compatibility-`)
    expect(JSON.parse(fs.readFileSync(dest, 'utf8')).schemaVersion).toBe(1)
  })
})
