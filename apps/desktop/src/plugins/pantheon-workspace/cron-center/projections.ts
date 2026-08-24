import type {
  CronCenterHealth,
  CronCenterHistoryRow,
  CronCenterJobKey,
  CronCenterOwner,
  CronCenterPersistedJob,
  CronCenterRow,
  CronCenterSessionInfo
} from './types'
import { jobIsScriptOnly } from './types'

const asText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

const RESULT_LABEL: Record<CronCenterHealth, string> = {
  failed: 'Failed',
  healthy: 'Healthy',
  'in-progress': 'In progress',
  'needs-attention': 'Needs attention',
  'not-run': 'Not run yet',
  'silent-no-change': 'Silent / no-change'
}

export function ownerKey(owner: Pick<CronCenterOwner, 'connectionId' | 'profile'>): string {
  return `${owner.connectionId}::${owner.profile}`
}

export function jobKey(owner: Pick<CronCenterOwner, 'connectionId' | 'profile'>, jobId: string): CronCenterJobKey {
  return `${owner.connectionId}::${owner.profile}::${jobId}`
}

function parseInstant(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) {return null}
  const parsed = Date.parse(value)

  return Number.isFinite(parsed) ? parsed : null
}

function hasText(value: unknown): boolean {
  if (typeof value === 'string') {return value.trim().length > 0}

  if (value && typeof value === 'object' && 'detail' in value) {
    return asText((value as { detail?: unknown }).detail).length > 0
  }

  return false
}

function isInProgress(status: string): boolean {
  return status === 'running' || status === 'claimed'
}

function isMonitorJob(job: CronCenterPersistedJob): boolean {
  return Boolean(asText(job.monitor_script) || asText(job.monitor_url))
}

export function projectJobHealth(job: CronCenterPersistedJob): CronCenterHealth {
  const executionStatus = asText(job.latest_execution?.status).toLowerCase()
  const lastStatus = asText(job.last_status).toLowerCase()
  const state = asText(job.state).toLowerCase()

  if (
    executionStatus === 'unknown' ||
    lastStatus === 'blocked_config' ||
    state === 'blocked_config' ||
    state === 'exhausted' ||
    lastStatus === 'exhausted' ||
    hasText(job.last_delivery_error) ||
    hasText(job.last_fire_error)
  ) {
    return 'needs-attention'
  }

  if (isInProgress(executionStatus)) {
    return 'in-progress'
  }

  if (state === 'failed' || state === 'error' || lastStatus === 'error' || executionStatus === 'failed') {
    return 'failed'
  }

  if (lastStatus === 'silent' || lastStatus === 'no-change' || lastStatus === 'silent-no-change') {
    return 'silent-no-change'
  }

  if (isMonitorJob(job) && executionStatus === 'completed') {
    const claimed = parseInstant(job.latest_execution?.claimed_at)
    const changed = parseInstant(job.monitor_state?.last_changed_at)

    if (claimed !== null && (changed === null || claimed > changed)) {
      return 'silent-no-change'
    }
  }

  if (!job.last_run_at && !job.latest_execution && !lastStatus) {
    return 'not-run'
  }

  if (lastStatus === 'ok' || executionStatus === 'completed' || state === 'ok' || state === 'completed') {
    return 'healthy'
  }

  if (!lastStatus && !executionStatus) {
    return 'not-run'
  }

  return 'healthy'
}

export function projectCronRow(owner: CronCenterOwner, job: CronCenterPersistedJob): CronCenterRow {
  const scriptOnly = jobIsScriptOnly(job)
  const result = projectJobHealth(job)
  const provider = scriptOnly ? null : asText(job.provider) || null
  const model = scriptOnly ? null : asText(job.model) || null
  const reasoning = scriptOnly ? null : asText(job.reasoning_effort) || null

  return {
    key: jobKey(owner, job.id),
    owner,
    job,
    name: asText(job.name) || job.id,
    schedule: asText(job.schedule_display) || asText(job.schedule?.display) || asText(job.schedule?.expr) || '—',
    provider,
    model,
    reasoning,
    agentLabel: scriptOnly ? 'No agent' : model || provider || reasoning ? [provider, model, reasoning].filter(Boolean).join(' / ') : 'Default',
    nextRun: asText(job.next_run_at) || null,
    lastRun: asText(job.last_run_at) || null,
    result,
    resultLabel: RESULT_LABEL[result],
    delivery: asText(job.deliver) || 'local',
    failureStreak: Number(job.failure_streak || 0),
    scriptOnly,
    paused: job.enabled === false || asText(job.state).toLowerCase() === 'paused'
  }
}

export function projectCronHistory(runs: CronCenterSessionInfo[], limit = 20): CronCenterHistoryRow[] {
  return runs.slice(0, limit).map(run => ({
    id: run.id,
    title: asText(run.title) || run.id,
    preview: asText(run.preview) || 'unavailable',
    startedAt: typeof run.started_at === 'number' ? run.started_at : null,
    lastActive: typeof run.last_active === 'number' ? run.last_active : null
  }))
}
