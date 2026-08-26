export const GROK_BOT_BADGE = 'Grok Bot'

export const GROK_EDITOR_FIELDS = ['avatar', 'name', 'permissions'] as const

export type GrokRoomKind = 'office' | 'pr' | 'private' | string

export type GrokRoomMembership = {
  invited: boolean
  removed: boolean
  roomId?: string
}

export function canInvite(_room: { kind: GrokRoomKind }): boolean {
  return true
}

export function canAutoAdd(_room: { kind: GrokRoomKind }): boolean {
  return false
}

export function canSend(membership: GrokRoomMembership): boolean {
  return membership.invited && !membership.removed
}

export function canReceive(membership: GrokRoomMembership, event: { roomId?: string }): boolean {
  if (!membership.invited || membership.removed) {
    return false
  }

  if (membership.roomId && event.roomId && membership.roomId !== event.roomId) {
    return false
  }

  return Boolean(membership.roomId || event.roomId)
}

export function afterRemove(membership: GrokRoomMembership): GrokRoomMembership {
  return {
    ...membership,
    invited: false,
    removed: true
  }
}

export function badgeForMessage(_message: { text: string }): { badge: typeof GROK_BOT_BADGE } {
  return { badge: GROK_BOT_BADGE }
}
