export type ApprovalChoice = 'deny' | 'once' | 'session'

export interface ApprovalOwnerRoute {
  connectionId: string
  profile: string
  machine?: string
}

export interface ApprovalSource {
  requestId?: string
  sessionId: string | null
  command: string
  description: string
  choices?: string[]
}

export interface ApprovalProjection {
  id: string
  agent: string
  context: string
  action: string
  machine: string
  sessionId: string | null
  requestId?: string
  choices: ApprovalChoice[]
}

export interface ApprovalRespondInput {
  request: ApprovalSource
  choice: ApprovalChoice
  owner: ApprovalOwnerRoute
  inFlight: Set<string>
  currentRequest?: () => ApprovalSource | null
}

export interface ApprovalRespondDeps {
  requestOwned: (sessionId: string | null, method: string, params: Record<string, unknown>) => Promise<unknown>
  clear: (sessionId: string | null, requestId?: string) => void
}

export type ApprovalRespondResult =
  | { ok: true; settledId: string }
  | { ok: false; reason: 'in-flight' | 'stale'; error?: string; settledId?: undefined }
  | { ok: false; reason: 'failed'; error: string; settledId?: undefined }

const ALLOWED: ApprovalChoice[] = ['once', 'session', 'deny']

export function approvalLogicalId(request: ApprovalSource, owner?: ApprovalOwnerRoute): string {
  if (request.requestId) return `approval:${request.requestId}`
  const connectionId = owner?.connectionId || 'unknown'
  const profile = owner?.profile || 'unknown'
  return `approval-legacy:${connectionId}:${profile}:${request.sessionId || ''}`
}

export function projectApproval(
  request: ApprovalSource,
  identity: { agent: string; context: string; machine: string; owner?: ApprovalOwnerRoute }
): ApprovalProjection {
  const allowed = new Set(ALLOWED)
  const raw = request.choices?.filter((choice): choice is ApprovalChoice => allowed.has(choice as ApprovalChoice))
  return {
    id: approvalLogicalId(request, identity.owner),
    agent: identity.agent,
    context: identity.context,
    action: request.command,
    machine: identity.machine,
    sessionId: request.sessionId,
    requestId: request.requestId,
    choices: raw && raw.length > 0 ? raw : [...ALLOWED]
  }
}

export async function respondToApproval(
  input: ApprovalRespondInput,
  deps: ApprovalRespondDeps
): Promise<ApprovalRespondResult> {
  const id = approvalLogicalId(input.request, input.owner)
  if (input.inFlight.has(id)) return { ok: false, reason: 'in-flight' }
  input.inFlight.add(id)
  try {
    await deps.requestOwned(input.request.sessionId, 'approval.respond', {
      choice: input.choice,
      request_id: input.request.requestId,
      session_id: input.request.sessionId ?? undefined
    })
    const current = input.currentRequest?.()
    if (current && current.requestId && input.request.requestId && current.requestId !== input.request.requestId) {
      return { ok: false, reason: 'stale' }
    }
    deps.clear(input.request.sessionId, input.request.requestId)
    return { ok: true, settledId: id }
  } catch (error) {
    return { ok: false, reason: 'failed', error: error instanceof Error ? error.message : String(error) }
  } finally {
    input.inFlight.delete(id)
  }
}
