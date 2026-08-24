import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { resolveMachineTarget } from './machine-target'
import { PrRoom } from './pr-room'
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
  evidence: {
    ci: { status: 'green', summary: 'all checks passed' },
    reviews: [{ reviewer: 'fable', decision: 'PASS' }]
  },
  linearUrl: 'https://linear.app/syntropickelc/issue/PAN-7/task-7',
  lifecycle: 'review-ready'
}

const available = resolveMachineTarget(binding.machine, [
  { connectionId: 'homelab', label: 'Homelab', kind: 'remote', reachable: true, installId: 'install-aaa' }
])

const blocked = resolveMachineTarget(binding.machine, [
  { connectionId: 'homelab', label: 'Homelab', kind: 'remote', reachable: false, installId: 'install-aaa' }
])

const tabs = ['Conversation', 'Diff/Review', 'Preview', 'Files', 'Terminal', 'Artifacts', 'Merge Packet']

function renderRoom(
  machine = available,
  extras: { onActivate?: (tab: string) => void; conversation?: React.ReactNode } = {}
) {
  return render(
    <PrRoom
      binding={binding}
      conversation={extras.conversation ?? <div data-testid="conversation">room {binding.buzzRoomId}</div>}
      machine={machine}
      onActivateTab={extras.onActivate}
    />
  )
}

test('renders all seven required tabs', () => {
  renderRoom()
  for (const tab of tabs) {
    expect(screen.getByRole('tab', { name: tab })).toBeTruthy()
  }
})

test('every tab exposes the same project, room, worktree, branch, and machine identity', () => {
  renderRoom()
  for (const tab of tabs) {
    fireEvent.click(screen.getByRole('tab', { name: tab }))
    expect(screen.getAllByText('Pantheon Desktop').length).toBeGreaterThan(0)
    expect(screen.getAllByText('room-pr-7').length).toBeGreaterThan(0)
    expect(screen.getAllByText('/opt/data/worktrees/pantheon-desktop/PAN-7').length).toBeGreaterThan(0)
    expect(screen.getAllByText('feat/PAN-7-projects-pr-rooms').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Homelab / daedalus').length).toBeGreaterThan(0)
  }
})

test('Conversation receives the bound Buzz room ID', () => {
  renderRoom()
  fireEvent.click(screen.getByRole('tab', { name: 'Conversation' }))
  expect(screen.getByTestId('conversation').textContent).toContain('room-pr-7')
})

test('blocked machine disables all operational surfaces', () => {
  const onActivate = vi.fn()
  renderRoom(blocked, { onActivate })
  for (const tab of ['Diff/Review', 'Preview', 'Files', 'Terminal', 'Artifacts']) {
    expect((screen.getByRole('tab', { name: tab }) as HTMLButtonElement).disabled).toBe(true)
  }
  fireEvent.click(screen.getByRole('tab', { name: 'Preview' }))
  expect(onActivate).not.toHaveBeenCalled()
})

test('tabs do not open panes before user activation', () => {
  const onActivate = vi.fn()
  renderRoom(available, { onActivate })
  expect(onActivate).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('tab', { name: 'Terminal' }))
  expect(onActivate).toHaveBeenCalledWith('terminal')
})

test('Merge Packet has no merge action', () => {
  renderRoom()
  fireEvent.click(screen.getByRole('tab', { name: 'Merge Packet' }))
  expect(screen.queryByRole('button', { name: /merge/i })).toBeNull()
  expect(screen.getByText(/no merge authority/i)).toBeTruthy()
})

test('machine label is textual and accessible', () => {
  renderRoom()
  expect(screen.getByLabelText(/machine target/i)).toBeTruthy()
  expect(screen.getByText('Homelab / daedalus')).toBeTruthy()
  expect(screen.getByText(/available/i)).toBeTruthy()
})
