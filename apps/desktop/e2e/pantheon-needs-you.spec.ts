/**
 * Pantheon Needs You / Home inbox (APP-*, HOME-*).
 */
import { expect, test } from './test'
import { assertShellHasNav, openNav, startPantheonE2e } from './pantheon-boot'
import { skipPantheonE2eIfUnsupported } from './pantheon-skip'
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

test('Home nav exists and opens without claiming Windows PASS', async () => {
  skipPantheonE2eIfUnsupported()
  await assertShellHasNav(fixture, ['Home'])
  await openNav(fixture, 'Home')
  if (fixture) {
    await expect(fixture.page.getByText(/Needs You|Working|Today/i).first()).toBeVisible({ timeout: 15_000 })
  }
})
