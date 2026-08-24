import { expect } from './test'
import { type MockBackendFixture, setupMockBackend, waitForAppReady } from './fixtures'
import { pantheonE2eSkipReason } from './pantheon-skip'

export async function startPantheonE2e(): Promise<MockBackendFixture | null> {
  if (pantheonE2eSkipReason()) {
    return null
  }

  return setupMockBackend()
}

export async function assertShellHasNav(
  fixture: MockBackendFixture | null,
  labels: readonly string[]
): Promise<void> {
  if (!fixture) {
    return
  }

  await waitForAppReady(fixture, 120_000)
  const body = await fixture.page.locator('body').innerText()
  for (const label of labels) {
    expect(body, `missing nav/surface label: ${label}`).toContain(label)
  }
}

export async function openNav(
  fixture: MockBackendFixture | null,
  label: string
): Promise<void> {
  if (!fixture) {
    return
  }

  await waitForAppReady(fixture, 120_000)
  const target = fixture.page.getByRole('link', { name: label }).or(fixture.page.getByText(label, { exact: true }))
  await target.first().click({ timeout: 15_000 })
}
