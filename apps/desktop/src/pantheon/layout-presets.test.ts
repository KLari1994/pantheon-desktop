import { afterEach, describe, expect, it } from 'vitest'

import { registry } from '@/contrib/registry'

import {
  PANTHEON_LAYOUT_PRESET_IDS,
  applyPantheonLayoutReset,
  registerPantheonLayoutPresets,
  resetToPantheonDefaults,
  type PantheonLayoutPresetId
} from './layout-presets'

const registeredIds = (): string[] => registry.getArea('layouts').map(entry => entry.id)

let disposePresets: (() => void) | undefined

afterEach(() => {
  disposePresets?.()
  disposePresets = undefined
})

describe('Pantheon layout presets', () => {
  it('registers direct-chat, office, project, and PR-room on the existing layouts area', () => {
    const registered = registerPantheonLayoutPresets()
    disposePresets = registered.dispose

    expect(PANTHEON_LAYOUT_PRESET_IDS).toEqual(['direct-chat', 'office', 'project', 'pr-room'])
    expect(registeredIds()).toEqual(expect.arrayContaining([...PANTHEON_LAYOUT_PRESET_IDS]))
  })

  it('reset restores presets and navigation without deleting sessions or rooms', () => {
    const sessions = [{ id: 'sess-1' }, { id: 'sess-2' }]
    const rooms = [{ id: 'room-ops' }]
    const navigation = { hidden: ['files'], order: ['sessions', 'workspace'] }

    const result = resetToPantheonDefaults({
      sessions,
      rooms,
      navigation,
      activePresetId: 'custom'
    })

    expect(result.sessions).toEqual(sessions)
    expect(result.rooms).toEqual(rooms)
    expect(result.sessions).not.toBe(sessions)
    expect(result.rooms).not.toBe(rooms)
    expect(result.navigation).toEqual({ hidden: [], order: ['sessions', 'workspace'] })
    expect(result.activePresetId).toBe<PantheonLayoutPresetId>('direct-chat')
    expect(result.restoredPresetIds).toEqual([...PANTHEON_LAYOUT_PRESET_IDS])
  })

  it('product reset applies presets/navigation and does not delete sessions or rooms', () => {
    const sessions = [{ id: 'sess-keep' }, { id: 'sess-keep-2' }]
    const rooms = [{ id: 'room-keep' }]
    const applied = applyPantheonLayoutReset({
      sessions,
      rooms,
      navigation: { hidden: ['files'], order: ['sessions', 'workspace'] },
      activePresetId: 'custom'
    })

    expect(applied.sessions).toEqual(sessions)
    expect(applied.rooms).toEqual(rooms)
    expect(applied.navigation.hidden).toEqual([])
    expect(applied.activePresetId).toBe<PantheonLayoutPresetId>('direct-chat')
    expect(applied.restoredPresetIds).toEqual([...PANTHEON_LAYOUT_PRESET_IDS])
  })

  it('preset trees never carry per-room CSS', () => {
    const registered = registerPantheonLayoutPresets()
    disposePresets = registered.dispose
    const presets = registered.presets

    for (const preset of presets) {
      expect(JSON.stringify(preset.tree)).not.toMatch(/css|stylesheet|style=/i)
    }
  })
})
