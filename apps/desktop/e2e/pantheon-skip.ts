import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { test } from './test'

/** Honest skip for Pantheon e2e on the Linux farm (no Windows desktop / no built app). */
export function pantheonE2eSkipReason(): string | null {
  const hasDisplay = Boolean(
    process.env.DISPLAY || process.env.WAYLAND_DISPLAY || process.platform === 'win32' || process.platform === 'darwin'
  )

  if (!hasDisplay) {
    return 'no graphical display (DISPLAY/WAYLAND_DISPLAY unset); Linux farm cannot run Electron e2e or the Windows manual matrix'
  }

  const distMain = resolve(__dirname, '../dist/electron-main.mjs')
  if (!existsSync(distMain)) {
    return 'apps/desktop/dist not built; run npm -w apps/desktop run build before Playwright'
  }

  return null
}

export function skipPantheonE2eIfUnsupported(): void {
  const reason = pantheonE2eSkipReason()
  test.skip(reason !== null, reason ?? 'pantheon e2e unavailable')
}
