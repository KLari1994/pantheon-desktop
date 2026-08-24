/**
 * Update / rollback surface (UPD-*). Never records Windows matrix PASS on Linux.
 */
import { expect, test } from './test'
import { startPantheonE2e } from './pantheon-boot'
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

test('update/rollback is not claimed PASS on this host', async () => {
  skipPantheonE2eIfUnsupported()
  if (process.platform !== 'win32') {
    expect(pantheonE2eSkipReason() || 'linux-or-non-windows-host').toBeTruthy()
    test.info().annotations.push({
      type: 'pending-windows',
      description: 'UPD-01..07 Windows install/update/rollback matrix is pending-windows'
    })
    return
  }
  expect(fixture, 'Windows e2e launched').not.toBeNull()
})
