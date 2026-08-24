/**
 * Quick Entry (renderer side) — the mini composer's own state, and the
 * primary window's bridge back into the real prompt-submit path.
 *
 * The quick window carries NO gateway connection: it hands its text to the main
 * process, which forwards it to the primary renderer, which sends it through the
 * SAME `submitText` the normal composer uses (see
 * app/contrib/hooks/use-quick-entry-bridge). There is no second submit path and
 * no new gateway RPC.
 *
 * The device-local preference (enabled + shortcut) is authoritative in the MAIN
 * process — it owns the OS registration and must restore it on a cold launch
 * without the renderer ever visiting Settings. This module treats what the
 * bridge returns as the truth and caches it for the settings UI, same authority
 * split as keep-awake.
 */

import { atom } from 'nanostores'

import {
  decideDestinationSend,
  destinationFromQuickTarget,
  isPantheonDestination,
  rememberDestination,
  restoreQuickTarget,
  ROOM_TARGET_PREFIX,
  applyDestinationSelection,
  type DestinationMemory,
  type PantheonDestination
} from '@/pantheon/destination'

export interface QuickEntryState {
  enabled: boolean
  /** null before the first read; the settings row shows a skeleton until then. */
  registered: boolean | null
  /** Why the OS shortcut isn't live: taken by another app, or unusable. */
  error: null | QuickEntryRegistrationError
  shortcut: string
}

export type QuickEntryRegistrationError = 'invalid' | 'taken'

export interface QuickEntryStatus {
  enabled: boolean
  error: null | QuickEntryRegistrationError
  registered: boolean
  shortcut: string
}

export const QUICK_ENTRY_DEFAULT_SHORTCUT = 'CommandOrControl+Shift+Space'

export const $quickEntry = atom<QuickEntryState>({
  enabled: true,
  error: null,
  registered: null,
  shortcut: QUICK_ENTRY_DEFAULT_SHORTCUT
})

function applyStatus(status: QuickEntryStatus | undefined): void {
  if (!status) {
    return
  }

  $quickEntry.set({
    enabled: status.enabled === true,
    error: status.error ?? null,
    registered: status.registered === true,
    shortcut: typeof status.shortcut === 'string' && status.shortcut ? status.shortcut : QUICK_ENTRY_DEFAULT_SHORTCUT
  })
}

/** True when the shell exposes the Quick Entry capability (desktop only). */
export function canUseQuickEntry(): boolean {
  return typeof window !== 'undefined' && typeof window.hermesDesktop?.quickEntry?.getSettings === 'function'
}

/** Read the live registration state into the store (Settings mount). */
export async function loadQuickEntrySettings(): Promise<void> {
  if (!canUseQuickEntry()) {
    return
  }

  try {
    applyStatus(await window.hermesDesktop.quickEntry.getSettings())
  } catch {
    // A failed read leaves the store as-is; the row keeps its last known copy.
  }
}

/**
 * Write a preference and adopt whatever the main process reports back — a
 * rejected shortcut or an already-taken chord comes back as an error state
 * instead of a silently-lost setting.
 */
export async function saveQuickEntrySettings(patch: { enabled?: boolean; shortcut?: string }): Promise<void> {
  if (!canUseQuickEntry()) {
    return
  }

  // Optimistic: paint the intent immediately, then let the authoritative reply
  // (which knows whether the OS accepted it) get the last word.
  const previous = $quickEntry.get()
  $quickEntry.set({ ...previous, ...patch, registered: previous.registered })

  try {
    applyStatus(await window.hermesDesktop.quickEntry.setSettings(patch))
  } catch {
    $quickEntry.set(previous)
  }
}

// ── Quick window submit state machine ───────────────────────────────────────

/** A recent session the quick window can target (pushed by the primary). */
export interface QuickEntrySessionOption {
  id: string
  title: string
}

export interface QuickEntryRoomOption {
  id: string
  title: string
}

/** Send into whatever chat the main window currently has in front. */
export const QUICK_TARGET_CURRENT = 'current'
/** Start a brand-new session for this prompt. */
export const QUICK_TARGET_NEW = 'new'

/**
 * The primary renderer's push into the quick window: is the gateway usable, and
 * which recent sessions can be targeted. The quick window has NO gateway of its
 * own, so this pushed copy is its only view of backend truth — it starts
 * disconnected (input disabled) until the first push proves otherwise.
 */
export interface QuickEntryStatePush {
  connected: boolean
  sessions: QuickEntrySessionOption[]
  rooms?: QuickEntryRoomOption[]
  bridgeHealthy?: boolean
  destinationMemory?: DestinationMemory
}

/** What a quick-window submit carries back to the primary renderer. */
export interface QuickEntrySubmitPayload {
  /** QUICK_TARGET_CURRENT, QUICK_TARGET_NEW, a stored session id, or room:<id>. */
  target: string
  text: string
  destination?: import('@/pantheon/destination').PantheonDestination
}

/**
 * The quick window's own composer state. Deliberately a tiny pure reducer: the
 * behavior that would actually break a user — an empty submit must not send but
 * must still not hide the window, a real submit clears the draft AND hides, a
 * double-fire while already submitting must not send twice, and a dead gateway
 * must disable sending entirely — is the part worth proving, and none of it
 * needs React or Electron.
 */
export interface QuickComposerState {
  /** Last pushed gateway truth. False (the initial value) disables submit. */
  connected: boolean
  draft: string
  /** Recent sessions the picker offers, pushed by the primary renderer. */
  sessions: QuickEntrySessionOption[]
  /** Recent rooms the picker offers. Empty until the primary pushes them. */
  rooms: QuickEntryRoomOption[]
  /** Buzz bridge health for room sends. Unknown/false fails closed at submit. */
  bridgeHealthy: boolean
  /** Ambient profile default — destination picks must never mutate this. */
  profileDefaultAgentId: string
  /** True between a send and the window actually hiding. Blocks a double-send. */
  submitting: boolean
  /** Where a submit lands: current / new / a stored session id / room:<id>. */
  target: string
  /** Last bot/room destinations restored into the picker when still offered. */
  destinationMemory: DestinationMemory
  /** Whether the window should be visible. False asks the shell to hide. */
  visible: boolean
}

export type QuickComposerEvent =
  | { type: 'blur' }
  | { type: 'dismiss' }
  | { type: 'edit'; draft: string }
  | { type: 'shown' }
  | {
      type: 'state'
      connected: boolean
      sessions: QuickEntrySessionOption[]
      rooms?: QuickEntryRoomOption[]
      bridgeHealthy?: boolean
      destinationMemory?: DestinationMemory
    }
  | { type: 'submit' }
  | { type: 'target'; target: string }

export interface QuickComposerTransition {
  /** Payload to send through the real prompt-submit path, or null for none. */
  send: null | QuickEntrySubmitPayload
  state: QuickComposerState
}

export const initialQuickComposerState: QuickComposerState = {
  // Disconnected until the primary renderer's first push proves otherwise — a
  // capture window that accepts text it can never deliver is a lie.
  connected: false,
  draft: '',
  sessions: [],
  rooms: [],
  bridgeHealthy: false,
  profileDefaultAgentId: 'default',
  submitting: false,
  target: QUICK_TARGET_CURRENT,
  destinationMemory: {},
  visible: true
}

function targetStillOffered(state: QuickComposerState, sessions: QuickEntrySessionOption[], rooms: QuickEntryRoomOption[]): boolean {
  if (state.target === QUICK_TARGET_CURRENT || state.target === QUICK_TARGET_NEW) {
    return true
  }

  if (state.target.startsWith(ROOM_TARGET_PREFIX)) {
    const roomId = state.target.slice(ROOM_TARGET_PREFIX.length)

    return rooms.some(room => room.id === roomId)
  }

  return sessions.some(session => session.id === state.target)
}

function destinationToRemember(destination: PantheonDestination): PantheonDestination | null {
  if (destination.kind === 'room' || destination.kind === 'bot') {
    return destination
  }

  if (
    destination.kind === 'session' &&
    destination.storedSessionId !== QUICK_TARGET_CURRENT &&
    destination.storedSessionId !== QUICK_TARGET_NEW
  ) {
    return { kind: 'bot', storedSessionId: destination.storedSessionId, agentId: destination.agentId }
  }

  return null
}

function withRestoredTarget(
  state: QuickComposerState,
  memory: DestinationMemory,
  sessions: QuickEntrySessionOption[],
  rooms: QuickEntryRoomOption[]
): string {
  return restoreQuickTarget(memory, { sessions, rooms }) ?? QUICK_TARGET_CURRENT
}

export function quickComposerReducer(state: QuickComposerState, event: QuickComposerEvent): QuickComposerTransition {
  switch (event.type) {
    case 'blur':
    case 'dismiss': {
      // Escape / focus loss discards without sending. A dismiss mid-submit still
      // hides — the send already left for the main process.
      return {
        send: null,
        state: { ...state, draft: '', submitting: false, target: QUICK_TARGET_CURRENT, visible: false }
      }
    }

    case 'edit': {
      return { send: null, state: { ...state, draft: event.draft } }
    }

    case 'shown': {
      // Re-summoned: a fresh draft every time, but restore last bot/room when
      // the picker still offers it. Pushed gateway truth carries over.
      return {
        send: null,
        state: {
          ...state,
          draft: '',
          submitting: false,
          target: withRestoredTarget(state, state.destinationMemory, state.sessions, state.rooms),
          visible: true
        }
      }
    }

    case 'state': {
      // Adopt the pushed truth. A selected session/room that no longer exists
      // in the pushed lists must not silently swallow the prompt — fall back.
      const rooms = event.rooms ?? state.rooms
      const destinationMemory = event.destinationMemory ?? state.destinationMemory
      const targetStillValid = event.connected && targetStillOffered(state, event.sessions, rooms)
      const target = targetStillValid
        ? state.target
        : withRestoredTarget(state, destinationMemory, event.sessions, rooms)

      return {
        send: null,
        state: {
          ...state,
          connected: event.connected,
          sessions: event.sessions,
          rooms,
          bridgeHealthy: event.bridgeHealthy ?? state.bridgeHealthy,
          destinationMemory,
          target
        }
      }
    }

    case 'submit': {
      const text = state.draft.trim()

      // Nothing to send — or nowhere to send it (gateway down): stay open and
      // keep the draft so a stray Enter can't make the text vanish.
      if (!text || state.submitting || !state.connected) {
        return { send: null, state }
      }

      const destination = destinationFromQuickTarget(state.target, {
        currentSessionId: QUICK_TARGET_CURRENT,
        currentAgentId: state.profileDefaultAgentId
      })

      if (destination) {
        const decision = decideDestinationSend(destination, { bridgeHealthy: state.bridgeHealthy })

        if (!decision.allowed) {
          return { send: null, state }
        }

        const remembered = destinationToRemember(decision.destination)
        const destinationMemory = remembered
          ? rememberDestination(state.destinationMemory, remembered)
          : state.destinationMemory
        const send: QuickEntrySubmitPayload =
          decision.channel === 'buzz' || remembered
            ? { target: state.target, text, destination: remembered ?? decision.destination }
            : { target: state.target, text }

        return {
          send,
          state: { ...state, draft: '', submitting: true, destinationMemory, visible: false }
        }
      }

      return {
        send: { target: state.target, text },
        state: { ...state, draft: '', submitting: true, visible: false }
      }
    }

    case 'target': {
      const selected = destinationFromQuickTarget(event.target, {
        currentSessionId: QUICK_TARGET_CURRENT,
        currentAgentId: state.profileDefaultAgentId
      })
      const ambient = selected
        ? applyDestinationSelection(selected, { profileDefaultAgentId: state.profileDefaultAgentId })
        : { profileDefaultAgentId: state.profileDefaultAgentId }

      return {
        send: null,
        state: { ...state, target: event.target, profileDefaultAgentId: ambient.profileDefaultAgentId }
      }
    }

    default: {
      return { send: null, state }
    }
  }
}

// ── Primary-renderer bridge ────────────────────────────────────────────────

let submitHandler: ((payload: QuickEntrySubmitPayload) => void) | null = null
let unsubscribeSubmit: (() => void) | null = null
let destinationMemory: DestinationMemory = {}

export function getQuickEntryDestinationMemory(): DestinationMemory {
  return destinationMemory
}

export function rememberQuickEntryDestination(destination: PantheonDestination): DestinationMemory {
  destinationMemory = rememberDestination(destinationMemory, destination)

  return destinationMemory
}

export function resetQuickEntryDestinationMemory(): void {
  destinationMemory = {}
}

/**
 * Register the handler that turns a quick-window submit into a real send. The
 * primary window routes it by target: current chat → `submitText`, a stored
 * session id → resume + submit, new → fresh draft + submit.
 */
export function setQuickEntrySubmitHandler(fn: ((payload: QuickEntrySubmitPayload) => void) | null): void {
  submitHandler = fn
}

function normalizeSubmitPayload(raw: unknown): null | QuickEntrySubmitPayload {
  // Tolerate the v1 bare-string wire shape (an older quick window after a
  // partial update) by treating it as "send to the current chat".
  if (typeof raw === 'string') {
    return raw.trim() ? { target: QUICK_TARGET_CURRENT, text: raw } : null
  }

  if (!raw || typeof raw !== 'object') {
    return null
  }

  const record = raw as Record<string, unknown>
  const text = typeof record.text === 'string' ? record.text : ''

  if (!text.trim()) {
    return null
  }

  return {
    target: typeof record.target === 'string' && record.target ? record.target : QUICK_TARGET_CURRENT,
    text,
    ...(isPantheonDestination(record.destination) ? { destination: record.destination } : {})
  }
}

/**
 * Wire the quick-window → primary-renderer submit channel once. Returns a
 * disposer. Idempotent — a second call while wired is a no-op.
 */
export function initQuickEntryBridge(): () => void {
  const api = typeof window === 'undefined' ? undefined : window.hermesDesktop?.quickEntry

  if (!api?.onSubmit || unsubscribeSubmit) {
    return () => {}
  }

  unsubscribeSubmit = api.onSubmit(raw => {
    const payload = normalizeSubmitPayload(raw)

    if (payload) {
      if (payload.destination) {
        rememberQuickEntryDestination(payload.destination)
      }

      submitHandler?.(payload)
    }
  })

  return () => {
    unsubscribeSubmit?.()
    unsubscribeSubmit = null
  }
}
