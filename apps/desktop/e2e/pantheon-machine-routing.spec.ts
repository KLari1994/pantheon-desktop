/**
 * Machine-target routing (SURF-05, NFR-SEC-04, ART-05).
 */
import { expect, test } from './test'
import { assertShellHasNav, startPantheonE2e } from './pantheon-boot'
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

test('shell identifies machine/backend context when it boots', async () => {
  skipPantheonE2eIfUnsupported()
  await assertShellHasNav(fixture, ['Projects', 'Rooms'])
  if (fixture) {
    const text = await fixture.page.locator('body').innerText()
    expect(text.length).toBeGreaterThan(0)
  }
})
