import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { RoomList } from './room-list'
import { VIRTUALIZE_THRESHOLD, type RoomSummary } from './types'

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 56,
    getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ key: index, index, start: index * 56 })),
    measureElement: () => undefined
  })
}))

afterEach(() => cleanup())

function room(index: number): RoomSummary {
  return {
    id: `room-${index}`,
    kind: index % 2 ? 'temporary' : 'office',
    name: `Room ${index}`,
    memberAgentIds: [`agent-${index}`],
    latestPreview: 'hi',
    unread: index === 0,
    needsYou: index === 1,
    expiresAt: index % 2 ? '99' : undefined
  }
}

test('virtualizes at the 25-room threshold', () => {
  const rooms = Array.from({ length: VIRTUALIZE_THRESHOLD }, (_, index) => room(index))
  const { container } = render(<RoomList rooms={rooms} onSelect={() => undefined} />)
  expect(container.firstElementChild?.getAttribute('data-virtualized')).toBe('true')
  expect(screen.getByLabelText('Unread')).toBeTruthy()
  expect(screen.getByText('Needs You')).toBeTruthy()
  expect(screen.getAllByText(/TTL/).length).toBeGreaterThan(0)
})
