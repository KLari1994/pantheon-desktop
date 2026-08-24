/**
 * Pantheon bots + rooms surfaces (BOT-*, ROOM-*).
 * Skips with a reason when the Linux farm has no display or built dist.
 */
import { expect, test } from './test'
import { assertShellHasNav, startPantheonE2e } from './pantheon-boot'
import { pantheonE2eSkipReason, skipPantheonE2eIfUnsupported } from './pantheon-skip'
import type { MockBackendFixture } from './fixtures'

skipPantheonE2eIfUnsupported()

let fixture: MockBackendFixture | null = null

test.beforeAll(async () => {
  fixture = await startPantheonE2e()
})

test.afterAll(async () => {
  await fixture?.cleanup()
  fixture = null
})

test('rooms and Grok Bot nav exist when the app boots', async () => {
  skipPantheonE2eIfUnsupported()
  await assertShellHasNav(fixture, ['Rooms', 'Grok Bot'])
})

test('does not invent a Windows or Grok-product PASS', () => {
  const reason = pantheonE2eSkipReason()
  if (reason) {
    expect(reason).toMatch(/display|dist|Windows/i)
    return
  }
  expect(fixture).not.toBeNull()
})
