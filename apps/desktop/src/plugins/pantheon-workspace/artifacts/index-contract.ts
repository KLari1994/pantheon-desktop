import type { ArtifactRecord } from '@hermes/plugin-sdk'

import type { PantheonArtifactSource } from './provenance'

export type ArtifactIndexFacet =
  | 'agent'
  | 'fileType'
  | 'machine'
  | 'office'
  | 'pr'
  | 'project'
  | 'room'
  | 'session'

export interface IndexedArtifact {
  id: string
  title: string
  agent?: string
  fileType?: string
  machine?: string
  office?: string
  pr?: string
  project?: string
  room?: string
  session?: string
}

export type ArtifactIndexFilters = Partial<Record<ArtifactIndexFacet, string>>

export function fileTypeFromValue(value: string): string | undefined {
  const match = /\.([a-z0-9]{1,8})(?:\?.*)?$/i.exec(value.trim())
  return match?.[1]?.toLowerCase()
}

export function indexArtifact(
  record: ArtifactRecord & { office?: string; pr?: string; project?: string; room?: string; source?: PantheonArtifactSource }
): IndexedArtifact {
  const source = record.source
  const session =
    source?.kind === 'session' ? source.storedSessionId : record.sessionId
  const agent = source && 'profile' in source ? source.profile : record.profile
  const machine = source && 'machine' in source ? source.machine : record.connectionId
  const room = source?.kind === 'room' ? source.roomId : record.room
  const project = source?.kind === 'project' ? source.projectId : record.project
  const pr = source?.kind === 'project' ? source.prId : record.pr

  return {
    id: record.id,
    title: record.label,
    ...(agent ? { agent } : {}),
    ...(fileTypeFromValue(record.value) ? { fileType: fileTypeFromValue(record.value) } : {}),
    ...(machine ? { machine } : {}),
    ...(record.office ? { office: record.office } : {}),
    ...(pr ? { pr } : {}),
    ...(project ? { project } : {}),
    ...(room ? { room } : {}),
    ...(session ? { session } : {})
  }
}

export function filterArtifactIndex(
  items: readonly IndexedArtifact[],
  filters: ArtifactIndexFilters
): IndexedArtifact[] {
  const entries = Object.entries(filters).filter(([, value]) => Boolean(value))

  return items.filter(item =>
    entries.every(([facet, value]) => item[facet as ArtifactIndexFacet] === value)
  )
}
