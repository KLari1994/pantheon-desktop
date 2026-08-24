import { expect, test } from 'vitest'

import { parseWorkspaceManifest } from './schema'

test('rejects unknown top-level version and tolerates extra keys', () => {
  expect(() => parseWorkspaceManifest({ version: 2 })).toThrow(/unsupported_version/)
  expect(parseWorkspaceManifest({ version: 1, extra: true, buzz: { relayUrl: 'https://r' } }).buzz?.relayUrl).toBe('https://r')
})
