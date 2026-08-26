import { expect, test, vi } from 'vitest'

import type { ProjectRoomBinding } from './types'
import { activateWorkSurface, loadReadOnlyReview } from './work-surfaces'

const binding: ProjectRoomBinding = {
  projectId: 'p_demo',
  projectName: 'Pantheon Desktop',
  buzzRoomId: 'room-pr-7',
  repoPath: '/opt/data/repos/pantheon-desktop',
  worktreePath: '/opt/data/worktrees/pantheon-desktop/PAN-7',
  targetBranch: 'feat/PAN-7-projects-pr-rooms',
  baseBranch: 'staging',
  machine: {
    connectionId: 'homelab',
    machineId: 'install-aaa',
    profile: 'daedalus',
    label: 'Homelab / daedalus'
  },
  lifecycle: 'working'
}

test('activating PAN-7 Review never opens the mutating review pane', async () => {
  const openReview = vi.fn()

  const git = {
    review: {
      list: vi.fn(async () => ({
        files: [{ path: 'a.ts', added: 1, removed: 0, status: 'M', staged: false }],
        base: 'staging'
      })),
      diff: vi.fn(async () => 'diff --git a/a.ts b/a.ts'),
      stage: vi.fn(),
      unstage: vi.fn(),
      revert: vi.fn(),
      commit: vi.fn(),
      push: vi.fn(),
      createPr: vi.fn()
    }
  }

  activateWorkSurface('review', binding, { openReview, git })
  const snapshot = await loadReadOnlyReview(binding, git)

  expect(openReview).not.toHaveBeenCalled()
  expect(git.review.list).toHaveBeenCalledWith(binding.worktreePath, 'branch', 'staging')
  expect(git.review.stage).not.toHaveBeenCalled()
  expect(git.review.unstage).not.toHaveBeenCalled()
  expect(git.review.revert).not.toHaveBeenCalled()
  expect(git.review.commit).not.toHaveBeenCalled()
  expect(git.review.push).not.toHaveBeenCalled()
  expect(git.review.createPr).not.toHaveBeenCalled()
  expect(snapshot.files.map(file => file.path)).toEqual(['a.ts'])
})
