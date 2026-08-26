import { describe, expect, it } from 'vitest'

import { CRON_ROUTE } from '../../routes'

import { contributedNavItems, SIDEBAR_NAV } from './nav-items'

describe('sidebar nav contract', () => {
  it('has no permanent legacy cron row', () => {
    expect(SIDEBAR_NAV.some(item => item.id === 'cron')).toBe(false)
    expect(SIDEBAR_NAV.some(item => item.route === CRON_ROUTE)).toBe(false)
  })

  it('keeps the other built-in rows intact', () => {
    expect(SIDEBAR_NAV.map(item => item.id)).toEqual(['new-session', 'skills', 'messaging', 'artifacts'])
  })

  it('still renders a contributed Cron Center row', () => {
    const items = contributedNavItems([
      { id: 'pantheon.cron-center', data: { path: '/cron-center', label: 'Cron Center', codicon: 'watch' } }
    ])

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ id: 'pantheon.cron-center', label: 'Cron Center', route: '/cron-center' })
  })

  it('drops malformed contributions instead of rendering broken rows', () => {
    expect(contributedNavItems([{ id: 'x', data: { path: 'no-slash', label: 'Bad' } }, { id: 'y' }])).toEqual([])
  })
})
