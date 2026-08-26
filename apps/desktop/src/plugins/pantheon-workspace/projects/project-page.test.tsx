import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, expect, test, vi } from 'vitest'

import { ProjectPage, type ProjectPageDeps } from './project-page'
import type { ProjectRoomBinding } from './types'

afterEach(() => cleanup())

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
  artifactIds: ['art-1'],
  evidence: { ci: { status: 'green' } },
  lifecycle: 'working'
}

const linked = {
  path: binding.worktreePath,
  branch: binding.targetBranch,
  detached: false,
  isMain: false,
  locked: false
}

const sources = [
  { connectionId: 'homelab', label: 'Homelab', kind: 'remote' as const, reachable: true, installId: 'install-aaa' }
]

const matchedRoute = {
  connectionId: 'homelab',
  machineId: 'install-aaa',
  profile: 'daedalus'
}

function renderPage(deps: Partial<ProjectPageDeps> & Pick<ProjectPageDeps, 'listWorktrees' | 'currentRoute'>) {
  const activate = deps.activate ?? vi.fn(async () => undefined)
  render(
    <ProjectPage
      deps={{
        loadBindings: deps.loadBindings ?? (async () => ({ records: [{ status: 'valid', binding }], sources })),
        activate,
        listWorktrees: deps.listWorktrees,
        currentRoute: deps.currentRoute,
        loadReview: deps.loadReview
      }}
    />
  )

  return { activate }
}

async function openProject() {
  await screen.findByRole('button', { name: 'Pantheon Desktop' })
  fireEvent.click(screen.getByRole('button', { name: 'Pantheon Desktop' }))
}

test('operational tabs stay blocked until worktree proof completes', async () => {
  let resolveWorktrees: ((worktrees: (typeof linked)[]) => void) | undefined

  const listWorktrees = vi.fn(
    () =>
      new Promise<(typeof linked)[]>(resolve => {
        resolveWorktrees = resolve
      })
  )

  renderPage({
    listWorktrees,
    currentRoute: () => matchedRoute
  })
  await openProject()

  await waitFor(() => expect(listWorktrees).toHaveBeenCalledTimes(1))
  expect(screen.queryByRole('tab', { name: 'Diff/Review' })).toBeNull()
  expect(screen.queryByRole('tab', { name: 'Preview' })).toBeNull()
  expect(screen.queryByRole('tab', { name: 'Terminal' })).toBeNull()

  resolveWorktrees?.([linked])

  expect(await screen.findByRole('tab', { name: 'Diff/Review' })).toBeTruthy()
})

test('route drift after verified preflight disables operational tabs without retargeting', async () => {
  const listWorktrees = vi.fn(async () => [linked])
  const activate = vi.fn(async () => undefined)

  function Harness() {
    const [route, setRoute] = useState(matchedRoute)

    return (
      <>
        <button
          onClick={() => setRoute({ connectionId: 'office', machineId: 'install-bbb', profile: 'other' })}
          type="button"
        >
          switch machine
        </button>
        <ProjectPage
          deps={{
            loadBindings: async () => ({ records: [{ status: 'valid', binding }], sources }),
            activate,
            listWorktrees,
            currentRoute: () => route
          }}
        />
      </>
    )
  }

  render(<Harness />)
  await openProject()
  expect(await screen.findByRole('tab', { name: 'Diff/Review' })).toBeTruthy()
  expect(activate).toHaveBeenCalledTimes(1)
  expect(listWorktrees).toHaveBeenCalledTimes(1)

  fireEvent.click(screen.getByRole('button', { name: 'switch machine' }))

  await waitFor(() => {
    expect(screen.queryByRole('tab', { name: 'Diff/Review' })).toBeNull()
  })
  expect(activate).toHaveBeenCalledTimes(1)
  expect(listWorktrees).toHaveBeenCalledTimes(1)
  expect(listWorktrees).toHaveBeenCalledWith(binding)
})

test('activating Diff/Review exposes no stage, revert, commit, push, or create-PR action', async () => {
  const loadReview = vi.fn(async () => ({
    files: [{ path: 'apps/desktop/src/plugins/pantheon-workspace/projects/project-page.tsx' }],
    base: 'staging'
  }))

  renderPage({
    listWorktrees: async () => [linked],
    currentRoute: () => matchedRoute,
    loadReview
  })
  await openProject()
  fireEvent.click(await screen.findByRole('tab', { name: 'Diff/Review' }))

  await waitFor(() => expect(loadReview).toHaveBeenCalledTimes(1))
  expect(screen.queryByRole('button', { name: /stage/i })).toBeNull()
  expect(screen.queryByRole('button', { name: /revert/i })).toBeNull()
  expect(screen.queryByRole('button', { name: /commit/i })).toBeNull()
  expect(screen.queryByRole('button', { name: /push/i })).toBeNull()
  expect(screen.queryByRole('button', { name: /create[- ]pr/i })).toBeNull()
  expect(screen.queryByRole('button', { name: /merge/i })).toBeNull()
})
