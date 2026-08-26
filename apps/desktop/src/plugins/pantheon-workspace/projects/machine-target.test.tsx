import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { MachineTargetBanner, observeMachineRoute, resolveMachineTarget, switchMachineTarget } from './machine-target'
import type { MachineTarget } from './types'

afterEach(() => cleanup())

const target: MachineTarget = {
  connectionId: 'homelab',
  machineId: 'install-aaa',
  profile: 'daedalus',
  label: 'Homelab / daedalus'
}

const source = (extra: Record<string, unknown> = {}) => ({
  connectionId: 'homelab',
  label: 'Homelab',
  kind: 'remote' as const,
  reachable: true,
  installId: 'install-aaa',
  ...extra
})

test('exact reachable connection and install ID is available and visibly labeled', () => {
  const resolved = resolveMachineTarget(target, [source()])
  expect(resolved).toEqual({ status: 'available', target, installId: 'install-aaa' })

  render(<MachineTargetBanner resolved={resolved} />)
  expect(screen.getByText('Homelab / daedalus')).toBeTruthy()
  expect(screen.getAllByText(/homelab/i).length).toBeGreaterThan(0)
  expect(screen.getByText(/install-aaa/)).toBeTruthy()
  expect(screen.getByText(/available/i)).toBeTruthy()
})

test('missing source, unreachable source, absent identity proof, and identity mismatch block', () => {
  expect(resolveMachineTarget(target, []).status).toBe('blocked')
  expect(resolveMachineTarget(target, [source({ reachable: false })]).status).toBe('blocked')
  expect(resolveMachineTarget(target, [source({ installId: undefined })]).status).toBe('blocked')
  expect(resolveMachineTarget(target, [source({ installId: 'other-machine' })]).status).toBe('blocked')
})

test('a blocked target performs no activation or git call', async () => {
  const activate = vi.fn()
  const git = { worktreeList: vi.fn() }
  const resolved = resolveMachineTarget(target, [source({ reachable: false })])

  await expect(switchMachineTarget(resolved, { activate, git })).rejects.toThrow(/blocked/)
  expect(activate).not.toHaveBeenCalled()
  expect(git.worktreeList).not.toHaveBeenCalled()
})

test('an explicit switch activates only the requested connection and profile', async () => {
  const activate = vi.fn(async () => undefined)
  const git = { worktreeList: vi.fn() }
  const resolved = resolveMachineTarget(target, [source()])

  await switchMachineTarget(resolved, { activate, git })
  expect(activate).toHaveBeenCalledTimes(1)
  expect(activate).toHaveBeenCalledWith({ connectionId: 'homelab', profile: 'daedalus' })
})

test('a later connection change blocks instead of retargeting', () => {
  expect(
    observeMachineRoute(target, { connectionId: 'homelab', machineId: 'install-aaa', profile: 'daedalus' }).status
  ).toBe('available')
  expect(
    observeMachineRoute(target, { connectionId: 'office', machineId: 'install-aaa', profile: 'daedalus' }).status
  ).toBe('blocked')
  expect(
    observeMachineRoute(target, { connectionId: 'homelab', machineId: 'install-bbb', profile: 'daedalus' }).status
  ).toBe('blocked')
  expect(
    observeMachineRoute(target, { connectionId: 'homelab', machineId: 'install-aaa', profile: 'other' }).status
  ).toBe('blocked')
})

test('machine label is textual and not color-only', () => {
  render(<MachineTargetBanner resolved={resolveMachineTarget(target, [source({ reachable: false })])} />)
  expect(screen.getByText(/unavailable|blocked/i)).toBeTruthy()
  expect(screen.getByLabelText(/machine target/i)).toBeTruthy()
  fireEvent.click(screen.getByLabelText(/machine target/i))
})
