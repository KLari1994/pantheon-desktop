export interface RestoreMessageTarget {
  text: string
  userOrdinal: number | null
  approved?: boolean
  worktree?: string
  machine?: string
}
