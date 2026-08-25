// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ContribBoundary } from '@/contrib/react/boundary'

describe('session tile boundary recovery (Maximum-update-depth class)', () => {
  it('catches the crash locally and one Retry click restores the subtree', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    // Persist the throw until Retry. A one-shot decrement is eaten by React 19
    // concurrent recovery (sync re-render of the root succeeds after the flag
    // flipped) and never reaches the tile boundary.
    let crash = true

    function TileBody() {
      if (crash) {
        throw new Error(
          'Maximum update depth exceeded. The result of getSnapshot should be cached to avoid an infinite loop.'
        )
      }

      return <div data-testid="tile-recovered">bot chat</div>
    }

    render(
      <ContribBoundary id="session-tile:20260823_test">
        <TileBody />
      </ContribBoundary>
    )

    // Local fallback, not a rethrow: render() completing proves containment.
    expect(screen.getByText(/failed to render/i)).toBeTruthy()

    crash = false
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))

    expect(screen.getByTestId('tile-recovered')).toBeTruthy()
    expect(screen.queryByText(/failed to render/i)).toBeNull()
  })

  it('a persistent crash keeps showing the bounded fallback instead of looping', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    function AlwaysCrashes(): never {
      throw new Error('Maximum update depth exceeded.')
    }

    render(
      <ContribBoundary id="session-tile:20260823_test">
        <AlwaysCrashes />
      </ContribBoundary>
    )

    fireEvent.click(screen.getByRole('button', { name: /retry/i }))

    // Still the fallback — Retry is user-bounded (one attempt per click), never automatic.
    expect(screen.getByText(/failed to render/i)).toBeTruthy()
  })
})
