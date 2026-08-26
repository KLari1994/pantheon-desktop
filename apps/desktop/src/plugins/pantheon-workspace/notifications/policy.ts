export type ActionWorthyType =
  | 'approval'
  | 'direct-mention'
  | 'exhausted-cron-retry'
  | 'explicit-needs-you'
  | 'long-running-completion'
  | 'merge-decision'
  | 'review-decision'

export type SilentType = 'healthy-background' | 'ordinary-message' | 'routine-working' | 'successful-cron' | 'tool-call'

export type NotificationEventType = ActionWorthyType | SilentType

export interface NotificationTarget {
  kind: string
  href: string
}

export interface NotificationEvent {
  id: string
  type: NotificationEventType
  target: NotificationTarget
  botId?: string
  roomId?: string
}

export interface NotificationMutes {
  mutedBots: string[]
  mutedRooms: string[]
}

const ACTION_WORTHY = new Set<NotificationEventType>([
  'direct-mention',
  'explicit-needs-you',
  'approval',
  'exhausted-cron-retry',
  'long-running-completion',
  'review-decision',
  'merge-decision'
])

export function classifyNotificationEvent(event: NotificationEvent, mutes: NotificationMutes): 'notify' | 'silence' {
  if (!ACTION_WORTHY.has(event.type)) {
    return 'silence'
  }

  if (!event.target?.href) {
    return 'silence'
  }

  if (event.botId && mutes.mutedBots.includes(event.botId)) {
    return 'silence'
  }

  if (event.roomId && mutes.mutedRooms.includes(event.roomId)) {
    return 'silence'
  }

  return 'notify'
}
