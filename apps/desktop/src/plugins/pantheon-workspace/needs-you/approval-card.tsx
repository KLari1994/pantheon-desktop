import type { ApprovalChoice, ApprovalProjection } from './approval-projections'

export function ApprovalCard({
  card,
  busy,
  error,
  onRespond
}: {
  card: ApprovalProjection
  busy?: ApprovalChoice | null
  error?: string | null
  onRespond: (choice: ApprovalChoice) => void
}) {
  const disabled = Boolean(busy)
  const statusLabel = error ? 'Needs retry' : busy ? 'Submitting' : 'Needs input'

  return (
    <article className="rounded-md border border-(--ui-stroke-tertiary) p-3" data-approval-id={card.id}>
      <div className="flex items-center gap-2 text-sm">
        <span aria-hidden="true">{error ? '!' : busy ? '…' : '●'}</span>
        <span className="font-medium">{card.agent}</span>
        <span className="text-(--ui-text-tertiary)">{card.context}</span>
        <span className="ms-auto text-xs text-(--ui-text-tertiary)">{card.machine}</span>
      </div>
      <p className="mt-1 text-sm">{card.action}</p>
      <p className="mt-1 text-xs text-(--ui-text-tertiary)" data-status={statusLabel}>
        {statusLabel}
      </p>
      {error ? <p className="mt-1 text-xs">{error}</p> : null}
      <div className="mt-2 flex flex-wrap gap-2">
        {card.choices.includes('once') ? (
          <button disabled={disabled} onClick={() => onRespond('once')} type="button">
            Allow once
          </button>
        ) : null}
        {card.choices.includes('session') ? (
          <button disabled={disabled} onClick={() => onRespond('session')} type="button">
            Allow for this session
          </button>
        ) : null}
        {card.choices.includes('deny') ? (
          <button disabled={disabled} onClick={() => onRespond('deny')} type="button">
            Deny
          </button>
        ) : null}
      </div>
    </article>
  )
}
