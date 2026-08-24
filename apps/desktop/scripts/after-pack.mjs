/**
 * after-pack.mjs — electron-builder afterPack hook.
 *
 * Stamps the Hermes icon + identity onto the packed Windows Hermes.exe via
 * rcedit (delegated to set-exe-identity.mjs). This runs for EVERY packed build
 * — first install, `hermes desktop`, the installer's --update rebuild, and a
 * dev's manual `npm run pack` — so the branded exe can never silently revert
 * to the stock "Electron" icon/name (the bug when the stamp lived only in
 * install.ps1, which the update path doesn't use).
 *
 * Windows-only: rcedit edits PE resources, irrelevant on macOS/Linux where the
 * app identity comes from the bundle Info.plist / desktop entry. Best-effort:
 * a stamp failure must never fail an otherwise-good build (worst case is the
 * stock icon, not a broken app), so we log and resolve rather than throw.
 *
 * electron-builder passes a context with:
 *   - electronPlatformName: 'win32' | 'darwin' | 'linux'
 *   - appOutDir:            the unpacked app directory for this target
 *   - packager.appInfo.productFilename: the exe basename (e.g. 'Hermes')
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'

import { stampExeIdentity } from './set-exe-identity.mjs'
import { WINDOWS_SIDECAR_TARGETS } from './before-pack.mjs'

export function verifyBuzzSidecar({ platform, arch, appOutDir, desktopRoot = path.resolve(import.meta.dirname, '..') }) {
  const target = `${platform}-${arch}`
  if (!WINDOWS_SIDECAR_TARGETS.has(target)) {
    return { verified: false, target }
  }
  const staged = path.join(desktopRoot, 'build', 'sidecars', target, 'buzz-bridge.exe')
  const receipt = path.join(desktopRoot, 'build', 'sidecars', target, 'buzz-bridge.sha256')
  if (!existsSync(staged) || !existsSync(receipt)) {
    throw new Error(`[after-pack] missing staged Buzz sidecar for ${target}`)
  }
  const expected = readFileSync(receipt, 'utf8').trim()
  const actual = createHash('sha256').update(readFileSync(staged)).digest('hex')
  if (expected !== actual) {
    throw new Error(`[after-pack] Buzz sidecar SHA-256 mismatch for ${target}`)
  }
  const destDir = path.join(appOutDir, 'resources', 'buzz-bridge')
  mkdirSync(destDir, { recursive: true })
  copyFileSync(staged, path.join(destDir, 'buzz-bridge.exe'))
  writeFileSync(path.join(destDir, 'buzz-bridge.sha256'), `${actual}\n`)
  return { verified: true, target, sha256: actual }
}

export default async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') {
    return
  }

  const productName = context.packager?.appInfo?.productFilename || 'Hermes'
  const exe = path.join(context.appOutDir, `${productName}.exe`)
  const desktopRoot = path.resolve(import.meta.dirname, '..')
  const archName = context.arch === 3 ? 'arm64' : 'x64'

  verifyBuzzSidecar({
    platform: context.electronPlatformName,
    arch: archName,
    appOutDir: context.appOutDir,
    desktopRoot
  })

  try {
    await stampExeIdentity(exe, desktopRoot)
  } catch (err) {
    // Never fail the build over a cosmetic stamp.
    console.warn(`[after-pack] exe identity stamp failed (${err.message}); Hermes.exe keeps the stock Electron icon`)
  }
}
