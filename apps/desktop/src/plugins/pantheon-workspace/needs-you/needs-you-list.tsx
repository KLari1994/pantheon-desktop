import { ApprovalCard } from './approval-card'
import type { ApprovalChoice, ApprovalProjection } from './approval-projections'

export function NeedsYouList({
  cards,
  busyId,
  errors,
  onNavigate,
  onRespond,
  onMute
}: {
  cards: ApprovalProjection[]
  busyId?: string | null
  errors?: Record<string, string>
  onNavigate: (card: ApprovalProjection) => void
  onRespond: (card: ApprovalProjection, choice: ApprovalChoice) => void
  onMute: (scope: { kind: 'bot' | 'room'; id: string }) => void
}) {
  const unique = [...new Map(cards.map(card => [card.id, card])).values()]

  if (unique.length === 0) {
    return <p className="p-4 text-sm text-(--ui-text-secondary)">Nothing needs you</p>
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      {unique.map(card => (
        <div key={card.id}>
          <button className="mb-1 text-xs text-(--ui-text-tertiary)" onClick={() => onNavigate(card)} type="button">
            Open {card.agent} {card.context}
          </button>
          <ApprovalCard
            busy={busyId === card.id ? 'once' : null}
            card={card}
            error={errors?.[card.id]}
            onRespond={choice => onRespond(card, choice)}
          />
          <div className="mt-1 flex gap-2">
            <button onClick={() => onMute({ kind: 'bot', id: card.botId })} type="button">
              Mute notifications from {card.agent}
            </button>
            <button
              disabled={!card.roomId}
              onClick={() => {
                if (card.roomId) {
                  onMute({ kind: 'room', id: card.roomId })
                }
              }}
              type="button"
            >
              Mute notifications from {card.context}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
