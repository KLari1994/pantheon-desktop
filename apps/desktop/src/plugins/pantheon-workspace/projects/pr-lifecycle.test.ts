import { describe, expect, test } from 'vitest'

import {
  archiveProjectRoom,
  canTransitionPrLifecycle,
  deriveMergeAuthority,
  transitionPrLifecycle,
  validateLinearIssueUrl
} from './pr-lifecycle'
import type { ProjectRoomBinding } from './types'

const binding = (extra: Partial<ProjectRoomBinding> = {}): ProjectRoomBinding => ({
  projectId: 'p_demo',
  projectName: 'Pantheon Desktop',
  buzzRoomId: 'room-pr-7',
  repoPath: '/opt/data/repos/pantheon-desktop',
  worktreePath: '/opt/data/worktrees/pantheon-desktop/PAN-7',
  targetBranch: 'feat/PAN-7-projects-pr-rooms',
  baseBranch: 'staging',
  machine: {
    connectionId: 'homelab',
    machineId: 'install-aaa',
    profile: 'daedalus',
    label: 'Homelab / daedalus'
  },
  artifactIds: ['art-1'],
  evidence: {
    ci: { status: 'green', summary: 'all checks passed' },
    reviews: [{ reviewer: 'fable', decision: 'PASS' }]
  },
  linearUrl: 'https://linear.app/syntropickelc/issue/PAN-7/task-7',
  lifecycle: 'open',
  ...extra
})

describe('PR lifecycle transitions', () => {
  const allowed: Array<[ProjectRoomBinding['lifecycle'], ProjectRoomBinding['lifecycle']]> = [
    ['open', 'working'],
    ['working', 'review-ready'],
    ['review-ready', 'decision'],
    ['review-ready', 'working'],
    ['decision', 'working'],
    ['decision', 'merged'],
    ['decision', 'closed'],
    ['merged', 'archived'],
    ['closed', 'archived']
  ]

  test.each(allowed)('allows %s → %s', (from, to) => {
    expect(canTransitionPrLifecycle(from, to)).toBe(true)
    expect(transitionPrLifecycle(binding({ lifecycle: from }), to).lifecycle).toBe(to)
  })

  const rejected: Array<[ProjectRoomBinding['lifecycle'], ProjectRoomBinding['lifecycle']]> = [
    ['open', 'review-ready'],
    ['open', 'decision'],
    ['open', 'merged'],
    ['open', 'archived'],
    ['working', 'decision'],
    ['working', 'merged'],
    ['working', 'archived'],
    ['review-ready', 'merged'],
    ['review-ready', 'closed'],
    ['review-ready', 'archived'],
    ['merged', 'working'],
    ['merged', 'closed'],
    ['closed', 'working'],
    ['closed', 'merged'],
    ['archived', 'open'],
    ['archived', 'working']
  ]

  test.each(rejected)('rejects skipped or reversed %s → %s', (from, to) => {
    expect(canTransitionPrLifecycle(from, to)).toBe(false)
    expect(() => transitionPrLifecycle(binding({ lifecycle: from }), to)).toThrow(/invalid_transition/)
  })
})

test('review feedback may deliberately return to work', () => {
  const next = transitionPrLifecycle(binding({ lifecycle: 'review-ready' }), 'working')
  expect(next.lifecycle).toBe('working')
})

test('CI or review-ready evidence alone grants no merge authority', () => {
  expect(deriveMergeAuthority(binding({ lifecycle: 'review-ready' }))).toEqual({
    granted: false,
    reason: 'no-explicit-decision'
  })
  expect(
    deriveMergeAuthority(
      binding({
        lifecycle: 'decision',
        evidence: { ci: { status: 'green', summary: 'checks green' }, reviews: [{ reviewer: 'ci', decision: 'PASS' }] }
      })
    )
  ).toEqual({ granted: false, reason: 'no-explicit-decision' })
})

test('explicit Talos or human decisions remain attributed', () => {
  expect(
    deriveMergeAuthority(
      binding({
        lifecycle: 'decision',
        evidence: {
          decision: { source: 'talos', actor: 'Talos', verdict: 'approve', summary: 'ship it' }
        }
      })
    )
  ).toEqual({
    granted: true,
    source: 'talos',
    actor: 'Talos',
    verdict: 'approve',
    summary: 'ship it'
  })
  expect(
    deriveMergeAuthority(
      binding({
        lifecycle: 'merged',
        evidence: {
          decision: { source: 'human', actor: 'Kelcee', verdict: 'approve', summary: 'merge after review' }
        }
      })
    )
  ).toMatchObject({ granted: true, source: 'human', actor: 'Kelcee' })
})

test('Linear validator accepts only verified issue URLs', () => {
  expect(validateLinearIssueUrl('https://linear.app/syntropickelc/issue/PAN-7/task-7')).toEqual({
    ok: true,
    url: 'https://linear.app/syntropickelc/issue/PAN-7/task-7'
  })
  expect(validateLinearIssueUrl('https://linear.app/syntropickelc/issue/PAN-7')).toEqual({
    ok: true,
    url: 'https://linear.app/syntropickelc/issue/PAN-7'
  })
  expect(validateLinearIssueUrl('http://linear.app/syntropickelc/issue/PAN-7').ok).toBe(false)
  expect(validateLinearIssueUrl('https://linear.app/syntropickelc/project/foo').ok).toBe(false)
  expect(validateLinearIssueUrl('https://evil.example/linear.app/issue/PAN-7').ok).toBe(false)
  expect(validateLinearIssueUrl('not-a-url').ok).toBe(false)
  expect(validateLinearIssueUrl('').ok).toBe(false)
})

test('archive leaves provenance unchanged', () => {
  const source = binding({
    lifecycle: 'merged',
    artifactIds: ['art-1', 'art-2'],
    evidence: { decision: { source: 'human', actor: 'Kelcee', verdict: 'approve', summary: 'done' } }
  })

  const archived = archiveProjectRoom(source)
  expect(archived.lifecycle).toBe('archived')
  expect(archived.buzzRoomId).toBe(source.buzzRoomId)
  expect(archived.worktreePath).toBe(source.worktreePath)
  expect(archived.artifactIds).toEqual(source.artifactIds)
  expect(archived.evidence).toEqual(source.evidence)
  expect(archived.linearUrl).toBe(source.linearUrl)
})
