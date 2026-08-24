import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const desktopTestScript = readFileSync(resolve(import.meta.dirname, '../../scripts/test-desktop.mjs'), 'utf8')

describe('Windows desktop validation contract', () => {
  it('builds the NSIS test artifact without publishing from CI', () => {
    expect(desktopTestScript).toContain(
      "run('npm', ['run', 'dist:win:nsis', '--', '--publish', 'never'])"
    )
  })
})
