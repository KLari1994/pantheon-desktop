import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { secretShapedValue } from './hardening'
import {
  createPantheonUpdateBackup,
  readLatestBackupReceipt,
  readRollbackMarker,
  restorePantheonBackup,
  writeRollbackMarker
} from './pantheon-backup'

const T0 = Date.parse('2026-08-24T12:00:00.000Z')

function tmpHome(tag: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `pantheon-backup-${tag}-`))
}

function seed(home: string, rel: string, body: string) {
  const dest = path.join(home, rel)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, body)
}

function readdirRecursive(root: string): string[] {
  const out: string[] = []

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        walk(full)
      } else {
        out.push(full)
      }
    }
  }

  walk(root)

  return out
}

describe('createPantheonUpdateBackup', () => {
  it('never copies provider/Buzz key material', () => {
    const home = tmpHome('keys')
    seed(home, 'pantheon/workspace.json', '{"buzz":{"relayUrl":"https://r"}}')
    seed(home, 'config.yaml', `relay_key: ${'a'.repeat(64)}\n`)
    seed(home, '.env', 'OPENAI_API_KEY=sk-secretvalue123456\n')
    seed(home, 'connection.json', '{"token":"nsec1abcdefghijklmnopqrstuvwxyz"}')

    const receipt = createPantheonUpdateBackup(home, { now: () => T0 })
    expect(receipt.excluded).toContainEqual(expect.objectContaining({ reason: 'secret-shaped-content' }))
    expect(receipt.excluded).toContainEqual(expect.objectContaining({ reason: 'credential-file' }))

    const copied = readdirRecursive(receipt.backupDir)
      .filter(file => path.basename(file) !== 'receipt.json')
      .map(file => fs.readFileSync(file, 'utf8'))

    expect(copied.some(text => textContainsSecret(text))).toBe(false)
    expect(receipt.entries.some(entry => entry.relPath === 'pantheon/workspace.json')).toBe(true)
  })

  it('records locked layout files without failing the backup', () => {
    const home = tmpHome('locked')
    const userDataDir = path.join(home, 'userData')
    seed(home, 'pantheon/workspace.json', '{"ok":true}')
    const receipt = createPantheonUpdateBackup(home, { userDataDir, now: () => T0 })
    expect(receipt.excluded).toContainEqual(
      expect.objectContaining({ source: path.join(userDataDir, 'window-state.json'), reason: 'missing' })
    )
    expect(receipt.entries.length).toBeGreaterThan(0)
  })

  it('restores copied files and writes a self-healing rollback marker', () => {
    const home = tmpHome('restore')
    seed(home, 'pantheon/workspace.json', '{"buzz":{"relayUrl":"https://r"}}')
    const receipt = createPantheonUpdateBackup(home, { now: () => T0 })
    fs.writeFileSync(path.join(home, 'pantheon', 'workspace.json'), '{"mutated":true}')
    const restored = restorePantheonBackup(home, receipt)
    expect(restored.restored).toContain('pantheon/workspace.json')
    expect(JSON.parse(fs.readFileSync(path.join(home, 'pantheon', 'workspace.json'), 'utf8'))).toEqual({
      buzz: { relayUrl: 'https://r' }
    })

    writeRollbackMarker(home, {
      schemaVersion: 1,
      createdAt: receipt.createdAt,
      previousCommit: 'abc',
      backupDir: receipt.backupDir,
      binderSchemaVersion: 1
    })
    expect(readRollbackMarker(home)?.previousCommit).toBe('abc')
    expect(readLatestBackupReceipt(home)?.backupDir).toBe(receipt.backupDir)

    fs.rmSync(receipt.backupDir, { recursive: true, force: true })
    expect(readRollbackMarker(home)).toBeNull()
  })
})

function textContainsSecret(text: string): boolean {
  if (secretShapedValue(text)) {
    return true
  }

  return text.split(/[\s"'=:{},[\]]+/).some(token => token.length > 0 && secretShapedValue(token))
}
