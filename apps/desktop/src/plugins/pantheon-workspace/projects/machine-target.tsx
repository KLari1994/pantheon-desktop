import type { DesktopAgentRoster } from '@hermes/plugin-sdk'

import type { MachineAvailability, MachineTarget } from './types'

export type RosterSource = DesktopAgentRoster['sources'][number]

export function resolveMachineTarget(target: MachineTarget, sources: readonly RosterSource[]): MachineAvailability {
  const source = sources.find(item => item.connectionId === target.connectionId)

  if (!source) {
    return { status: 'blocked', reason: 'missing-source', target }
  }

  if (source.reachable !== true) {
    return { status: 'blocked', reason: 'unreachable', target }
  }

  if (!source.installId) {
    return { status: 'blocked', reason: 'missing-identity', target }
  }

  if (source.installId !== target.machineId) {
    return { status: 'blocked', reason: 'identity-mismatch', target }
  }

  return { status: 'available', target, installId: source.installId }
}

export function observeMachineRoute(
  target: MachineTarget,
  current: { connectionId?: string; machineId?: string; profile?: string }
): MachineAvailability {
  if (
    current.connectionId !== target.connectionId ||
    current.profile !== target.profile ||
    current.machineId !== target.machineId
  ) {
    return { status: 'blocked', reason: 'route-changed', target }
  }

  return { status: 'available', target, installId: target.machineId }
}

export async function switchMachineTarget(
  resolved: MachineAvailability,
  deps: {
    activate: (route: { connectionId: string; profile: string }) => Promise<void> | void
    git?: { worktreeList?: (...args: never[]) => unknown }
  }
): Promise<MachineAvailability> {
  if (resolved.status !== 'available' || !resolved.target) {
    throw new Error(`blocked:${resolved.status === 'blocked' ? resolved.reason : 'unavailable'}`)
  }

  await deps.activate({ connectionId: resolved.target.connectionId, profile: resolved.target.profile })

  return resolved
}

export function MachineTargetBanner({ resolved }: { resolved: MachineAvailability }) {
  const target = resolved.target
  const availability = resolved.status === 'available' ? 'available' : 'blocked'

  return (
    <div
      aria-label="Machine target"
      className="flex flex-wrap items-center gap-2 text-sm"
      data-status={resolved.status}
    >
      <span>{target?.label || 'Unknown machine'}</span>
      <span>connection {target?.connectionId || 'missing'}</span>
      <span>machine {target?.machineId || 'unverified'}</span>
      <span>profile {target?.profile || 'missing'}</span>
      <span>
        {availability === 'available'
          ? 'available'
          : `blocked (${resolved.status === 'blocked' ? resolved.reason : 'unavailable'})`}
      </span>
    </div>
  )
}
