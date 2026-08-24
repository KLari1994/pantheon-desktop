import { expect, test } from 'vitest'

import {
  jobKey,
  projectCronHistory,
  projectCronRow,
  projectJobHealth
} from './projections'
import type { CronCenterOwner, CronCenterPersistedJob } from './types'

const ownerA: CronCenterOwner = {
  connectionId: 'conn-a',
  profile: 'worker',
  targetProfile: 'backend-a',
  mode: 'remote',
  label: 'Homelab / worker'
}

const ownerB: CronCenterOwner = {
  connectionId: 'conn-b',
  profile: 'worker',
  targetProfile: 'backend-b',
  mode: 'remote',
  label: 'Office / worker'
}

function job(partial: Partial<CronCenterPersistedJob> & Pick<CronCenterPersistedJob, 'id'>): CronCenterPersistedJob {
  return {
    enabled: true,
    name: 'nightly',
    ...partial
  }
}

test('composite keys distinguish the same profile and job id on two connections', () => {
  expect(jobKey(ownerA, 'job-1')).toBe('conn-a::worker::job-1')
  expect(jobKey(ownerB, 'job-1')).toBe('conn-b::worker::job-1')
  expect(jobKey(ownerA, 'job-1')).not.toBe(jobKey(ownerB, 'job-1'))
})

test('row projection includes every required Cron Center column', () => {
  const row = projectCronRow(
    ownerA,
    job({
      id: 'job-1',
      name: 'Nightly backup',
      schedule_display: 'every day at 3am',
      provider: 'openai',
      model: 'gpt-5',
      reasoning_effort: 'high',
      next_run_at: '2026-08-25T03:00:00Z',
      last_run_at: '2026-08-24T03:00:00Z',
      last_status: 'ok',
      deliver: 'local',
      failure_streak: 0,
      latest_execution: { status: 'completed', claimed_at: '2026-08-24T03:00:00Z' }
    })
  )

  expect(row).toMatchObject({
    key: 'conn-a::worker::job-1',
    name: 'Nightly backup',
    schedule: 'every day at 3am',
    provider: 'openai',
    model: 'gpt-5',
    reasoning: 'high',
    nextRun: '2026-08-25T03:00:00Z',
    lastRun: '2026-08-24T03:00:00Z',
    result: 'healthy',
    delivery: 'local',
    failureStreak: 0
  })
  expect(row.owner).toEqual(ownerA)
  expect(row.agentLabel).not.toBe('No agent')
})

test('ledger unknown, blocked_config, exhausted, delivery, and fire errors need attention', () => {
  expect(projectJobHealth(job({ id: 'u', latest_execution: { status: 'unknown' } }))).toBe('needs-attention')
  expect(projectJobHealth(job({ id: 'b', last_status: 'blocked_config' }))).toBe('needs-attention')
  expect(projectJobHealth(job({ id: 'e', state: 'exhausted' }))).toBe('needs-attention')
  expect(projectJobHealth(job({ id: 'd', last_delivery_error: 'telegram 401' }))).toBe('needs-attention')
  expect(projectJobHealth(job({ id: 'f', last_fire_error: { detail: 'forward failed' } }))).toBe('needs-attention')
})

test('persisted failures win over a wrapper-looking ok last status only when ledger failed', () => {
  expect(projectJobHealth(job({ id: 'fail-state', state: 'failed' }))).toBe('failed')
  expect(projectJobHealth(job({ id: 'fail-status', last_status: 'error' }))).toBe('failed')
  expect(projectJobHealth(job({ id: 'fail-exec', latest_execution: { status: 'failed' } }))).toBe('failed')
  expect(
    projectJobHealth(
      job({
        id: 'attention-over-fail',
        last_status: 'error',
        latest_execution: { status: 'unknown' }
      })
    )
  ).toBe('needs-attention')
})

test('monitor no-change and explicit silent status project as silent-no-change', () => {
  expect(projectJobHealth(job({ id: 'silent', last_status: 'silent' }))).toBe('silent-no-change')
  expect(projectJobHealth(job({ id: 'no-change', last_status: 'no-change' }))).toBe('silent-no-change')
  expect(
    projectJobHealth(
      job({
        id: 'monitor-quiet',
        monitor_script: 'curl https://status',
        monitor_state: { last_changed_at: '2026-08-24T01:00:00Z' },
        latest_execution: { status: 'completed', claimed_at: '2026-08-24T02:00:00Z' }
      })
    )
  ).toBe('silent-no-change')
})

test('healthy completion never uses wrapper ok text as an input', () => {
  const health = projectJobHealth(
    job({
      id: 'ok',
      last_status: 'ok',
      latest_execution: { status: 'completed', claimed_at: '2026-08-24T03:00:00Z' }
    })
  )

  expect(health).toBe('healthy')
  expect(projectJobHealth(job({ id: 'never' }))).toBe('not-run')
  expect(projectJobHealth(job({ id: 'run', latest_execution: { status: 'running' } }))).toBe('in-progress')
  expect(projectJobHealth(job({ id: 'claim', latest_execution: { status: 'claimed' } }))).toBe('in-progress')
})

test('script-only jobs show No agent and omit model provider reasoning claims', () => {
  const row = projectCronRow(
    ownerA,
    job({
      id: 'script-1',
      name: 'rotate logs',
      no_agent: true,
      script: 'echo hi',
      provider: 'openai',
      model: 'gpt-5',
      reasoning_effort: 'high',
      last_status: 'ok'
    })
  )

  expect(row.scriptOnly).toBe(true)
  expect(row.agentLabel).toBe('No agent')
  expect(row.provider).toBeNull()
  expect(row.model).toBeNull()
  expect(row.reasoning).toBeNull()
})

test('agent jobs without pins display Default instead of guessing an effective model', () => {
  const row = projectCronRow(ownerA, job({ id: 'default-model', last_status: 'ok' }))
  expect(row.scriptOnly).toBe(false)
  expect(row.agentLabel).toBe('Default')
  expect(row.provider).toBeNull()
  expect(row.model).toBeNull()
  expect(row.reasoning).toBeNull()
})

test('history is bounded to 20 persisted rows and missing output stays unavailable', () => {
  const rows = projectCronHistory(
    Array.from({ length: 25 }, (_, index) => ({
      id: `run-${index}`,
      ended_at: null,
      input_tokens: 0,
      is_active: false,
      last_active: index,
      message_count: 0,
      model: null,
      output_tokens: 0,
      preview: index === 0 ? 'did work' : null,
      source: 'cron',
      started_at: index,
      title: index === 1 ? 'Nightly' : null,
      tool_call_count: 0
    }))
  )

  expect(rows).toHaveLength(20)
  expect(rows[0]).toMatchObject({ id: 'run-0', preview: 'did work' })
  expect(rows[1]).toMatchObject({ id: 'run-1', title: 'Nightly', preview: 'unavailable' })
})
