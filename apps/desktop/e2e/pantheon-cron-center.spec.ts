/**
 * Pantheon Cron Center (CRON-*).
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

test('Cron Center nav exists when the app boots', async () => {
  skipPantheonE2eIfUnsupported()
  await assertShellHasNav(fixture, ['Cron Center'])
  await openNav(fixture, 'Cron Center')
  if (fixture) {
    await expect(fixture.page.getByText(/Cron Center|No agent|schedule/i).first()).toBeVisible({
      timeout: 15_000
    })
  }
})
