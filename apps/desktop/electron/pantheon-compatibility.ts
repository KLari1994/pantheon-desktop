import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { isFallbackCommit } from './bundle-skew'
import { type PinnedArtifact, sha256File, verifyPinnedArtifacts } from './hardening'
import { parseBuzzRelayUrlFromWorkspaceConfig } from './pantheon-buzz-ipc'
import { resolveBuzzBridgeBinary } from './pantheon-buzz-process'

export const PANTHEON_BINDER_SCHEMA_VERSION = 1

export interface PantheonCompatibilityReceipt {
  schemaVersion: 1
  createdAt: string
  pantheon: { version: string | null; commit: string | null }
  hermes: { version: string | null; sourceCommit: string | null }
  buzzBridge: {
    present: boolean
    version: string | null
    pinnedVersion: string | null
    sha256: string | null
    integrity: 'verified' | 'mismatch' | 'missing' | 'unpinned'
  }
  relay: { url: string | null; protocolVersion: string | null }
  acpBinder: { version: string | null; schemaVersion: number | null }
  windows: { platform: string; release: string }
  result: 'compatible' | 'incompatible'
  reasons: string[]
}

export interface CompatibilityDeps {
  hermesHome: string
  updateRoot: string
  resourcesPath?: string
  fs?: typeof fs
  now?: () => number
  platform?: () => { platform: string; release: string }
}

function readText(fsImpl: typeof fs, filePath: string): string | null {
  try {
    return fsImpl.readFileSync(filePath, 'utf8')
  } catch {
    return null
  }
}

function readJson(fsImpl: typeof fs, filePath: string): Record<string, unknown> | null {
  const text = readText(fsImpl, filePath)

  if (!text) {
    return null
  }

  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return null
  }
}

function readVersionAssignment(text: string | null): string | null {
  const match = text?.match(/(?:^|\n)\s*(?:__version__|version)\s*=\s*["']([^"']+)["']/)
  return match?.[1] || null
}

function readTomlPackageVersion(text: string | null): string | null {
  const match = text?.match(/\[package\][\s\S]*?^version\s*=\s*["']([^"']+)["']/m)
  return match?.[1] || null
}

function readFirstVersion(
  fsImpl: typeof fs,
  candidates: string[],
  extract: (text: string | null) => string | null
): string | null {
  for (const candidate of candidates) {
    const version = extract(readText(fsImpl, candidate))

    if (version) {
      return version
    }
  }

  return null
}

function sanitizeRelayUrl(url: string | null): string | null {
  if (!url) {
    return null
  }

  try {
    const parsed = new URL(url)
    parsed.username = ''
    parsed.password = ''
    parsed.search = ''
    parsed.hash = ''
    return `${parsed.origin}${parsed.pathname === '/' ? '' : parsed.pathname}`
  } catch {
    const withoutUserinfo = url.replace(/^([a-z]+:\/\/)[^@/]+@/i, '$1')
    return withoutUserinfo.split(/[?#]/)[0] || null
  }
}

function readHermesSourceCommit(updateRoot: string, fsImpl: typeof fs): string | null {
  const headPath = path.join(updateRoot, '.git', 'HEAD')
  const head = readText(fsImpl, headPath)?.trim()

  if (!head) {
    return null
  }

  if (head.startsWith('ref:')) {
    const ref = head.slice(4).trim()
    const refText = readText(fsImpl, path.join(updateRoot, '.git', ref))?.trim()

    return refText || null
  }

  return head || null
}

function readPantheonIdentity(
  updateRoot: string,
  resourcesPath: string | undefined,
  fsImpl: typeof fs
): { version: string | null; commit: string | null } {
  const packageCandidates = [
    path.join(updateRoot, 'apps', 'desktop', 'package.json'),
    path.join(updateRoot, 'package.json')
  ]
  let version: string | null = null

  for (const candidate of packageCandidates) {
    const parsed = readJson(fsImpl, candidate)
    const next = typeof parsed?.version === 'string' ? parsed.version : null

    if (next) {
      version = next
      break
    }
  }

  const stampCandidates = [
    resourcesPath ? path.join(resourcesPath, 'install-stamp.json') : null,
    path.join(updateRoot, 'apps', 'desktop', 'build', 'install-stamp.json')
  ].filter((value): value is string => Boolean(value))

  let commit: string | null = null

  for (const candidate of stampCandidates) {
    const parsed = readJson(fsImpl, candidate)
    const next = typeof parsed?.commit === 'string' ? parsed.commit : null

    if (next) {
      commit = next
      break
    }
  }

  return { version, commit }
}

function readRelayUrl(hermesHome: string, fsImpl: typeof fs): string | null {
  const candidates = [path.join(hermesHome, 'pantheon', 'workspace.json'), path.join(hermesHome, 'config.yaml')]

  for (const candidate of candidates) {
    const text = readText(fsImpl, candidate)

    if (!text) {
      continue
    }

    const url = parseBuzzRelayUrlFromWorkspaceConfig(text)

    if (url) {
      return sanitizeRelayUrl(url)
    }
  }

  return null
}

function readAdapterManifest(resourcesPath: string | undefined, fsImpl: typeof fs): PinnedArtifact[] | null {
  if (!resourcesPath) {
    return null
  }

  const parsed = readJson(fsImpl, path.join(resourcesPath, 'pantheon-adapters.json'))
  const artifacts = parsed?.artifacts

  if (!Array.isArray(artifacts)) {
    return null
  }

  return artifacts.filter(
    (item): item is PinnedArtifact =>
      Boolean(item) &&
      typeof item === 'object' &&
      typeof (item as PinnedArtifact).relPath === 'string' &&
      typeof (item as PinnedArtifact).sha256 === 'string'
  )
}

function inspectBuzzBridge(
  resourcesPath: string | undefined,
  updateRoot: string,
  fsImpl: typeof fs
): PantheonCompatibilityReceipt['buzzBridge'] {
  const root = resourcesPath || process.cwd()
  const binaryPath = resolveBuzzBridgeBinary(root)
  const present = Boolean(readText(fsImpl, binaryPath) !== null || (() => {
    try {
      return fsImpl.statSync(binaryPath).isFile()
    } catch {
      return false
    }
  })())
  const version = readFirstVersion(
    fsImpl,
    [
      path.join(updateRoot, 'pantheon', 'buzz-bridge', 'Cargo.toml'),
      path.join(root, 'buzz-bridge', 'Cargo.toml'),
      path.join(root, 'buzz-bridge', 'VERSION')
    ],
    text => readTomlPackageVersion(text) || readVersionAssignment(text) || (text?.trim() && !text.includes('\n') ? text.trim() : null)
  )

  if (!present) {
    return { present: false, version, pinnedVersion: version, sha256: null, integrity: 'missing' }
  }

  let digest: string | null = null

  try {
    digest = sha256File(binaryPath, fsImpl)
  } catch {
    digest = null
  }

  const manifest = readAdapterManifest(resourcesPath, fsImpl)
  const sidecarPath = path.join(path.dirname(binaryPath), 'buzz-bridge.sha256')
  const sidecarHash = readText(fsImpl, sidecarPath)?.trim() || null

  if (manifest) {
    const relative = path.relative(root, binaryPath).replace(/\\/g, '/')
    const pin = manifest.find(item => item.relPath === relative || item.relPath.endsWith(path.basename(binaryPath)))
    const verification = verifyPinnedArtifacts(root, pin ? [pin] : manifest, fsImpl)

    if (!pin) {
      return { present: true, version, pinnedVersion: version, sha256: digest, integrity: 'unpinned' }
    }

    return {
      present: true,
      version,
      pinnedVersion: version,
      sha256: digest,
      integrity: verification.ok ? 'verified' : 'mismatch'
    }
  }

  if (sidecarHash && digest) {
    return {
      present: true,
      version,
      pinnedVersion: version,
      sha256: digest,
      integrity: sidecarHash === digest ? 'verified' : 'mismatch'
    }
  }

  return { present: true, version, pinnedVersion: version, sha256: digest, integrity: 'unpinned' }
}

export function evaluateCompatibility(receipt: PantheonCompatibilityReceipt): { ok: boolean; reasons: string[] } {
  const reasons = [...receipt.reasons]

  if (receipt.buzzBridge.present && (receipt.buzzBridge.integrity === 'mismatch' || receipt.buzzBridge.integrity === 'unpinned')) {
    reasons.push(
      receipt.buzzBridge.integrity === 'mismatch'
        ? 'buzz-bridge-integrity-mismatch'
        : 'buzz-bridge-unpinned'
    )

    return { ok: false, reasons: [...new Set(reasons)] }
  }

  return { ok: true, reasons: [...new Set(reasons)] }
}

export function buildCompatibilityReceipt(deps: CompatibilityDeps): PantheonCompatibilityReceipt {
  const fsImpl = deps.fs ?? fs
  const createdAt = new Date((deps.now ?? Date.now)()).toISOString()
  const pantheon = readPantheonIdentity(deps.updateRoot, deps.resourcesPath, fsImpl)
  const hermesCommit = readHermesSourceCommit(deps.updateRoot, fsImpl)
  const hermesVersion = readFirstVersion(
    fsImpl,
    [
      path.join(deps.updateRoot, 'hermes_cli', '__init__.py'),
      path.join(deps.updateRoot, 'pyproject.toml')
    ],
    text => readVersionAssignment(text) || readTomlPackageVersion(text)
  )
  const acpVersion = readFirstVersion(
    fsImpl,
    [
      path.join(deps.updateRoot, 'pantheon', 'acp-binder', 'package.json'),
      path.join(deps.updateRoot, 'apps', 'desktop', 'pantheon', 'acp-binder', 'package.json')
    ],
    text => {
      try {
        const parsed = text ? (JSON.parse(text) as { version?: unknown }) : null
        return typeof parsed?.version === 'string' ? parsed.version : null
      } catch {
        return null
      }
    }
  )
  const buzzBridge = inspectBuzzBridge(deps.resourcesPath, deps.updateRoot, fsImpl)
  const reasons: string[] = []

  if (!buzzBridge.present) {
    reasons.push('buzz-bridge-absent')
  }

  if (!pantheon.commit || isFallbackCommit(pantheon.commit)) {
    reasons.push('pantheon-commit-unpinned')
  }

  const host = deps.platform?.() ?? { platform: os.platform(), release: os.release() }
  const draft: PantheonCompatibilityReceipt = {
    schemaVersion: 1,
    createdAt,
    pantheon,
    hermes: { version: hermesVersion, sourceCommit: hermesCommit },
    buzzBridge,
    relay: { url: readRelayUrl(deps.hermesHome, fsImpl), protocolVersion: null },
    acpBinder: { version: acpVersion, schemaVersion: PANTHEON_BINDER_SCHEMA_VERSION },
    windows: host,
    result: 'compatible',
    reasons
  }
  const evaluation = evaluateCompatibility(draft)

  return {
    ...draft,
    result: evaluation.ok ? 'compatible' : 'incompatible',
    reasons: evaluation.reasons
  }
}

export function writeCompatibilityReceipt(
  hermesHome: string,
  receipt: PantheonCompatibilityReceipt,
  fsImpl: typeof fs = fs
): string {
  const dir = path.join(hermesHome, 'pantheon', 'receipts')
  fsImpl.mkdirSync(dir, { recursive: true })
  const stamp = receipt.createdAt.replace(/[:]/g, '-')
  const dest = path.join(dir, `compatibility-${stamp}.json`)
  fsImpl.writeFileSync(dest, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8')

  return dest
}
