import { Button, Textarea } from '@hermes/plugin-sdk'
import { useMemo, useState } from 'react'

import type { BuzzMember } from '@/pantheon/buzz-client'

import type { RoomMessage } from './types'

export function RoomComposer({
  members,
  disabled,
  failed,
  onSend,
  onRetry,
  onRemove
}: {
  members: BuzzMember[]
  disabled?: boolean
  failed?: RoomMessage | null
  onSend: (content: string, mentions: string[]) => void
  onRetry?: () => void
  onRemove?: () => void
}) {
  const [draft, setDraft] = useState('')
  const mention = useMemo(() => {
    const match = draft.match(/@(\w*)$/)
    if (!match) return []
    const prefix = match[1].toLowerCase()
    return members.filter(member => (member.name || member.pubkey).toLowerCase().includes(prefix))
  }, [draft, members])

  return (
    <div className="border-t border-(--ui-stroke-tertiary) p-3">
      {failed ? (
        <div className="mb-2 flex items-center gap-2 text-xs text-red-600">
          Send failed
          <Button type="button" onClick={onRetry}>Retry</Button>
          <Button type="button" onClick={onRemove}>Remove</Button>
        </div>
      ) : null}
      {mention.length ? (
        <ul className="mb-2 rounded-md border border-(--ui-stroke-tertiary) bg-(--ui-surface) text-sm">
          {mention.map(member => (
            <li key={member.pubkey}>@{member.name || member.pubkey}</li>
          ))}
        </ul>
      ) : null}
      <Textarea
        aria-label="Room message"
        disabled={disabled}
        value={draft}
        onChange={event => setDraft(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            if (!disabled && draft.trim()) {
              const mentions = [...draft.matchAll(/@(\w+)/g)].map(match => match[1])
              onSend(draft, mentions)
              setDraft('')
            }
          }
        }}
      />
    </div>
  )
}
