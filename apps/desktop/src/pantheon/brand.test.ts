import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { PANTHEON_BRAND, PANTHEON_PROVENANCE } from './brand'

const DESKTOP_ROOT = resolve(__dirname, '../..')
const read = (rel: string) => readFileSync(resolve(DESKTOP_ROOT, rel), 'utf8')

describe('Pantheon brand', () => {
  it('uses a distinct Windows identity without changing Hermes protocol behavior', () => {
    expect(PANTHEON_BRAND.productName).toBe('Pantheon')
    expect(PANTHEON_BRAND.appId).toBe('com.syntropic.pantheon')
    expect(PANTHEON_BRAND.protocol).toBe('pantheon')
    expect(PANTHEON_BRAND.agentRuntime).toBe('hermes')
  })

  it('records downstream and upstream source provenance', () => {
    expect(PANTHEON_PROVENANCE.upstreamHermesCommit).toBe('c584d15cdc31e1ebf3989c426ed05fb2ddb0c9fc')
    expect(PANTHEON_PROVENANCE.buzzCompatibilityCommit).toBe('0720f5380ce8a6c050afac159f8462c06cd51ab5')
    for (const sha of [PANTHEON_PROVENANCE.upstreamHermesCommit, PANTHEON_PROVENANCE.buzzCompatibilityCommit]) {
      expect(sha).toMatch(/^[0-9a-f]{40}$/)
    }
  })

  it('package.json build identity matches the brand contract', () => {
    const pkg = JSON.parse(read('package.json'))
    expect(pkg.productName).toBe(PANTHEON_BRAND.productName)
    expect(pkg.build.appId).toBe(PANTHEON_BRAND.appId)
    expect(pkg.build.productName).toBe(PANTHEON_BRAND.productName)
    expect(pkg.build.protocols[0].schemes).toEqual([PANTHEON_BRAND.protocol])
    expect(pkg.build.artifactName.startsWith(`${PANTHEON_BRAND.artifactPrefix}-`)).toBe(true)
    // Deliberate compat pin: scripts/test-desktop.mjs and the packaged-app e2e
    // resolve release/win-unpacked/Hermes.exe by name. Renaming the executable
    // is a coordinated follow-up, not part of PAN-1.
    expect(pkg.build.executableName).toBe('Hermes')
  })

  it('electron main-process literals match the brand contract', () => {
    const mainSrc = read('electron/main.ts')
    expect(mainSrc).toContain(`app.setAppUserModelId('${PANTHEON_BRAND.appId}')`)
    expect(mainSrc).toContain(`process.env.HERMES_DESKTOP_APP_NAME || '${PANTHEON_BRAND.productName}'`)
    expect(mainSrc).toContain(`'${PANTHEON_BRAND.protocol}-dev' : '${PANTHEON_BRAND.protocol}'`)
    expect(mainSrc).toContain(
      `DEV_SERVER ? [HERMES_PROTOCOL, '${PANTHEON_BRAND.protocol}'] : [HERMES_PROTOCOL]`
    )
  })

  it('packaged install-stamp records downstream SHA plus upstream Hermes and Buzz pins', () => {
    const stampSrc = read('scripts/write-build-stamp.mjs')
    expect(stampSrc).toContain(PANTHEON_PROVENANCE.upstreamHermesCommit)
    expect(stampSrc).toContain(PANTHEON_PROVENANCE.buzzCompatibilityCommit)
    expect(stampSrc).toContain('upstreamHermesCommit')
    expect(stampSrc).toContain('buzzCompatibilityCommit')
    expect(stampSrc).toMatch(/commit:\s*stamp\.commit/)
  })

  it('update channel points at the Pantheon downstream repository', () => {
    const updSrc = read('electron/update-remote.ts')
    expect(updSrc).toContain(PANTHEON_PROVENANCE.downstreamRepoHttpsUrl)
    expect(updSrc).toContain(PANTHEON_PROVENANCE.downstreamRepoCanonical)
    expect(updSrc).not.toContain('github.com/NousResearch/hermes-agent.git')
  })
})
