import {
  $artifactRegistry,
  createTerminal,
  findArtifact,
  openArtifact,
  openPreview,
  openReview,
  revealFileInTree
} from '@hermes/plugin-sdk'

import type { ProjectRoomBinding, PrRoomTab } from './types'

export function activateWorkSurface(tab: PrRoomTab, binding: ProjectRoomBinding): void {
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

    return
  }

  if (tab === 'review') {
    openReview(binding.worktreePath, binding.targetBranch)
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
