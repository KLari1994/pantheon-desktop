// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { type ComponentType } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { retryableLazy, VIEW_IMPORT_TIMEOUT_MS } from './lazy-page'

afterEach(() => {
  vi.useRealTimers()
})

describe('retryableLazy', () => {
  it('renders the loaded view after the import resolves', async () => {
    const Loaded: ComponentType = () => <div data-testid="loaded-view">ready</div>
    const View = retryableLazy(async () => ({ default: Loaded }), 'Capabilities')

    render(<View />)

    expect(await screen.findByTestId('loaded-view')).toBeTruthy()
  })

  it('renders a local ErrorState on import failure and does not escape the boundary', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const View = retryableLazy(async () => {
      throw new Error('chunk missing')
    }, 'Capabilities')

    render(
      <div>
        <View />
        <div data-testid="surrounding">still here</div>
      </div>
    )

    expect(await screen.findByText(/failed to load/i)).toBeTruthy()
    expect(screen.getByText('chunk missing')).toBeTruthy()
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy()
    expect(screen.getByTestId('surrounding')).toBeTruthy()
  })

  it('Retry with a now-resolving loader remounts a fresh lazy and renders the view', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let fail = true
    const Loaded: ComponentType = () => <div data-testid="loaded-view">ready</div>
    const View = retryableLazy(async () => {
      if (fail) throw new Error('first miss')
      return { default: Loaded }
    }, 'Capabilities')

    render(<View />)

    expect(await screen.findByText(/failed to load/i)).toBeTruthy()

    fail = false
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))

    expect(await screen.findByTestId('loaded-view')).toBeTruthy()
    expect(screen.queryByText(/failed to load/i)).toBeNull()
  })

  it('shows the spinner then times out a never-settling loader', async () => {
    vi.useFakeTimers()
    const View = retryableLazy(() => new Promise<{ default: ComponentType }>(() => {}), 'Capabilities')

    render(<View />)

    expect(screen.getByRole('status')).toBeTruthy()

    await act(async () => {
      vi.advanceTimersByTime(VIEW_IMPORT_TIMEOUT_MS)
    })

    expect(screen.getByText(/failed to load/i)).toBeTruthy()
    expect(screen.getByText(/timed out/i)).toBeTruthy()
  })
})
