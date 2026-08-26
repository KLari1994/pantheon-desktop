import { describe, expect, it } from 'vitest'

import * as sdk from '@/sdk'

describe('plugin SDK host surface', () => {
  it('exports Buzz client, pin, and room types for plugins', () => {
    expect(typeof sdk.desktopBuzzClient).toBe('function')
    expect(sdk.BUZZ_ACP_PIN.repo).toContain('buzz')
    expect(sdk.BUZZ_ACP_PIN.commit).toMatch(/^[0-9a-f]{40}$/)
  })

  it('exports destination voice policy without @/pantheon imports', () => {
    expect(sdk.canDictate('room-composer')).toBe(true)
    expect(sdk.canDictate('direct-chat')).toBe(true)
    expect(sdk.canDictate('cron')).toBe(false)
  })

  it('exports session open, artifact collection, and cron focus as host verbs', () => {
    expect(typeof sdk.openSession).toBe('function')
    expect(typeof sdk.collectArtifactsForSession).toBe('function')
    expect(typeof sdk.setCronFocusJobId).toBe('function')
    expect(typeof sdk.lineageAliases).toBe('function')
    expect(typeof sdk.sessionApprovalRequest).toBe('function')
    expect(typeof sdk.clearApprovalRequest).toBe('function')
    expect(typeof sdk.requestForOwnedSession).toBe('function')
  })

  it('exposes live session and cron atoms plugins already read through host stores', () => {
    expect(typeof sdk.$sessions.get).toBe('function')
    expect(typeof sdk.$cronJobs.get).toBe('function')
    expect(typeof sdk.$sessionStates.get).toBe('function')
    expect(typeof sdk.$attentionSessionIds.get).toBe('function')
    expect(typeof sdk.$workingSessionIds.get).toBe('function')
    expect(typeof sdk.$stalledSessionIds.get).toBe('function')
    expect(typeof sdk.$gateway.get).toBe('function')
  })
})
