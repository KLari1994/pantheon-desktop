export const HOME_SECTIONS = ['Needs You', 'Working', 'Stalled/Failed', 'Today'] as const

export type HomeSection = (typeof HOME_SECTIONS)[number]

export type HomeSourceKind = 'artifact' | 'bot' | 'cron' | 'pr' | 'project' | 'room' | 'session'

export type HomeEventType =
  | 'approval'
  | 'direct-mention'
  | 'exhausted-retry'
  | 'explicit-needs-you'
  | 'failed'
  | 'long-running-completion'
  | 'merge-decision'
  | 'ordinary-message'
  | 'review-decision'
  | 'routine-background-completion'
  | 'running'
  | 'stalled'
  | 'successful-cron'
  | 'tool-call'

export type HomeNavigationTarget =
  | { kind: 'artifact'; artifactId: string; href: string }
  | { kind: 'bot'; botId: string; href: string }
  | { kind: 'cron'; jobId: string; href: string; connectionId?: string; profile?: string }
  | { kind: 'pr'; prId: string; href: string }
  | { kind: 'project'; projectId: string; href: string }
  | { kind: 'room'; roomId: string; href: string }
  | { kind: 'session'; sessionId: string; href: string }

export interface HomeItem {
  readonly id: string
  readonly section: HomeSection
  readonly kind: Exclude<
    HomeEventType,
    'ordinary-message' | 'routine-background-completion' | 'successful-cron' | 'tool-call'
  >
  readonly title: string
  readonly agent: string
  readonly context: string
  readonly machine: string
  readonly timestamp: number
  readonly status: string
  readonly statusLabel: string
  readonly navigation: HomeNavigationTarget
}

export interface HomeSourceEvent {
  type: HomeEventType
  sourceKind: HomeSourceKind
  sourceId: string
  agent: string
  context: string
  machine: string
  timestamp: number
  title?: string
  status?: string
  requestId?: string
  id?: string
  botId?: string
  roomId?: string
  connectionId?: string
  profile?: string
}
