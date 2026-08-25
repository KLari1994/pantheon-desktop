import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { decidePantheonUpdate, type PantheonActivitySnapshot } from './pantheon-update-preflight'

const IDLE_SNAPSHOT: PantheonActivitySnapshot = {
  activeAgentCount: 0,
  streamingSession: false,
  activeTerminalProcess: false,
  computerUseActive: false,
  unsavedDraft: false,
  bridgeHealthy: true
}

describe('decidePantheonUpdate', () => {
  it('allows an idle snapshot', () => {
    expect(decidePantheonUpdate(IDLE_SNAPSHOT)).toEqual({ allowed: true, blockers: [] })
  })

  it('defers when any signal is unknown', () => {
    const d = decidePantheonUpdate({ ...IDLE_SNAPSHOT, computerUseActive: 'unknown' })
    expect(d).toEqual({ allowed: false, blockers: ['status-unavailable'] })
  })

  it('deduplicates status-unavailable across multiple unknown fields', () => {
    const d = decidePantheonUpdate({
      ...IDLE_SNAPSHOT,
      streamingSession: 'unknown',
      activeTerminalProcess: 'unknown',
      unsavedDraft: 'unknown'
    })

    expect(d).toEqual({ allowed: false, blockers: ['status-unavailable'] })
  })

  it('treats unknown activeAgentCount as status-unavailable', () => {
    expect(decidePantheonUpdate({ ...IDLE_SNAPSHOT, activeAgentCount: 'unknown' })).toEqual({
      allowed: false,
      blockers: ['status-unavailable']
    })
  })

  it('blocks when an agent is working', () => {
    expect(decidePantheonUpdate({ ...IDLE_SNAPSHOT, activeAgentCount: 2 })).toEqual({
      allowed: false,
      blockers: ['active-agent']
    })
  })

  it('maps each true boolean to its named blocker', () => {
    expect(
      decidePantheonUpdate({
        activeAgentCount: 0,
        streamingSession: true,
        activeTerminalProcess: true,
        computerUseActive: true,
        unsavedDraft: true,
        bridgeHealthy: true
      })
    ).toEqual({
      allowed: false,
      blockers: ['streaming-session', 'active-terminal-process', 'computer-use-active', 'unsaved-draft']
    })
  })

  it('blocks when the Buzz sidecar is unhealthy', () => {
    expect(decidePantheonUpdate({ ...IDLE_SNAPSHOT, bridgeHealthy: false })).toEqual({
      allowed: false,
      blockers: ['bridge-unhealthy']
    })
  })

  it('unknown plus a named blocker still defers fail-closed', () => {
    const d = decidePantheonUpdate({
      ...IDLE_SNAPSHOT,
      activeAgentCount: 1,
      streamingSession: 'unknown'
    })

    expect(d.allowed).toBe(false)
    expect(d.blockers).toEqual(['status-unavailable', 'active-agent'])
  })

  it('keeps allowed equivalent to an empty blocker list', () => {
    const idle = decidePantheonUpdate(IDLE_SNAPSHOT)
    const blocked = decidePantheonUpdate({ ...IDLE_SNAPSHOT, unsavedDraft: true })
    expect(idle.allowed).toBe(idle.blockers.length === 0)
    expect(blocked.allowed).toBe(blocked.blockers.length === 0)
  })

  it('has no imports so the renderer can load it', () => {
    const source = readFileSync(fileURLToPath(new URL('./pantheon-update-preflight.ts', import.meta.url)), 'utf8')
    expect(source).not.toMatch(/^\s*import\s/m)
    expect(source).not.toMatch(/require\(/)
  })
})
