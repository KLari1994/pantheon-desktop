import type { HermesGitWorktree } from '@hermes/plugin-sdk'

import { validateLinearIssueUrl } from './pr-lifecycle'
import type {
  MachineTarget,
  PrLifecycleState,
  ProjectRoomBinding,
  ProjectRoomEvidence,
  ProjectRoomRecord
} from './types'

const LIFECYCLES: readonly PrLifecycleState[] = [
  'open',
  'working',
  'review-ready',
  'decision',
  'merged',
  'closed',
  'archived'
]

export interface JoinProject {
  id: string
  name: string
  primary_path?: null | string
}

export interface JoinRoom {
  id: string
  name?: string
}

export interface JoinTree {
  id: string
  path?: null | string
  repos?: Array<{ path?: null | string }>
}

export type WorktreePreflight = { ok: true } | { ok: false; reason: string }

function isNonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith('/')
}

function normalizePath(value: string): string {
  return value.replace(/\/+$/, '') || '/'
}

function asLifecycle(value: unknown): PrLifecycleState {
  return typeof value === 'string' && (LIFECYCLES as readonly string[]).includes(value)
    ? (value as PrLifecycleState)
    : 'open'
}

function parseMachine(value: unknown): MachineTarget | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const record = value as Record<string, unknown>

  if (
    !isNonEmpty(record.connectionId) ||
    !isNonEmpty(record.machineId) ||
    !isNonEmpty(record.profile) ||
    !isNonEmpty(record.label)
  ) {
    return null
  }

  return {
    connectionId: record.connectionId.trim(),
    machineId: record.machineId.trim(),
    profile: record.profile.trim(),
    label: record.label.trim()
  }
}

function parseEvidence(value: unknown): ProjectRoomEvidence | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  return value as ProjectRoomEvidence
}

export function parseBindingRecord(value: unknown): ProjectRoomRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { status: 'invalid', reason: 'not-object', record: value }
  }

  const record = value as Record<string, unknown>
  const machine = parseMachine(record.machine)

  if (
    !isNonEmpty(record.projectId) ||
    !isNonEmpty(record.buzzRoomId) ||
    !isNonEmpty(record.repoPath) ||
    !isNonEmpty(record.worktreePath) ||
    !isNonEmpty(record.targetBranch) ||
    !machine
  ) {
    return { status: 'invalid', reason: 'missing-fields', record: value }
  }

  if (!isAbsolutePath(record.repoPath.trim()) || !isAbsolutePath(record.worktreePath.trim())) {
    return { status: 'invalid', reason: 'relative-path', record: value }
  }

  if (record.baseBranch !== 'staging') {
    return { status: 'invalid', reason: 'non-staging-base', record: value }
  }

  if (record.linearUrl !== undefined && record.linearUrl !== null && record.linearUrl !== '') {
    if (typeof record.linearUrl !== 'string' || !validateLinearIssueUrl(record.linearUrl).ok) {
      return { status: 'invalid', reason: 'invalid-linear-url', record: value }
    }
  }

  const binding: ProjectRoomBinding = {
    projectId: record.projectId.trim(),
    projectName: isNonEmpty(record.projectName) ? record.projectName.trim() : undefined,
    buzzRoomId: record.buzzRoomId.trim(),
    repoPath: record.repoPath.trim(),
    worktreePath: record.worktreePath.trim(),
    targetBranch: record.targetBranch.trim(),
    baseBranch: 'staging',
    machine,
    artifactIds: Array.isArray(record.artifactIds)
      ? record.artifactIds.filter((id): id is string => isNonEmpty(id))
      : undefined,
    evidence: parseEvidence(record.evidence),
    linearUrl: isNonEmpty(record.linearUrl) ? record.linearUrl.trim() : undefined,
    previewUrl: isNonEmpty(record.previewUrl) ? record.previewUrl.trim() : undefined,
    lifecycle: asLifecycle(record.lifecycle)
  }

  return { status: 'valid', binding }
}

export function parseManifestBindings(manifest: unknown): ProjectRoomRecord[] {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return []
  }

  const raw = (manifest as Record<string, unknown>).projectBindings

  if (!Array.isArray(raw)) {
    return []
  }

  return raw.map(parseBindingRecord)
}

export function joinProjectRooms(input: {
  bindings: ProjectRoomBinding[]
  projects: JoinProject[]
  rooms: JoinRoom[]
  trees: JoinTree[]
}): ProjectRoomRecord[] {
  const seenRooms = new Set<string>()

  return input.bindings.map(binding => {
    if (seenRooms.has(binding.buzzRoomId)) {
      return { status: 'invalid', reason: 'duplicate-room', record: binding }
    }

    seenRooms.add(binding.buzzRoomId)

    const project = input.projects.find(item => item.id === binding.projectId)

    if (!project) {
      return { status: 'invalid', reason: 'mismatched-project', record: binding }
    }

    const room = input.rooms.find(item => item.id === binding.buzzRoomId)

    if (!room) {
      return { status: 'invalid', reason: 'missing-room', record: binding }
    }

    const tree = input.trees.find(item => item.id === binding.projectId)

    const repoPaths = [project.primary_path, tree?.path, ...(tree?.repos || []).map(repo => repo.path)]
      .filter((path): path is string => isNonEmpty(path))
      .map(normalizePath)

    if (!repoPaths.includes(normalizePath(binding.repoPath))) {
      return { status: 'invalid', reason: 'mismatched-repo', record: binding }
    }

    return {
      status: 'valid',
      binding: { ...binding, projectName: binding.projectName || project.name }
    }
  })
}

export function preflightWorktree(
  binding: ProjectRoomBinding,
  worktrees: readonly HermesGitWorktree[]
): WorktreePreflight {
  const wanted = normalizePath(binding.worktreePath)
  const match = worktrees.find(item => normalizePath(item.path) === wanted)

  if (!match) {
    return { ok: false, reason: 'unlisted' }
  }

  if (match.isMain) {
    return { ok: false, reason: 'canonical-checkout' }
  }

  if (match.detached) {
    return { ok: false, reason: 'detached' }
  }

  if ((match.branch || '').trim() !== binding.targetBranch) {
    return { ok: false, reason: 'wrong-branch' }
  }

  return { ok: true }
}

export class ProjectStore {
  private records: ProjectRoomRecord[] = []
  private foregroundId: string | null = null
  private generation = 0

  applyProjection(records: ProjectRoomRecord[]): void {
    this.records = records

    if (this.foregroundId && !this.records.some(record => this.recordId(record) === this.foregroundId)) {
      /* keep the last selected id so a transient refresh cannot steal focus */
    }
  }

  select(roomId: string): void {
    this.foregroundId = roomId
  }

  selectedId(): string | null {
    return this.foregroundId
  }

  selected(): ProjectRoomRecord | null {
    if (!this.foregroundId) {
      return null
    }

    return this.records.find(record => this.recordId(record) === this.foregroundId) || null
  }

  rooms(): ProjectRoomRecord[] {
    return this.records
  }

  async refresh(loader: () => Promise<ProjectRoomRecord[]>): Promise<void> {
    const token = ++this.generation
    const next = await loader()

    if (token !== this.generation) {
      return
    }

    this.applyProjection(next)
  }

  private recordId(record: ProjectRoomRecord): string | null {
    if (record.status === 'valid') {
      return record.binding.buzzRoomId
    }

    if (record.record && typeof record.record === 'object' && record.record !== null && 'buzzRoomId' in record.record) {
      const id = (record.record as { buzzRoomId?: unknown }).buzzRoomId

      return isNonEmpty(id) ? id : null
    }

    return null
  }
}
