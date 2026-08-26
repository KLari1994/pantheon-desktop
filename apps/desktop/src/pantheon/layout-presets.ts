/**
 * Pantheon layout presets — registered on the existing pane-shell layouts
 * contribution area. Reset restores presets/navigation only; sessions and rooms
 * stay put. No per-room CSS.
 */

import { group, type LayoutNode, split } from '@/components/pane-shell/tree/model'
import { applyLayoutPreset, LAYOUTS_AREA } from '@/components/pane-shell/tree/presets'
import { $activePresetId, $hiddenStripTabs, setStripTabHidden } from '@/components/pane-shell/tree/store'
import { registry } from '@/contrib/registry'
import { $sessions } from '@/store/session'

export const PANTHEON_LAYOUT_PRESET_IDS = ['direct-chat', 'office', 'project', 'pr-room'] as const

export type PantheonLayoutPresetId = (typeof PANTHEON_LAYOUT_PRESET_IDS)[number]

export interface PantheonLayoutPreset {
  id: PantheonLayoutPresetId
  title: string
  tree: LayoutNode
}

const DIRECT_CHAT = split(
  'row',
  [group(['sessions'], { id: 'pantheon-direct-sessions' }), group(['workspace'], { id: 'pantheon-direct-main' })],
  [1, 4]
)

const OFFICE = split(
  'row',
  [
    group(['sessions'], { id: 'pantheon-office-nav' }),
    group(['workspace'], { id: 'pantheon-office-main' }),
    group(['files'], { id: 'pantheon-office-files' })
  ],
  [1, 3.2, 1.2]
)

const PROJECT = split(
  'row',
  [
    group(['sessions'], { id: 'pantheon-project-nav' }),
    split(
      'column',
      [group(['workspace'], { id: 'pantheon-project-main' }), group(['terminal'], { id: 'pantheon-project-terminal' })],
      [3, 1]
    ),
    group(['files', 'review'], { id: 'pantheon-project-tools' })
  ],
  [1, 3.2, 1.2]
)

const PR_ROOM = split(
  'row',
  [
    group(['sessions'], { id: 'pantheon-pr-nav' }),
    group(['workspace'], { id: 'pantheon-pr-main' }),
    split(
      'column',
      [group(['review'], { id: 'pantheon-pr-review' }), group(['files'], { id: 'pantheon-pr-files' })],
      [1.4, 1]
    )
  ],
  [1, 3, 1.4]
)

export const PANTHEON_LAYOUT_PRESETS: readonly PantheonLayoutPreset[] = [
  { id: 'direct-chat', title: 'Direct chat', tree: DIRECT_CHAT },
  { id: 'office', title: 'Office', tree: OFFICE },
  { id: 'project', title: 'Project', tree: PROJECT },
  { id: 'pr-room', title: 'PR room', tree: PR_ROOM }
]

let disposeRegistered: (() => void) | null = null

export function registerPantheonLayoutPresets(): { presets: readonly PantheonLayoutPreset[]; dispose: () => void } {
  disposeRegistered?.()
  disposeRegistered = registry.registerMany(
    PANTHEON_LAYOUT_PRESETS.map((preset, order) => ({
      id: preset.id,
      area: LAYOUTS_AREA,
      source: 'plugin' as const,
      title: preset.title,
      order: 40 + order,
      data: preset.tree
    }))
  )

  return {
    presets: PANTHEON_LAYOUT_PRESETS,
    dispose: () => {
      disposeRegistered?.()
      disposeRegistered = null
    }
  }
}

export interface PantheonResetInput<Session, Room> {
  sessions: readonly Session[]
  rooms: readonly Room[]
  navigation: { hidden: readonly string[]; order: readonly string[] }
  activePresetId: string
}

export interface PantheonResetResult<Session, Room> {
  sessions: Session[]
  rooms: Room[]
  navigation: { hidden: string[]; order: readonly string[] }
  activePresetId: PantheonLayoutPresetId
  restoredPresetIds: readonly PantheonLayoutPresetId[]
}

/** Restore presets/navigation only. Sessions and rooms are copied, never deleted. */
export function resetToPantheonDefaults<Session, Room>(
  input: PantheonResetInput<Session, Room>
): PantheonResetResult<Session, Room> {
  registerPantheonLayoutPresets()

  return {
    sessions: [...input.sessions],
    rooms: [...input.rooms],
    navigation: { hidden: [], order: input.navigation.order },
    activePresetId: 'direct-chat',
    restoredPresetIds: [...PANTHEON_LAYOUT_PRESET_IDS]
  }
}

/** Product entry: apply reset to presets/navigation only. Sessions/rooms stay. */
export function applyPantheonLayoutReset<Session = unknown, Room = unknown>(
  input?: Partial<PantheonResetInput<Session, Room>>
): PantheonResetResult<Session, Room> {
  const sessions = (input?.sessions ?? ($sessions.get() as Session[])) as Session[]
  const rooms = (input?.rooms ?? []) as Room[]
  const hidden = input?.navigation?.hidden ?? [...$hiddenStripTabs.get()]
  const order = input?.navigation?.order ?? []

  const result = resetToPantheonDefaults({
    sessions,
    rooms,
    navigation: { hidden, order },
    activePresetId: input?.activePresetId ?? $activePresetId.get()
  })

  const preset = PANTHEON_LAYOUT_PRESETS.find(entry => entry.id === result.activePresetId)

  if (preset) {
    applyLayoutPreset(preset.id, preset.tree)
  }

  for (const paneId of [...$hiddenStripTabs.get()]) {
    setStripTabHidden(paneId, false)
  }

  return result
}
