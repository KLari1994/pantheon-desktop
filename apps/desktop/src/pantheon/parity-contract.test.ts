import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { PANTHEON_PARITY_FEATURES, REQUIRED_PARITY_FEATURES } from './parity-contract'

const DESKTOP_ROOT = resolve(__dirname, '../..')

describe('Pantheon parity contract', () => {
  it('covers every protected Hermes feature exactly once', () => {
    const keys = PANTHEON_PARITY_FEATURES.map(p => p.feature)
    expect([...keys].sort()).toEqual([...REQUIRED_PARITY_FEATURES].sort())
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('every probe anchors to a real source or test path', () => {
    for (const probe of PANTHEON_PARITY_FEATURES) {
      expect(probe.anchors.length).toBeGreaterThan(0)

      for (const anchor of probe.anchors) {
        expect(existsSync(resolve(DESKTOP_ROOT, anchor)), `${probe.feature}: missing ${anchor}`).toBe(true)
      }
    }
  })
})
