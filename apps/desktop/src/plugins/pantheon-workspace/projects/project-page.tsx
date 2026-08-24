import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { desktopGit } from '@/lib/desktop-git'
import type { HermesGitWorktree } from '@/global'
import { $projects, $projectTree, refreshProjects, refreshProjectTree } from '@/store/projects'
import { ensureGatewayAgent } from '@/store/profile'
import { desktopBuzzClient } from '@/pantheon/buzz-client'

import { projectEnglish } from './i18n'
import { observeMachineRoute, resolveMachineTarget, type RosterSource } from './machine-target'
import { PrRoom } from './pr-room'
import { joinProjectRooms, parseManifestBindings, preflightWorktree, ProjectStore } from './store'
import type { MachineAvailability, ProjectRoomBinding, ProjectRoomRecord } from './types'
import { activateWorkSurface } from './work-surfaces'

export interface ProjectPageDeps {
  loadBindings: () => Promise<{
    records: ProjectRoomRecord[]
    sources: RosterSource[]
  }>
  activate: (route: { connectionId: string; profile: string }) => Promise<void>
  listWorktrees: (binding: ProjectRoomBinding) => Promise<HermesGitWorktree[]>
  currentRoute?: () => { connectionId?: string; machineId?: string; profile?: string }
}

async function defaultLoadBindings() {
  await Promise.allSettled([refreshProjects(), refreshProjectTree()])
  const client = desktopBuzzClient()
  const manifest = await client.getWorkspaceManifest().catch(() => ({ version: 1, rooms: [] }))
  const rooms = await client.listRooms().catch(() => ({ rooms: [] }))
  const parsed = parseManifestBindings(manifest)
  const valid = parsed.filter((item): item is { status: 'valid'; binding: ProjectRoomBinding } => item.status === 'valid')
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

const defaultDeps: ProjectPageDeps = {
  loadBindings: defaultLoadBindings,
  activate: route => ensureGatewayAgent(route.connectionId, route.profile),
  listWorktrees: async binding => {
    const git = desktopGit({ connectionId: binding.machine.connectionId, profile: binding.machine.profile })
    if (!git) {throw new Error('git-unavailable')}

    return git.worktreeList(binding.repoPath)
  }
}

function recordLabel(record: ProjectRoomRecord): string {
  if (record.status === 'valid') {
    return record.binding.projectName || record.binding.projectId
  }

  return 'Invalid binding'
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
  const [preflightError, setPreflightError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void deps.loadBindings().then(next => {
      if (cancelled) {return}
      store.applyProjection(next.records)
      setRecords(next.records)
      setSources(next.sources)
      setStatus('ready')
    }).catch(err => {
      if (cancelled) {return}
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    })

    return () => {
      cancelled = true
    }
  }, [deps, store])

  const selected = store.selected()
  const selectedBinding = selected?.status === 'valid' ? selected.binding : null

  useEffect(() => {
    if (!selectedBinding) {
      setMachine(null)
      setPreflightError(null)

      return
    }

    let cancelled = false
    const resolved = resolveMachineTarget(selectedBinding.machine, sources)
    const current = deps.currentRoute?.()
    const observed = current ? observeMachineRoute(selectedBinding.machine, current) : resolved
    const next = resolved.status !== 'available' ? resolved : observed
    setMachine(next)
    setPreflightError(null)

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
        if (cancelled) {return}
        const result = preflightWorktree(selectedBinding, worktrees)
        if (!result.ok) {
          setPreflightError(result.reason)
        }
      } catch (err) {
        if (!cancelled) {
          setPreflightError(err instanceof Error ? err.message : String(err))
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [deps, selectedBinding, sources])

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
        {records.length === 0 ? <p className="mt-2 text-sm text-(--ui-text-secondary)">{projectEnglish.empty}</p> : null}
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
                <p className="text-xs text-(--ui-text-secondary)">{projectEnglish.invalidBinding}: {record.reason}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  if (selected.status === 'invalid') {
    return <div className="p-4 text-sm">{projectEnglish.invalidBinding}: {selected.reason}</div>
  }

  if (!machine || machine.status !== 'available' || preflightError) {
    return (
      <div className="p-4 text-sm">
        {projectEnglish.unavailableMachine}
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
        activateWorkSurface(tab, selected.binding)
      }}
    />
  )
}
