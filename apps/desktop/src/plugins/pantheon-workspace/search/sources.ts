import type { SearchSourceHit } from './federation'

export interface SearchSourceRecord {
  connectionId: string
  hidden?: boolean
  id: string
  machine: string
  profile: string
  title: string
}

export function collectSearchHits(input: {
  bots?: readonly SearchSourceRecord[]
  rooms?: readonly SearchSourceRecord[]
  sessions?: readonly SearchSourceRecord[]
}): SearchSourceHit[] {
  const hits: SearchSourceHit[] = []

  for (const session of input.sessions ?? []) {
    hits.push(toHit('session', session))
  }

  for (const bot of input.bots ?? []) {
    hits.push(toHit('bot', bot))
  }

  for (const room of input.rooms ?? []) {
    hits.push(toHit('room', room))
  }

  return hits
}

function toHit(sourceType: SearchSourceHit['sourceType'], record: SearchSourceRecord): SearchSourceHit {
  return {
    destinationId: record.id,
    ...(record.hidden ? { hidden: true } : {}),
    machine: record.machine,
    ownerRoute: { connectionId: record.connectionId, profile: record.profile },
    sourceType,
    title: record.title
  }
}
