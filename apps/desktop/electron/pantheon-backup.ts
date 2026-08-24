import fs from 'node:fs'
import path from 'node:path'

import {
  secretShapedValue,
  sensitiveFileBlockReason,
  sha256File
} from './hardening'
import { PANTHEON_BINDER_SCHEMA_VERSION } from './pantheon-compatibility'

export const PANTHEON_BACKUP_SCHEMA_VERSION = 1

export interface PantheonBackupReceipt {
  schemaVersion: 1
  createdAt: string
  backupDir: string
  appCommit: string | null
  binderSchemaVersion: number | null
  entries: Array<{ source: string; relPath: string; bytes: number; sha256: string }>
  excluded: Array<{ source: string; reason: 'credential-file' | 'secret-shaped-content' | 'missing' | 'locked' }>
}

export interface PantheonRollbackMarker {
  schemaVersion: 1
  createdAt: string
  previousCommit: string | null
  backupDir: string
  binderSchemaVersion: number | null
}

export interface PantheonBackupDeps {
  userDataDir?: string
  fs?: typeof fs
  now?: () => number
}

const CREDENTIAL_BASENAMES = new Set([
  'connection.json',
  'native-oauth-tokens.json',
  'desktop-installation.json'
])

const LAYOUT_RELATIVE_PATHS = ['window-state.json', 'layout.json', 'terminals.json']

function rollbackMarkerPath(hermesHome: string): string {
  return path.join(hermesHome, 'pantheon', 'rollback.json')
}

function receiptStamp(createdAt: string): string {
  return createdAt.replace(/[:]/g, '-')
}

function textContainsSecret(text: string): boolean {
  if (secretShapedValue(text)) {
    return true
  }

  return text.split(/[\s"'=:{},[\]]+/).some(token => token.length > 0 && secretShapedValue(token))
}

function isCredentialSource(source: string): boolean {
  const basename = path.basename(source).toLowerCase()

  if (CREDENTIAL_BASENAMES.has(basename)) {
    return true
  }

  return Boolean(sensitiveFileBlockReason(source))
}

function readInstallCommit(hermesHome: string, fsImpl: typeof fs): string | null {
  const candidates = [
    path.join(hermesHome, 'install-stamp.json'),
    path.join(hermesHome, 'hermes-agent', 'apps', 'desktop', 'build', 'install-stamp.json')
  ]

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(fsImpl.readFileSync(candidate, 'utf8')) as { commit?: unknown }

      if (typeof parsed.commit === 'string' && parsed.commit) {
        return parsed.commit
      }
    } catch {
      // keep looking
    }
  }

  return null
}

function collectSources(hermesHome: string, userDataDir?: string): Array<{ source: string; relPath: string; required: boolean }> {
  const sources: Array<{ source: string; relPath: string; required: boolean }> = [
    { source: path.join(hermesHome, 'pantheon', 'workspace.json'), relPath: 'pantheon/workspace.json', required: true },
    { source: path.join(hermesHome, 'config.yaml'), relPath: 'config.yaml', required: false },
    { source: path.join(hermesHome, '.env'), relPath: '.env', required: false },
    { source: path.join(hermesHome, 'connection.json'), relPath: 'connection.json', required: false },
    { source: path.join(hermesHome, 'native-oauth-tokens.json'), relPath: 'native-oauth-tokens.json', required: false },
    { source: path.join(hermesHome, 'desktop-installation.json'), relPath: 'desktop-installation.json', required: false }
  ]

  if (userDataDir) {
    sources.push({ source: path.join(userDataDir, 'updates.json'), relPath: 'userData/updates.json', required: false })

    for (const rel of LAYOUT_RELATIVE_PATHS) {
      sources.push({
        source: path.join(userDataDir, rel),
        relPath: `userData/${rel}`,
        required: false
      })
    }
  }

  return sources
}

export function createPantheonUpdateBackup(
  hermesHome: string,
  deps: PantheonBackupDeps = {}
): PantheonBackupReceipt {
  const fsImpl = deps.fs ?? fs
  const createdAt = new Date((deps.now ?? Date.now)()).toISOString()
  const backupDir = path.join(hermesHome, 'pantheon', 'backups', receiptStamp(createdAt))
  fsImpl.mkdirSync(backupDir, { recursive: true })

  const receipt: PantheonBackupReceipt = {
    schemaVersion: 1,
    createdAt,
    backupDir,
    appCommit: readInstallCommit(hermesHome, fsImpl),
    binderSchemaVersion: PANTHEON_BINDER_SCHEMA_VERSION,
    entries: [],
    excluded: []
  }

  for (const item of collectSources(hermesHome, deps.userDataDir)) {
    if (isCredentialSource(item.source)) {
      receipt.excluded.push({ source: item.source, reason: 'credential-file' })
      continue
    }

    let stat: fs.Stats

    try {
      stat = fsImpl.statSync(item.source)
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''

      if (code === 'ENOENT') {
        receipt.excluded.push({ source: item.source, reason: 'missing' })
        continue
      }

      if (item.required) {
        throw error
      }

      receipt.excluded.push({ source: item.source, reason: 'locked' })
      continue
    }

    let bytes: Buffer

    try {
      bytes = fsImpl.readFileSync(item.source)
    } catch (error) {
      if (item.required) {
        throw error
      }

      receipt.excluded.push({ source: item.source, reason: 'locked' })
      continue
    }

    const text = bytes.toString('utf8')

    if (textContainsSecret(text)) {
      receipt.excluded.push({ source: item.source, reason: 'secret-shaped-content' })
      continue
    }

    const dest = path.join(backupDir, item.relPath)
    fsImpl.mkdirSync(path.dirname(dest), { recursive: true })
    fsImpl.writeFileSync(dest, bytes)
    receipt.entries.push({
      source: item.source,
      relPath: item.relPath,
      bytes: stat.size,
      sha256: sha256File(dest, fsImpl)
    })
  }

  fsImpl.writeFileSync(path.join(backupDir, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8')

  return receipt
}

export function readLatestBackupReceipt(
  hermesHome: string,
  deps: PantheonBackupDeps = {}
): PantheonBackupReceipt | null {
  const fsImpl = deps.fs ?? fs
  const root = path.join(hermesHome, 'pantheon', 'backups')

  let names: string[]

  try {
    names = fsImpl.readdirSync(root)
  } catch {
    return null
  }

  const receipts = names
    .map(name => {
      try {
        return JSON.parse(fsImpl.readFileSync(path.join(root, name, 'receipt.json'), 'utf8')) as PantheonBackupReceipt
      } catch {
        return null
      }
    })
    .filter((item): item is PantheonBackupReceipt => Boolean(item?.createdAt))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))

  return receipts[0] ?? null
}

export function restorePantheonBackup(
  hermesHome: string,
  receipt: PantheonBackupReceipt,
  deps: PantheonBackupDeps = {}
): { restored: string[]; failed: string[] } {
  const fsImpl = deps.fs ?? fs
  const restored: string[] = []
  const failed: string[] = []

  for (const entry of receipt.entries) {
    const from = path.join(receipt.backupDir, entry.relPath)
    const to = path.isAbsolute(entry.source) ? entry.source : path.join(hermesHome, entry.relPath)

    try {
      const bytes = fsImpl.readFileSync(from)

      if (textContainsSecret(bytes.toString('utf8')) || isCredentialSource(to)) {
        failed.push(entry.relPath)
        continue
      }

      fsImpl.mkdirSync(path.dirname(to), { recursive: true })
      fsImpl.writeFileSync(to, bytes)
      restored.push(entry.relPath)
    } catch {
      failed.push(entry.relPath)
    }
  }

  return { restored, failed }
}

export function writeRollbackMarker(
  hermesHome: string,
  marker: PantheonRollbackMarker,
  deps: PantheonBackupDeps = {}
): void {
  const fsImpl = deps.fs ?? fs
  const dest = rollbackMarkerPath(hermesHome)
  fsImpl.mkdirSync(path.dirname(dest), { recursive: true })
  fsImpl.writeFileSync(dest, `${JSON.stringify(marker, null, 2)}\n`, 'utf8')
}

export function readRollbackMarker(
  hermesHome: string,
  deps: PantheonBackupDeps = {}
): PantheonRollbackMarker | null {
  const fsImpl = deps.fs ?? fs
  const dest = rollbackMarkerPath(hermesHome)

  let raw: string

  try {
    raw = fsImpl.readFileSync(dest, 'utf8')
  } catch {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as PantheonRollbackMarker

    if (!parsed || parsed.schemaVersion !== 1 || typeof parsed.backupDir !== 'string') {
      fsImpl.unlinkSync(dest)

      return null
    }

    try {
      fsImpl.statSync(parsed.backupDir)
    } catch {
      fsImpl.unlinkSync(dest)

      return null
    }

    return parsed
  } catch {
    try {
      fsImpl.unlinkSync(dest)
    } catch {
      void 0
    }

    return null
  }
}

export function restorePantheonRollbackAtBoot(
  hermesHome: string,
  deps: PantheonBackupDeps = {}
): { restored: boolean; message: string } {
  const marker = readRollbackMarker(hermesHome, deps)

  if (!marker) {
    return { restored: false, message: 'no-rollback-marker' }
  }

  const receipt = readLatestBackupReceipt(hermesHome, deps)

  if (!receipt) {
    return { restored: false, message: 'no-backup-receipt' }
  }

  const result = restorePantheonBackup(hermesHome, receipt, deps)

  return {
    restored: result.failed.length === 0,
    message: result.failed.length === 0 ? 'restored' : `partial:${result.failed.join(',')}`
  }
}
