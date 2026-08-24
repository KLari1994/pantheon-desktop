import {
  $artifactRegistry,
  createTerminal,
  desktopGit,
  findArtifact,
  openArtifact,
  openPreview,
  revealFileInTree
} from '@hermes/plugin-sdk'

import type { ProjectRoomBinding, PrRoomTab, ReadOnlyReviewSnapshot } from './types'

export interface ReadOnlyReviewGit {
  review?: {
    list?: (
      repoPath: string,
      scope: string,
      baseRef?: string
    ) => Promise<{ files?: Array<{ path: string }>; base?: null | string }>
    diff?: (...args: never[]) => Promise<string>
    stage?: (...args: never[]) => unknown
    unstage?: (...args: never[]) => unknown
    revert?: (...args: never[]) => unknown
    commit?: (...args: never[]) => unknown
    push?: (...args: never[]) => unknown
    createPr?: (...args: never[]) => unknown
  }
}

export interface WorkSurfaceHooks {
  openReview?: (cwd: string, target: string) => void
  git?: ReadOnlyReviewGit
}

export async function loadReadOnlyReview(
  binding: ProjectRoomBinding,
  git?: ReadOnlyReviewGit
): Promise<ReadOnlyReviewSnapshot> {
  const client =
    git ?? desktopGit({ connectionId: binding.machine.connectionId, profile: binding.machine.profile })
  const list = client?.review?.list

  if (!list) {
    throw new Error('git-unavailable')
  }

  const snapshot = await list(binding.worktreePath, 'branch', binding.baseBranch)

  return { files: snapshot.files ?? [], base: snapshot.base ?? null }
}

export function activateWorkSurface(tab: PrRoomTab, binding: ProjectRoomBinding, hooks?: WorkSurfaceHooks): void {
  if (tab === 'review' || tab === 'conversation' || tab === 'artifacts' || tab === 'merge-packet') {
    return
  }

  if (tab === 'preview') {
    openPreview({
      kind: 'url',
      label: binding.projectName || binding.buzzRoomId,
      source: binding.previewUrl || binding.worktreePath,
      url: binding.previewUrl || 'about:blank'
    })

    return
  }

  if (tab === 'files') {
    revealFileInTree(binding.worktreePath)

    return
  }

  if (tab === 'terminal') {
    createTerminal(binding.worktreePath)
  }
}

export function resolveBoundArtifacts(binding: ProjectRoomBinding) {
  const registry = $artifactRegistry.get()

  return (binding.artifactIds || []).map(id => ({
    id,
    record: findArtifact(registry, id)
  }))
}

export function openBoundArtifact(artifactId: string): boolean {
  const record = findArtifact($artifactRegistry.get(), artifactId)

  if (!record) {
    return false
  }

  openArtifact(artifactId)

  return true
}
