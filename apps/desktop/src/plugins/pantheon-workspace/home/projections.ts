import { registeredHref } from './navigation'
import {
  HOME_SECTIONS,
  type HomeEventType,
  type HomeItem,
  type HomeNavigationTarget,
  type HomeSection,
  type HomeSourceEvent,
  type HomeSourceKind
} from './types'

export { HOME_SECTIONS, type HomeItem, type HomeNavigationTarget, type HomeSourceEvent }

const SILENT_TYPES = new Set<HomeEventType>([
  'ordinary-message',
  'routine-background-completion',
  'successful-cron',
  'tool-call'
])

const SECTION_FOR: Record<Exclude<HomeEventType, 'ordinary-message' | 'routine-background-completion' | 'successful-cron' | 'tool-call'>, HomeSection> =
  {
    approval: 'Needs You',
    'direct-mention': 'Needs You',
    'explicit-needs-you': 'Needs You',
    running: 'Working',
    stalled: 'Stalled/Failed',
    'exhausted-retry': 'Stalled/Failed',
    failed: 'Stalled/Failed',
    'long-running-completion': 'Today',
    'merge-decision': 'Today',
    'review-decision': 'Today'
  }

const DEFAULT_STATUS: Record<string, string> = {
  approval: 'needs-input',
  'direct-mention': 'needs-you',
  'explicit-needs-you': 'needs-you',
  running: 'working',
  stalled: 'stalled',
  'exhausted-retry': 'failed',
  failed: 'failed',
  'long-running-completion': 'complete',
  'review-decision': 'review',
  'merge-decision': 'merge'
}

export function navigationTarget(
  kind: HomeSourceKind,
  sourceId: string,
  owner?: { connectionId?: null | string; profile?: null | string }
): HomeNavigationTarget {
  const href = registeredHref(kind, sourceId, owner)
  switch (kind) {
    case 'bot':
      return { kind, botId: sourceId, href }
    case 'room':
      return { kind, roomId: sourceId, href }
    case 'session':
      return { kind, sessionId: sourceId, href }
    case 'cron':
      return {
        kind,
        jobId: sourceId,
        href,
        ...(owner?.connectionId ? { connectionId: owner.connectionId } : {}),
        ...(owner?.profile ? { profile: owner.profile } : {})
      }
    case 'project':
      return { kind, projectId: sourceId, href }
    case 'pr':
      return { kind, prId: sourceId, href }
    case 'artifact':
      return { kind, artifactId: sourceId, href }
  }
}

export function homeLogicalId(event: HomeSourceEvent): string {
  if (event.type === 'approval') {
    return event.requestId ? `approval:${event.requestId}` : `approval-legacy:${event.sourceId}`
  }
  return event.id || `${event.type}:${event.sourceKind}:${event.sourceId}`
}

function statusLabel(status: string): string {
  const words = status.split(/[-_]/g).filter(Boolean)
  return words
    .map((part, index) => (index === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part.toLowerCase()))
    .join(' ')
}

function toItem(event: HomeSourceEvent): HomeItem | null {
  if (SILENT_TYPES.has(event.type)) return null
  const kind = event.type as HomeItem['kind']
  const status = event.status || DEFAULT_STATUS[event.type] || event.type
  return {
    id: homeLogicalId(event),
    section: SECTION_FOR[kind],
    kind,
    title: event.title || event.type,
    agent: event.agent,
    context: event.context,
    machine: event.machine,
    timestamp: event.timestamp,
    status,
    statusLabel: statusLabel(status),
    navigation: navigationTarget(event.sourceKind, event.sourceId, {
      connectionId: event.connectionId,
      profile: event.profile
    })
  }
}

export function projectHomeItems(events: readonly HomeSourceEvent[]): HomeItem[] {
  const byId = new Map<string, HomeItem>()
  for (const event of events) {
    const item = toItem(event)
    if (!item) continue
    if (!byId.has(item.id)) byId.set(item.id, item)
  }
  const sectionRank = new Map(HOME_SECTIONS.map((section, index) => [section, index]))
  return [...byId.values()].sort((a, b) => {
    const sectionDelta = (sectionRank.get(a.section) ?? 99) - (sectionRank.get(b.section) ?? 99)
    if (sectionDelta !== 0) return sectionDelta
    return a.timestamp - b.timestamp
  })
}
