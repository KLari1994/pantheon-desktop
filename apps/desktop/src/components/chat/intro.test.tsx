import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Intro, resolveCopy, shouldOfferIntroSetup } from './intro'
import introCopyRaw from './intro-copy.jsonl?raw'

describe('Intro wordmark', () => {
  it('renders PANTHEON as the wordmark and accessible label', () => {
    render(<Intro personality="none" seed={0} />)
    const wordmark = screen.getByLabelText('PANTHEON')
    expect(wordmark).toBeTruthy()
    expect(wordmark.textContent).toContain('PANTHEON')
    expect(wordmark.textContent).not.toMatch(/hermes/i)
  })
})

describe('landing copy branding', () => {
  it('has no Hermes mention anywhere in the generated copy file', () => {
    expect(introCopyRaw).not.toMatch(/hermes/i)
  })

  it('neutral and fallback copy never says Hermes, for any seed', () => {
    for (const personality of [undefined, '', 'none', 'default', 'neutral']) {
      for (let seed = 0; seed < 32; seed++) {
        const copy = resolveCopy(personality, seed)
        expect(`${copy.headline} ${copy.body}`).not.toMatch(/hermes/i)
      }
    }
  })

  it('unknown-personality fallback keeps the label but never builds "<Label> Hermes"', () => {
    for (let seed = 0; seed < 32; seed++) {
      const copy = resolveCopy('galactic-overlord', seed)
      expect(`${copy.headline} ${copy.body}`).not.toMatch(/hermes/i)
    }

    const labeled = resolveCopy('galactic-overlord', 0)
    expect(`${labeled.headline} ${labeled.body}`).toMatch(/Galactic Overlord/)
  })
})

describe('first-run setup action', () => {
  it('renders the action and routes through the callback when offered', () => {
    const onOpenSetup = vi.fn()
    render(<Intro onOpenSetup={onOpenSetup} personality="none" seed={0} />)
    const button = screen.getByRole('button', { name: 'Set up a provider' })
    fireEvent.click(button)
    expect(onOpenSetup).toHaveBeenCalledTimes(1)
  })

  it('renders no action when not offered', () => {
    render(<Intro personality="none" seed={0} />)
    expect(screen.queryByRole('button', { name: 'Set up a provider' })).toBeNull()
  })
})

describe('shouldOfferIntroSetup', () => {
  const needsSetup = { checksDisagree: false, ready: false, reason: 'no provider', source: 'setup_status' } as const
  const unavailable = {
    checksDisagree: true,
    ready: false,
    reason: 'resolution failed',
    source: 'runtime_check'
  } as const
  const ready = { checksDisagree: false, ready: true, reason: null, source: 'runtime_check' } as const

  it('offers setup only for needs_setup/unavailable on an open gateway with no sessions', () => {
    expect(shouldOfferIntroSetup({ gatewayState: 'open', readiness: needsSetup, sessionCount: 0 })).toBe(true)
    expect(shouldOfferIntroSetup({ gatewayState: 'open', readiness: unavailable, sessionCount: 0 })).toBe(true)
  })

  it('stays hidden for ready, checking, offline, connecting, and existing sessions', () => {
    expect(shouldOfferIntroSetup({ gatewayState: 'open', readiness: ready, sessionCount: 0 })).toBe(false)
    expect(shouldOfferIntroSetup({ gatewayState: 'open', readiness: null, sessionCount: 0 })).toBe(false) // checking
    expect(shouldOfferIntroSetup({ gatewayState: 'closed', readiness: needsSetup, sessionCount: 0 })).toBe(false)
    expect(shouldOfferIntroSetup({ gatewayState: 'connecting', readiness: needsSetup, sessionCount: 0 })).toBe(false)
    expect(shouldOfferIntroSetup({ gatewayState: undefined, readiness: needsSetup, sessionCount: 0 })).toBe(false)
    expect(shouldOfferIntroSetup({ gatewayState: 'open', readiness: needsSetup, sessionCount: 3 })).toBe(false)
  })
})
