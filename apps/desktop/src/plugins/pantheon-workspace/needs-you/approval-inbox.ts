import {
  type ApprovalChoice,
  type ApprovalProjection,
  type ApprovalRespondDeps,
  type ApprovalRespondResult,
  type ApprovalSource,
  respondToApproval,
  sharedApprovalInFlight
} from './approval-projections'

export interface ApprovalInboxRow {
  request: ApprovalSource
  card: ApprovalProjection
}

export class ApprovalInbox {
  private rows: ApprovalInboxRow[] = []
  // Home/Needs You copies share this set. The core inline approval.tsx path
  // keeps its own in-flight guard; that residual stays outside ticket files.
  private readonly inFlight = sharedApprovalInFlight
  private readonly listeners = new Set<() => void>()
  private currentBusyId: string | null = null
  private currentErrors: Record<string, string> = {}

  constructor(private readonly deps: ApprovalRespondDeps) {}

  listen(listener: () => void): () => void {
    this.listeners.add(listener)

    return () => this.listeners.delete(listener)
  }

  cards(): ApprovalProjection[] {
    return this.rows.map(row => row.card)
  }

  busyId(): string | null {
    return this.currentBusyId
  }

  errors(): Record<string, string> {
    return this.currentErrors
  }

  replace(rows: ApprovalInboxRow[]): void {
    const unique = new Map<string, ApprovalInboxRow>()

    for (const row of rows) {
      if (!unique.has(row.card.id)) {
        unique.set(row.card.id, row)
      }
    }

    this.rows = [...unique.values()]
    this.emit()
  }

  async respond(card: ApprovalProjection, choice: ApprovalChoice): Promise<ApprovalRespondResult> {
    const row = this.rows.find(item => item.card.id === card.id)

    if (!row) {
      return { ok: false, reason: 'failed', error: 'missing approval' }
    }
    this.currentBusyId = card.id
    this.emit()

    const result = await respondToApproval(
      {
        request: row.request,
        choice,
        owner: card.owner || { connectionId: 'unknown', profile: 'unknown' },
        inFlight: this.inFlight,
        currentRequest: () => this.rows.find(item => item.card.id === card.id)?.request ?? null
      },
      this.deps
    )

    this.currentBusyId = null

    if (result.ok) {
      this.rows = this.rows.filter(item => item.card.id !== card.id)
      const next = { ...this.currentErrors }
      delete next[card.id]
      this.currentErrors = next
    } else if (result.reason === 'failed' && result.error) {
      this.currentErrors = { ...this.currentErrors, [card.id]: result.error }
    }

    this.emit()

    return result
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }
}
