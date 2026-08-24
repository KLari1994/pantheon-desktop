import { Button, ScrollArea } from '@hermes/plugin-sdk'
import { useMemo, useState } from 'react'

import type { BuzzReaction, BuzzRoom } from '@/pantheon/buzz-client'

import { type ComposerExtras, RoomComposer } from './room-composer'
import { RoomDiagnostics, type RoomDiagnosticRow } from './room-diagnostics'
import type { RoomMessage } from './types'

export function RoomWorkspace({
  room,
  messages,
  reactions = [],
  canvas,
  relayOpen,
  hasCredential,
  failed,
  diagnostics,
  onSend,
  onRetry,
  onRemove,
  onReact,
  onRemoveReaction,
  onInvite,
  onKick,
  onShowEarlier
}: {
  room: BuzzRoom
  messages: RoomMessage[]
  reactions?: BuzzReaction[]
  canvas?: string | null
  relayOpen?: boolean
  hasCredential?: boolean
  failed?: RoomMessage | null
  diagnostics?: RoomDiagnosticRow[]
  onSend: (content: string, mentions: string[], extras?: ComposerExtras) => void
  onRetry?: () => void
  onRemove?: () => void
  onReact?: (targetEventId: string, emoji: string) => void
  onRemoveReaction?: (reactionEventId: string) => void
  onInvite?: (pubkey: string) => void
  onKick?: (pubkey: string) => void
  onShowEarlier?: () => void
}) {
  const [threadRoot, setThreadRoot] = useState<string | null>(null)
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [tab, setTab] = useState<'chat' | 'canvas'>('chat')
  const [invitee, setInvitee] = useState('')
  const canModerate = room.selfRole === 'owner' || room.selfRole === 'admin'
  const visible = useMemo(
    () => (threadRoot ? messages.filter(message => message.threadRootId === threadRoot || message.id === threadRoot) : messages),
    [messages, threadRoot]
  )

  return (
    <section className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-(--ui-stroke-tertiary) px-4 py-3">
        <div>
          <h1 className="text-base font-medium">{room.name}</h1>
          <p className="text-xs text-(--ui-text-tertiary)">
            {room.kind || 'office'}
            {room.expiresAt ? ` · expires ${room.expiresAt}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" onClick={() => setTab('chat')}>Chat</Button>
          <Button type="button" onClick={() => setTab('canvas')}>Canvas</Button>
          <Button type="button" onClick={() => setShowDiagnostics(value => !value)}>Diagnostics</Button>
        </div>
      </header>
      {tab === 'canvas' ? (
        <div className="flex-1 p-4 text-sm text-(--ui-text-secondary)">{canvas || 'No canvas metadata'}</div>
      ) : (
        <>
          <div className="flex min-h-0 flex-1">
            <ScrollArea className="min-h-0 flex-1 p-3">
              <Button type="button" onClick={onShowEarlier}>Show earlier</Button>
              <ol className="mt-3 space-y-2">
                {visible.map(message => (
                  <li key={message.id} className="rounded-md bg-(--ui-surface) px-3 py-2 text-sm">
                    <div className="text-xs text-(--ui-text-tertiary)">{message.author}</div>
                    <div>{message.content}</div>
                    {message.attachments?.map(attachment => (
                      <a key={attachment.url} href={attachment.url} className="block text-xs underline">
                        {attachment.name || attachment.url}
                      </a>
                    ))}
                    <div className="mt-1 flex flex-wrap gap-1">
                      {reactions.filter(reaction => reaction.targetEventId === message.id).map(reaction => (
                        <Button
                          key={reaction.id}
                          type="button"
                          aria-label={`Remove ${reaction.emoji}`}
                          onClick={() => onRemoveReaction?.(reaction.id)}
                        >
                          {reaction.emoji}
                        </Button>
                      ))}
                      <Button type="button" onClick={() => onReact?.(message.id, '👍')}>React</Button>
                      <Button type="button" onClick={() => setThreadRoot(message.threadRootId || message.id)}>Thread</Button>
                    </div>
                  </li>
                ))}
              </ol>
            </ScrollArea>
            <aside className="w-52 border-l border-(--ui-stroke-tertiary) p-3 text-sm">
              <h2 className="mb-2 text-xs uppercase text-(--ui-text-tertiary)">Members</h2>
              <ul>
                {room.members.map(member => (
                  <li key={member.pubkey} className="mb-1 flex items-center justify-between gap-1">
                    <span>{member.name || member.pubkey}</span>
                    <span className="text-[0.65rem] text-(--ui-text-tertiary)">{member.role}</span>
                    <Button type="button" disabled={!canModerate} onClick={() => onKick?.(member.pubkey)}>Remove</Button>
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                disabled={!canModerate || !invitee.trim()}
                onClick={() => {
                  onInvite?.(invitee.trim())
                  setInvitee('')
                }}
              >
                Invite
              </Button>
              <input
                aria-label="Invite pubkey"
                className="mt-2 w-full rounded-md border border-(--ui-stroke-tertiary) bg-transparent px-2 py-1 text-xs"
                value={invitee}
                onChange={event => setInvitee(event.target.value)}
              />
            </aside>
          </div>
          {showDiagnostics && diagnostics ? <RoomDiagnostics rows={diagnostics} /> : null}
          <RoomComposer
            members={room.members}
            disabled={!relayOpen || !hasCredential}
            failed={failed}
            threadRootId={threadRoot}
            onSend={onSend}
            onRetry={onRetry}
            onRemove={onRemove}
          />
        </>
      )}
    </section>
  )
}
