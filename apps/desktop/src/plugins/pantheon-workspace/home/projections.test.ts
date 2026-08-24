import { expect, test } from 'vitest'

import { HOME_SECTIONS, navigationTarget, projectHomeItems, type HomeSourceEvent } from './projections'

function event(partial: Partial<HomeSourceEvent> & Pick<HomeSourceEvent, 'type' | 'sourceKind' | 'sourceId'>): HomeSourceEvent {
  return {
    agent: 'Daedalus',
    context: 'office/ops',
    machine: 'windows-workstation',
    timestamp: 1,
    title: partial.type,
    ...partial
  }
}

test('stable logical ids deduplicate the same source twice', () => {
  const items = projectHomeItems([
    event({ type: 'approval', sourceKind: 'session', sourceId: 'sess-1', requestId: 'req-9' }),
    event({ type: 'approval', sourceKind: 'session', sourceId: 'sess-1', requestId: 'req-9', context: 'inline' })
  ])
  expect(items).toHaveLength(1)
  expect(items[0]?.id).toBe('approval:req-9')
})

test('fixed section order is Needs You, Working, Stalled/Failed, Today', () => {
  expect(HOME_SECTIONS).toEqual(['Needs You', 'Working', 'Stalled/Failed', 'Today'])
  const items = projectHomeItems([
    event({ type: 'long-running-completion', sourceKind: 'session', sourceId: 's-today', timestamp: 4 }),
    event({ type: 'running', sourceKind: 'session', sourceId: 's-work', timestamp: 3 }),
    event({ type: 'failed', sourceKind: 'cron', sourceId: 'cron-1', timestamp: 2 }),
    event({ type: 'direct-mention', sourceKind: 'room', sourceId: 'room-1', timestamp: 1 })
  ])
  expect(items.map(item => item.section)).toEqual(['Needs You', 'Working', 'Stalled/Failed', 'Today'])
})

test('approvals, direct mentions, and explicit needs-you land in Needs You', () => {
  const items = projectHomeItems([
    event({ type: 'approval', sourceKind: 'session', sourceId: 's1', requestId: 'r1' }),
    event({ type: 'direct-mention', sourceKind: 'room', sourceId: 'room-1' }),
    event({ type: 'explicit-needs-you', sourceKind: 'room', sourceId: 'room-2' })
  ])
  expect(items.every(item => item.section === 'Needs You')).toBe(true)
})

test('running work lands in Working', () => {
  const items = projectHomeItems([event({ type: 'running', sourceKind: 'session', sourceId: 's-run' })])
  expect(items[0]?.section).toBe('Working')
})

test('stalled, exhausted-retry, and failed land in Stalled/Failed', () => {
  const items = projectHomeItems([
    event({ type: 'stalled', sourceKind: 'session', sourceId: 's-stall' }),
    event({ type: 'exhausted-retry', sourceKind: 'cron', sourceId: 'cron-fail' }),
    event({ type: 'failed', sourceKind: 'session', sourceId: 's-fail' })
  ])
  expect(items.map(item => item.section)).toEqual(['Stalled/Failed', 'Stalled/Failed', 'Stalled/Failed'])
})

test('notification-worthy completions and review decisions land in Today', () => {
  const items = projectHomeItems([
    event({ type: 'long-running-completion', sourceKind: 'session', sourceId: 's-done' }),
    event({ type: 'review-decision', sourceKind: 'pr', sourceId: 'pr-1' }),
    event({ type: 'merge-decision', sourceKind: 'pr', sourceId: 'pr-2' })
  ])
  expect(items.every(item => item.section === 'Today')).toBe(true)
})

test('ordinary messages, tool calls, successful crons, and routine background completions produce no item', () => {
  const items = projectHomeItems([
    event({ type: 'ordinary-message', sourceKind: 'room', sourceId: 'room-1' }),
    event({ type: 'tool-call', sourceKind: 'session', sourceId: 's1' }),
    event({ type: 'successful-cron', sourceKind: 'cron', sourceId: 'cron-ok' }),
    event({ type: 'routine-background-completion', sourceKind: 'session', sourceId: 's2' })
  ])
  expect(items).toEqual([])
})

test('every source kind has a typed exact navigation target', () => {
  expect(navigationTarget('bot', 'daedalus')).toEqual({
    kind: 'bot',
    botId: 'daedalus',
    href: '/rooms/memberships?bot=daedalus'
  })
  expect(navigationTarget('room', 'room-9')).toEqual({ kind: 'room', roomId: 'room-9', href: '/rooms?room=room-9' })
  expect(navigationTarget('session', 'sess-1')).toEqual({ kind: 'session', sessionId: 'sess-1', href: '/sess-1' })
  expect(navigationTarget('cron', 'job-3')).toEqual({ kind: 'cron', jobId: 'job-3', href: '/cron?job=job-3' })
  expect(navigationTarget('project', 'proj-1')).toEqual({
    kind: 'project',
    projectId: 'proj-1',
    href: '/rooms?project=proj-1'
  })
  expect(navigationTarget('pr', 'pr-7')).toEqual({ kind: 'pr', prId: 'pr-7', href: '/rooms?pr=pr-7' })
  expect(navigationTarget('artifact', 'art-2')).toEqual({
    kind: 'artifact',
    artifactId: 'art-2',
    href: '/artifacts?id=art-2'
  })
})

test('projected items carry identity, agent, context, machine, timestamp, status, and navigation', () => {
  const [item] = projectHomeItems([
    event({
      type: 'approval',
      sourceKind: 'session',
      sourceId: 'sess-1',
      requestId: 'req-1',
      title: 'Allow terminal',
      status: 'needs-input'
    })
  ])
  expect(item).toMatchObject({
    id: 'approval:req-1',
    section: 'Needs You',
    agent: 'Daedalus',
    context: 'office/ops',
    machine: 'windows-workstation',
    timestamp: 1,
    status: 'needs-input',
    statusLabel: 'Needs input',
    navigation: { kind: 'session', sessionId: 'sess-1', href: '/sess-1' }
  })
  expect(item && 'createTask' in item).toBe(false)
  expect(item && 'completeTask' in item).toBe(false)
})
