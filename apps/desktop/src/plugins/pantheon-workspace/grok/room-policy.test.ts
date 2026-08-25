import { expect, test } from 'vitest'

import {
  afterRemove,
  badgeForMessage,
  canAutoAdd,
  canInvite,
  canReceive,
  canSend,
  GROK_BOT_BADGE,
  GROK_EDITOR_FIELDS
} from './room-policy'

test('room access is invite-only', () => {
  expect(canInvite({ kind: 'office' })).toBe(true)
  expect(canSend({ invited: false, removed: false })).toBe(false)
  expect(canReceive({ invited: false, removed: false }, { roomId: 'office-1' })).toBe(false)
})

test('an invited member can send and receive only in that room', () => {
  const membership = { invited: true, removed: false, roomId: 'office-1' }

  expect(canSend(membership)).toBe(true)
  expect(canReceive(membership, { roomId: 'office-1' })).toBe(true)
  expect(canReceive(membership, { roomId: 'office-2' })).toBe(false)
})

test('removal drops the subscription and later room events stay silent', () => {
  const removed = afterRemove({ invited: true, removed: false, roomId: 'office-1' })

  expect(removed.invited).toBe(false)
  expect(removed.removed).toBe(true)
  expect(canSend(removed)).toBe(false)
  expect(canReceive(removed, { roomId: 'office-1' })).toBe(false)
})

test('Grok is never auto-added to PR or private rooms', () => {
  expect(canAutoAdd({ kind: 'pr' })).toBe(false)
  expect(canAutoAdd({ kind: 'private' })).toBe(false)
  expect(canInvite({ kind: 'pr' })).toBe(true)
  expect(canInvite({ kind: 'private' })).toBe(true)
})

test('every outbound message carries the Grok Bot badge', () => {
  expect(badgeForMessage({ text: 'hello' })).toEqual({ badge: GROK_BOT_BADGE })
  expect(GROK_BOT_BADGE).toBe('Grok Bot')
})

test('editor fields are limited to avatar, name, and permissions', () => {
  expect(GROK_EDITOR_FIELDS).toEqual(['avatar', 'name', 'permissions'])
  expect(GROK_EDITOR_FIELDS).not.toContain('prompt')
  expect(GROK_EDITOR_FIELDS).not.toContain('routine')
})
