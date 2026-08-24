import type { MergeAuthority, PrLifecycleState, ProjectRoomBinding } from './types'

const ALLOWED_TRANSITIONS: Record<PrLifecycleState, readonly PrLifecycleState[]> = {
  open: ['working'],
  working: ['review-ready'],
  'review-ready': ['decision', 'working'],
  decision: ['working', 'merged', 'closed'],
  merged: ['archived'],
  closed: ['archived'],
  archived: []
}

export function canTransitionPrLifecycle(from: PrLifecycleState, to: PrLifecycleState): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to)
}

export function transitionPrLifecycle(binding: ProjectRoomBinding, to: PrLifecycleState): ProjectRoomBinding {
  if (!canTransitionPrLifecycle(binding.lifecycle, to)) {
    throw new Error(`invalid_transition:${binding.lifecycle}->${to}`)
  }

  return { ...binding, lifecycle: to }
}

export function deriveMergeAuthority(binding: ProjectRoomBinding): MergeAuthority {
  const decision = binding.evidence?.decision

  if (!decision || (decision.verdict !== 'approve' && decision.verdict !== 'reject')) {
    return { granted: false, reason: 'no-explicit-decision' }
  }

  if (decision.verdict !== 'approve') {
    return { granted: false, reason: 'decision-rejected' }
  }

  return {
    granted: true,
    source: decision.source,
    actor: decision.actor,
    verdict: decision.verdict,
    summary: decision.summary
  }
}

const LINEAR_ISSUE_URL = /^https:\/\/linear\.app\/[A-Za-z0-9_-]+\/issue\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9._~-]*)?$/

export function validateLinearIssueUrl(value: string): { ok: true; url: string } | { ok: false; reason: string } {
  const url = value.trim()

  if (!url) {
    return { ok: false, reason: 'empty' }
  }

  if (!LINEAR_ISSUE_URL.test(url)) {
    return { ok: false, reason: 'not-linear-issue' }
  }

  return { ok: true, url }
}

export function archiveProjectRoom(binding: ProjectRoomBinding): ProjectRoomBinding {
  return transitionPrLifecycle(binding, 'archived')
}
