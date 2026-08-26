import {
  $projects,
  $projectTree,
  desktopBuzzClient,
  desktopGit,
  type HermesGitWorktree,
  host,
  refreshProjects,
  refreshProjectTree,
  useValue
} from '@hermes/plugin-sdk'
import { type ReactNode, useEffect, useMemo, useState } from 'react'

import { projectEnglish } from './i18n'
import { observeMachineRoute, resolveMachineTarget, type RosterSource } from './machine-target'
import { PrRoom } from './pr-room'
import { joinProjectRooms, parseManifestBindings, preflightWorktree, ProjectStore } from './store'
import type {
  LiveMachineRoute,
  MachineAvailability,
  ProjectRoomBinding,
  ProjectRoomRecord,
  ReadOnlyReviewSnapshot,
  WorktreeProof
} from './types'
import { activateWorkSurface, loadReadOnlyReview } from './work-surfaces'

export interface ProjectPageDeps {
  loadBindings: () => Promise<{
    records: ProjectRoomRecord[]
    sources: RosterSource[]
  }>
  activate: (route: { connectionId: string; profile: string }) => Promise<void>
  listWorktrees: (binding: ProjectRoomBinding) => Promise<HermesGitWorktree[]>
  currentRoute: () => LiveMachineRoute
  loadReview?: (binding: ProjectRoomBinding) => Promise<ReadOnlyReviewSnapshot>
}

async function defaultLoadBindings() {
  await Promise.allSettled([refreshProjects(), refreshProjectTree()])
  const client = desktopBuzzClient()
  const manifest = await client.getWorkspaceManifest().catch(() => ({ version: 1, rooms: [] }))
  const rooms = await client.listRooms().catch(() => ({ rooms: [] }))
  const parsed = parseManifestBindings(manifest)
  const valid = parsed.filter(
    (item): item is { status: 'valid'; binding: ProjectRoomBinding } => item.status === 'valid'
  )
  const invalid = parsed.filter(item => item.status !== 'valid')

  const joined = joinProjectRooms({
    bindings: valid.map(item => item.binding),
    projects: $projects.get().map(project => ({
      id: project.id,
      name: project.name,
      primary_path: project.primary_path
    })),
    rooms: rooms.rooms.map(room => ({ id: room.id, name: room.name })),
    trees: $projectTree.get().map(tree => ({
      id: tree.id,
      path: tree.path,
      repos: tree.repos?.map(repo => ({ path: repo.path }))
    }))
  })

  const sources = (await window.hermesDesktop?.getAgentRoster?.().catch(() => ({ sources: [] })))?.sources || []

  return { records: [...invalid, ...joined], sources }
}

function liveHostRoute(): LiveMachineRoute {
  return {
    connectionId: host.state.connectionId.get() ?? undefined,
    profile: host.state.profile.get() || undefined
  }
}

const defaultDeps: ProjectPageDeps = {
  loadBindings: defaultLoadBindings,
  activate: route => host.ensureAgent(route.connectionId, route.profile),
  listWorktrees: async binding => {
    const git = desktopGit({ connectionId: binding.machine.connectionId, profile: binding.machine.profile })

    if (!git) {
      throw new Error('git-unavailable')
    }

    return git.worktreeList(binding.repoPath)
  },
  currentRoute: liveHostRoute,
  loadReview: loadReadOnlyReview
}

function recordLabel(record: ProjectRoomRecord): string {
  if (record.status === 'valid') {
    return record.binding.projectName || record.binding.projectId
  }

  return 'Invalid binding'
}

function resolveLiveRoute(
  sampled: LiveMachineRoute,
  sources: readonly RosterSource[],
  hostRoute: LiveMachineRoute
): LiveMachineRoute {
  const connectionId = sampled.connectionId ?? hostRoute.connectionId
  const profile = sampled.profile ?? hostRoute.profile
  const machineId = sampled.machineId ?? sources.find(item => item.connectionId === connectionId)?.installId

  return { connectionId, profile, machineId }
}

export function ProjectPage({
  deps = defaultDeps,
  renderConversation
}: {
  deps?: ProjectPageDeps
  renderConversation?: (roomId: string) => ReactNode
}) {
  const store = useMemo(() => new ProjectStore(), [])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [records, setRecords] = useState<ProjectRoomRecord[]>([])
  const [sources, setSources] = useState<RosterSource[]>([])
  const [machine, setMachine] = useState<MachineAvailability | null>(null)
  const [proof, setProof] = useState<WorktreeProof>('checking')
  const [preflightError, setPreflightError] = useState<string | null>(null)
  const [review, setReview] = useState<ReadOnlyReviewSnapshot | null>(null)
  const hostConnectionId = useValue(host.state.connectionId)
  const hostProfile = useValue(host.state.profile)
  const sampledRoute = deps.currentRoute()

  const route = resolveLiveRoute(sampledRoute, sources, {
    connectionId: hostConnectionId ?? undefined,
    profile: hostProfile || undefined
  })

  useEffect(() => {
    let cancelled = false
    void deps
      .loadBindings()
      .then(next => {
        if (cancelled) {
          return
        }
        store.applyProjection(next.records)
        setRecords(next.records)
        setSources(next.sources)
        setStatus('ready')
      })
      .catch(err => {
        if (cancelled) {
          return
        }
        setError(err instanceof Error ? err.message : String(err))
        setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [deps.loadBindings, store])

  const selected = store.selected()
  const selectedBinding = selected?.status === 'valid' ? selected.binding : null

  useEffect(() => {
    if (!selectedBinding) {
      setMachine(null)
      setProof('checking')
      setPreflightError(null)
      setReview(null)

      return
    }

    let cancelled = false
    const resolved = resolveMachineTarget(selectedBinding.machine, sources)
    const observed = observeMachineRoute(selectedBinding.machine, route)
    const next = resolved.status !== 'available' ? resolved : observed
    setMachine(next)
    setProof(next.status === 'available' ? 'checking' : 'blocked')
    setPreflightError(next.status === 'blocked' ? next.reason : null)
    setReview(null)

    if (next.status !== 'available') {
      return
    }
    void (async () => {
      try {
        await deps.activate({
          connectionId: selectedBinding.machine.connectionId,
          profile: selectedBinding.machine.profile
        })
        const worktrees = await deps.listWorktrees(selectedBinding)

        if (cancelled) {
          return
        }
        const result = preflightWorktree(selectedBinding, worktrees)

        if (!result.ok) {
          setProof('blocked')
          setPreflightError(result.reason)

          return
        }

        setProof('verified')
        setPreflightError(null)
      } catch (err) {
        if (!cancelled) {
          setProof('blocked')
          setPreflightError(err instanceof Error ? err.message : String(err))
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [deps.activate, deps.listWorktrees, selectedBinding, sources, route.connectionId, route.machineId, route.profile])

  if (status === 'loading') {
    return <div className="p-4 text-sm text-(--ui-text-secondary)">{projectEnglish.loading}</div>
  }

  if (status === 'error') {
    return <div className="p-4 text-sm text-(--ui-text-secondary)">{error || projectEnglish.invalidBinding}</div>
  }

  if (!selected) {
    return (
      <div className="p-4">
        <h1 className="text-sm font-medium">{projectEnglish.title}</h1>
        {records.length === 0 ? (
          <p className="mt-2 text-sm text-(--ui-text-secondary)">{projectEnglish.empty}</p>
        ) : null}
        <ul className="mt-3 flex flex-col gap-2">
          {records.map((record, index) => (
            <li key={record.status === 'valid' ? record.binding.buzzRoomId : `invalid-${index}`}>
              <button
                onClick={() => {
                  const id = record.status === 'valid' ? record.binding.buzzRoomId : `invalid-${index}`
                  store.select(id)
                  setRecords([...store.rooms()])
                }}
                type="button"
              >
                {recordLabel(record)}
              </button>
              {record.status === 'invalid' ? (
                <p className="text-xs text-(--ui-text-secondary)">
                  {projectEnglish.invalidBinding}: {record.reason}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  if (selected.status === 'invalid') {
    return (
      <div className="p-4 text-sm">
        {projectEnglish.invalidBinding}: {selected.reason}
      </div>
    )
  }

  if (!machine || machine.status !== 'available' || proof !== 'verified') {
    return (
      <div className="p-4 text-sm">
        {proof === 'checking' ? projectEnglish.checkingWorktree : projectEnglish.unavailableMachine}
        {preflightError ? <p>{preflightError}</p> : null}
        {machine ? <p>{machine.status === 'blocked' ? machine.reason : machine.status}</p> : null}
      </div>
    )
  }

  return (
    <PrRoom
      binding={selected.binding}
      conversation={renderConversation?.(selected.binding.buzzRoomId)}
      machine={machine}
      onActivateTab={tab => {
        if (tab === 'review') {
          void (deps.loadReview ?? loadReadOnlyReview)(selected.binding)
            .then(next => {
              setReview(next)
            })
            .catch(err => {
              setReview({ files: [], base: err instanceof Error ? err.message : String(err) })
            })

          return
        }

        activateWorkSurface(tab, selected.binding)
      }}
      review={review}
    />
  )
}
