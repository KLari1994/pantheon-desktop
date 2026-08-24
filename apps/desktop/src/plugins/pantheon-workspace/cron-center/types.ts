export interface CronCenterOwner {
  connectionId: string
  profile: string
  targetProfile: string
  mode: 'local' | 'remote'
  label: string
}

export type CronCenterJobKey = `${string}::${string}::${string}`

export interface CronCenterExecution {
  id?: string
  job_id?: string
  status?: string
  claimed_at?: string
  started_at?: string
  finished_at?: string
  error?: string
  source?: string
}

export interface CronCenterMonitorState {
  last_output_hash?: string
  last_changed_at?: string
}

export interface CronCenterFireError {
  at?: string
  detail?: string
}

export interface CronCenterSchedule {
  display?: string
  expr?: string
  kind?: string
}

export interface CronCenterPersistedJob {
  deliver?: null | string
  enabled: boolean
  id: string
  last_error?: null | string
  last_run_at?: null | string
  model?: null | string
  name?: null | string
  next_run_at?: null | string
  no_agent?: boolean
  prompt?: null | string
  provider?: null | string
  schedule?: CronCenterSchedule
  schedule_display?: null | string
  script?: null | string
  state?: null | string
  failure_streak?: number
  reasoning_effort?: null | string
  last_status?: null | string
  last_delivery_error?: null | string
  last_fire_error?: CronCenterFireError | null
  monitor_script?: null | string
  monitor_url?: null | string
  monitor_state?: CronCenterMonitorState | null
  latest_execution?: CronCenterExecution | null
}

export interface CronCenterJobUpdates {
  deliver?: string
  enabled?: boolean
  model?: null | string
  name?: string
  prompt?: string
  provider?: null | string
  schedule?: string
}

export interface CronCenterSessionInfo {
  id: string
  preview: null | string
  started_at: number
  last_active: number
  title: null | string
}

export type CronCenterHealth = 'failed' | 'healthy' | 'in-progress' | 'needs-attention' | 'not-run' | 'silent-no-change'

export type CronCenterSliceStatus = 'degraded' | 'error' | 'loading' | 'ready'

export interface CronCenterRow {
  key: CronCenterJobKey
  owner: CronCenterOwner
  job: CronCenterPersistedJob
  name: string
  schedule: string
  provider: null | string
  model: null | string
  reasoning: null | string
  agentLabel: string
  nextRun: null | string
  lastRun: null | string
  result: CronCenterHealth
  resultLabel: string
  delivery: string
  failureStreak: number
  scriptOnly: boolean
  paused: boolean
}

export interface CronCenterHistoryRow {
  id: string
  title: string
  preview: string
  startedAt: null | number
  lastActive: null | number
}

export interface CronCenterOwnerSlice {
  owner: CronCenterOwner
  jobs: CronCenterPersistedJob[]
  generation: number
  status: CronCenterSliceStatus
  error: null | string
}

export function jobIsScriptOnly(job: Pick<CronCenterPersistedJob, 'no_agent' | 'script'>): boolean {
  return Boolean(job.no_agent) && Boolean((typeof job.script === 'string' ? job.script : '').trim())
}

export function cronEditorUpdates(
  values: { deliver: string; model: string; name: string; prompt: string; provider: string; schedule: string },
  options: { scriptOnlyJob: boolean }
): CronCenterJobUpdates {
  const updates: CronCenterJobUpdates = {
    deliver: values.deliver,
    name: values.name,
    schedule: values.schedule.trim()
  }

  const trimmedPrompt = values.prompt.trim()

  if (!options.scriptOnlyJob || trimmedPrompt) {
    updates.prompt = trimmedPrompt
  }

  if (!options.scriptOnlyJob) {
    updates.model = values.model.trim() || null
    updates.provider = values.provider.trim() || null
  }

  return updates
}

export function validateCronEditor(input: { prompt: string; schedule: string; scriptOnlyJob: boolean }): null | string {
  const trimmedPrompt = input.prompt.trim()
  const trimmedSchedule = input.schedule.trim()

  if (!trimmedSchedule && !trimmedPrompt && !input.scriptOnlyJob) {
    return 'prompt_and_schedule'
  }

  if (!trimmedSchedule) {
    return 'schedule'
  }

  if (!input.scriptOnlyJob && !trimmedPrompt) {
    return 'prompt'
  }

  return null
}
