export type PantheonUpdateBlocker =
  | 'status-unavailable'
  | 'active-agent'
  | 'streaming-session'
  | 'active-terminal-process'
  | 'computer-use-active'
  | 'unsaved-draft'
  | 'bridge-unhealthy'

export interface PantheonUpdateDecision {
  allowed: boolean
  blockers: PantheonUpdateBlocker[]
}

export type PantheonActivitySignal = boolean | 'unknown'

export interface PantheonActivitySnapshot {
  activeAgentCount: number | 'unknown'
  streamingSession: PantheonActivitySignal
  activeTerminalProcess: PantheonActivitySignal
  computerUseActive: PantheonActivitySignal
  unsavedDraft: PantheonActivitySignal
  bridgeHealthy: PantheonActivitySignal
}

export function decidePantheonUpdate(snapshot: PantheonActivitySnapshot): PantheonUpdateDecision {
  const blockers: PantheonUpdateBlocker[] = []
  const unknown =
    snapshot.activeAgentCount === 'unknown' ||
    snapshot.streamingSession === 'unknown' ||
    snapshot.activeTerminalProcess === 'unknown' ||
    snapshot.computerUseActive === 'unknown' ||
    snapshot.unsavedDraft === 'unknown' ||
    snapshot.bridgeHealthy === 'unknown'

  if (unknown) {
    blockers.push('status-unavailable')
  }

  if (typeof snapshot.activeAgentCount === 'number' && snapshot.activeAgentCount > 0) {
    blockers.push('active-agent')
  }

  if (snapshot.streamingSession === true) {
    blockers.push('streaming-session')
  }

  if (snapshot.activeTerminalProcess === true) {
    blockers.push('active-terminal-process')
  }

  if (snapshot.computerUseActive === true) {
    blockers.push('computer-use-active')
  }

  if (snapshot.unsavedDraft === true) {
    blockers.push('unsaved-draft')
  }

  if (snapshot.bridgeHealthy === false) {
    blockers.push('bridge-unhealthy')
  }

  return { allowed: blockers.length === 0, blockers }
}
