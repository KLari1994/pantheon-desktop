import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'

import { createGrokProductAdapter, GROK_UNAVAILABLE_REASONS } from './adapter'
import { GrokStatusPage } from './grok-status'

afterEach(() => cleanup())

test('renders Grok Bot as unavailable with the host reason and no chat substitute', async () => {
  render(<GrokStatusPage adapter={createGrokProductAdapter({ discoveryHost: 'linux-vps' })} />)

  await waitFor(() => {
    expect(screen.getByText('Grok Bot')).toBeTruthy()
    expect(screen.getByText(GROK_UNAVAILABLE_REASONS.unsupportedHost)).toBeTruthy()
  })
  expect(screen.queryByRole('textbox')).toBeNull()
  expect(screen.queryByRole('button', { name: /send|chat/i })).toBeNull()
  expect(screen.queryByText(/hermes/i)).toBeNull()
})

test('hides the direct chat affordance while the product adapter is unavailable', async () => {
  render(<GrokStatusPage adapter={createGrokProductAdapter()} />)

  await waitFor(() => {
    expect(screen.getByText(/unavailable/i)).toBeTruthy()
  })
  expect(screen.queryByTestId('grok-direct-chat')).toBeNull()
})
