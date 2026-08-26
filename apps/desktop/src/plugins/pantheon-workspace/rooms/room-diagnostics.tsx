import { BUZZ_ACP_PIN } from '@hermes/plugin-sdk'

export interface RoomDiagnosticRow {
  agent: string
  connectionId: string
  machine?: string
  storedSessionId?: string
  lineageRootId?: string
  runtimeSessionId?: string
  lastEventAt?: number
  health: 'resumable' | 'missing' | 'unknown'
}

export function deriveBindingHealth(input: {
  storedSessionId?: string
  runtimeSessionId?: string
}): RoomDiagnosticRow['health'] {
  if (input.storedSessionId && input.runtimeSessionId) {
    return 'resumable'
  }

  if (!input.storedSessionId) {
    return 'missing'
  }

  return 'unknown'
}

export function liveDiagnosticRoute(
  owner?: { connectionId?: string | null; profile?: string | null } | null,
  ambient?: { connectionId?: string | null; profile?: string | null },
  runtimeSessionId?: string | null
): { connectionId?: string; profile?: string; runtimeSessionId?: string } {
  return {
    connectionId: owner?.connectionId || ambient?.connectionId || undefined,
    profile: owner?.profile || ambient?.profile || undefined,
    runtimeSessionId: runtimeSessionId || undefined
  }
}

export function diagnosticRuntimeForAgent(
  agent: { connectionId: string; profile: string; machineId?: string },
  live?: { connectionId?: string | null; profile?: string | null; runtimeSessionId?: string | null }
): { machine?: string; runtimeSessionId?: string } {
  const matches =
    Boolean(live?.connectionId && live.connectionId === agent.connectionId) &&
    Boolean(live?.profile && live.profile === agent.profile)

  return {
    machine: agent.machineId,
    runtimeSessionId: matches ? live?.runtimeSessionId || undefined : undefined
  }
}

export async function loadRoomDiagnostics(
  requestProfile: (route: unknown, method: string, params: Record<string, unknown>) => Promise<unknown>,
  input: {
    route: { connectionId: string; profile: string }
    machine?: string
    runtimeSessionId?: string
    lastEventAt?: number
  }
): Promise<RoomDiagnosticRow[]> {
  const listed = await requestProfile(input.route, 'session.list', { include_hidden: true })

  const sessions = Array.isArray((listed as { sessions?: unknown[] })?.sessions)
    ? (listed as { sessions: Array<Record<string, unknown>> }).sessions
    : []

  return sessions.map(session => {
    const storedSessionId = typeof session.id === 'string' ? session.id : undefined
    const profile = typeof session.profile === 'string' ? session.profile : input.route.profile

    const connectionId =
      typeof session.connection_id === 'string'
        ? session.connection_id
        : typeof session.connectionId === 'string'
          ? session.connectionId
          : input.route.connectionId

    return {
      agent: profile,
      connectionId,
      machine: input.machine,
      storedSessionId,
      lineageRootId: typeof session._lineage_root_id === 'string' ? session._lineage_root_id : undefined,
      runtimeSessionId: input.runtimeSessionId,
      lastEventAt: input.lastEventAt,
      health: deriveBindingHealth({ storedSessionId, runtimeSessionId: input.runtimeSessionId })
    }
  })
}

export function RoomDiagnostics({ rows }: { rows: RoomDiagnosticRow[] }) {
  return (
    <section className="border-t border-(--ui-stroke-tertiary) p-3 text-xs">
      <p className="mb-2 text-(--ui-text-tertiary)">
        Resume is owned by the pinned buzz-acp store {BUZZ_ACP_PIN.commit.slice(0, 9)}.
      </p>
      <table>
        <thead>
          <tr>
            <th>Agent</th>
            <th>Connection</th>
            <th>Stored</th>
            <th>Runtime</th>
            <th>Health</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={`${row.connectionId}:${row.agent}`}>
              <td>{row.agent}</td>
              <td>{row.connectionId}</td>
              <td>{row.storedSessionId || '—'}</td>
              <td>{row.runtimeSessionId || '—'}</td>
              <td>{row.health}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
