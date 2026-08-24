export interface WorkspaceManifest {
  version: number
  buzz?: { relayUrl?: string }
  agents?: Array<{
    id: string
    connectionId: string
    profile: string
    machineId?: string
    residency?: string
    pubkey?: string
  }>
  rooms?: Array<{
    id: string
    kind?: string
    name?: string
    memberAgentIds?: string[]
  }>
  [key: string]: unknown
}

export function parseWorkspaceManifest(value: unknown): WorkspaceManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid_manifest')
  }
  const record = value as Record<string, unknown>
  if (record.version !== undefined && record.version !== 1) {
    throw new Error('unsupported_version')
  }
  return { version: 1, ...record }
}
