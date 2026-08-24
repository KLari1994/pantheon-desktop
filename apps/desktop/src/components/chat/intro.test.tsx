import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import introCopyRaw from './intro-copy.jsonl?raw'
import { Intro, resolveCopy } from './intro'

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
