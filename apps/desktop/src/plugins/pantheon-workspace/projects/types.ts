export type PrLifecycleState = 'open' | 'working' | 'review-ready' | 'decision' | 'merged' | 'closed' | 'archived'

export interface MachineTarget {
  connectionId: string
  machineId: string
  profile: string
  label: string
}

export interface ReviewEvidence {
  reviewer: string
  decision: string
  summary?: string
}

export interface CiEvidence {
  status: string
  summary?: string
}

export interface DecisionEvidence {
  source: 'human' | 'talos'
  actor: string
  verdict: 'approve' | 'reject'
  summary?: string
}

export interface ProjectRoomEvidence {
  ci?: CiEvidence
  reviews?: ReviewEvidence[]
  decision?: DecisionEvidence
}

export interface ProjectRoomBinding {
  projectId: string
  projectName?: string
  buzzRoomId: string
  repoPath: string
  worktreePath: string
  targetBranch: string
  baseBranch: 'staging' | string
  machine: MachineTarget
  artifactIds?: string[]
  evidence?: ProjectRoomEvidence
  linearUrl?: string
  previewUrl?: string
  lifecycle: PrLifecycleState
}

export interface ProjectProjection {
  projectId: string
  name: string
  repoPath: string
  rooms: ProjectRoomRecord[]
}

export type ProjectRoomRecord =
  | { status: 'valid'; binding: ProjectRoomBinding }
  | { status: 'invalid'; reason: string; record: unknown }

export type MergeAuthority =
  | { granted: false; reason: string }
  | {
      granted: true
      source: DecisionEvidence['source']
      actor: string
      verdict: DecisionEvidence['verdict']
      summary?: string
    }

export type MachineAvailability =
  | { status: 'available'; target: MachineTarget; installId?: string }
  | { status: 'blocked'; reason: string; target?: MachineTarget }

export type WorktreeProof = 'checking' | 'verified' | 'blocked'

export interface ReadOnlyReviewSnapshot {
  files: Array<{ path: string }>
  base?: null | string
}

export interface LiveMachineRoute {
  connectionId?: string
  machineId?: string
  profile?: string
}

export interface GitRouteTarget {
  connectionId: string
  profile: string
}

export const REQUIRED_PR_ROOM_TABS = [
  'conversation',
  'review',
  'preview',
  'files',
  'terminal',
  'artifacts',
  'merge-packet'
] as const

export type PrRoomTab = (typeof REQUIRED_PR_ROOM_TABS)[number]
