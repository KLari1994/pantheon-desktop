import { Button, type BuzzAttachment, type BuzzMember, canDictate, Textarea } from '@hermes/plugin-sdk'
import { useMemo, useState } from 'react'

import type { RoomMessage } from './types'

export interface ComposerExtras {
  threadRootId?: string
  attachments?: BuzzAttachment[]
}

export function RoomComposer({
  members,
  disabled,
  failed,
  threadRootId,
  onSend,
  onRetry,
  onRemove,
  onDictate
}: {
  members: BuzzMember[]
  disabled?: boolean
  failed?: RoomMessage | null
  threadRootId?: string | null
  onSend: (content: string, mentions: string[], extras?: ComposerExtras) => void
  onRetry?: () => void
  onRemove?: () => void
  onDictate?: () => void
}) {
  const [draft, setDraft] = useState('')
  const [attachmentUrl, setAttachmentUrl] = useState('')
  const [attachmentMime, setAttachmentMime] = useState('application/octet-stream')
  const [attachmentName, setAttachmentName] = useState('')

  const mention = useMemo(() => {
    const match = draft.match(/@(\w*)$/)

    if (!match) {
      return []
    }
    const prefix = match[1].toLowerCase()

    return members.filter(member => (member.name || member.pubkey).toLowerCase().includes(prefix))
  }, [draft, members])

  const attachments = (): BuzzAttachment[] | undefined => {
    if (!attachmentUrl.trim()) {
      return undefined
    }

    return [
      {
        url: attachmentUrl.trim(),
        mimeType: attachmentMime.trim() || 'application/octet-stream',
        name: attachmentName.trim() || undefined
      }
    ]
  }

  return (
    <div className="border-t border-(--ui-stroke-tertiary) p-3">
      {failed ? (
        <div className="mb-2 flex items-center gap-2 text-xs text-red-600">
          Send failed
          <Button onClick={onRetry} type="button">
            Retry
          </Button>
          <Button onClick={onRemove} type="button">
            Remove
          </Button>
        </div>
      ) : null}
      {threadRootId ? <div className="mb-2 text-xs text-(--ui-text-tertiary)">Replying in thread</div> : null}
      {mention.length ? (
        <ul className="mb-2 rounded-md border border-(--ui-stroke-tertiary) bg-(--ui-surface) text-sm">
          {mention.map(member => (
            <li key={member.pubkey}>@{member.name || member.pubkey}</li>
          ))}
        </ul>
      ) : null}
      <div className="mb-2 grid grid-cols-3 gap-2">
        <input
          aria-label="Attachment URL"
          className="rounded-md border border-(--ui-stroke-tertiary) bg-transparent px-2 py-1 text-xs"
          onChange={event => setAttachmentUrl(event.target.value)}
          placeholder="https://…"
          value={attachmentUrl}
        />
        <input
          aria-label="Attachment MIME type"
          className="rounded-md border border-(--ui-stroke-tertiary) bg-transparent px-2 py-1 text-xs"
          onChange={event => setAttachmentMime(event.target.value)}
          placeholder="image/png"
          value={attachmentMime}
        />
        <input
          aria-label="Attachment name"
          className="rounded-md border border-(--ui-stroke-tertiary) bg-transparent px-2 py-1 text-xs"
          onChange={event => setAttachmentName(event.target.value)}
          placeholder="name"
          value={attachmentName}
        />
      </div>
      <Textarea
        aria-label="Room message"
        disabled={disabled}
        onChange={event => setDraft(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()

            if (!disabled && draft.trim()) {
              const mentions = [...draft.matchAll(/@(\w+)/g)].map(match => match[1])
              onSend(draft, mentions, {
                threadRootId: threadRootId || undefined,
                attachments: attachments()
              })
              setDraft('')
              setAttachmentUrl('')
              setAttachmentName('')
            }
          }
        }}
        value={draft}
      />
      {canDictate('room-composer') ? (
        <Button aria-label="Dictate" disabled={disabled} onClick={onDictate} type="button">
          Dictate
        </Button>
      ) : null}
    </div>
  )
}
