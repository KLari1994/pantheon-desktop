import { Button, type BuzzReaction, type BuzzRoom, ScrollArea } from '@hermes/plugin-sdk'
import { useMemo, useState } from 'react'

import { type ComposerExtras, RoomComposer } from './room-composer'
import { type RoomDiagnosticRow, RoomDiagnostics } from './room-diagnostics'
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
          <Button onClick={() => setTab('chat')} type="button">Chat</Button>
          <Button onClick={() => setTab('canvas')} type="button">Canvas</Button>
          <Button onClick={() => setShowDiagnostics(value => !value)} type="button">Diagnostics</Button>
        </div>
      </header>
      {tab === 'canvas' ? (
        <div className="flex-1 p-4 text-sm text-(--ui-text-secondary)">{canvas || 'No canvas metadata'}</div>
      ) : (
        <>
          <div className="flex min-h-0 flex-1">
            <ScrollArea className="min-h-0 flex-1 p-3">
              <Button onClick={onShowEarlier} type="button">Show earlier</Button>
              <ol className="mt-3 space-y-2">
                {visible.map(message => (
                  <li className="rounded-md bg-(--ui-surface) px-3 py-2 text-sm" key={message.id}>
                    <div className="text-xs text-(--ui-text-tertiary)">{message.author}</div>
                    <div>{message.content}</div>
                    {message.attachments?.map(attachment => (
                      <a className="block text-xs underline" href={attachment.url} key={attachment.url}>
                        {attachment.name || attachment.url}
                      </a>
                    ))}
                    <div className="mt-1 flex flex-wrap gap-1">
                      {reactions.filter(reaction => reaction.targetEventId === message.id).map(reaction => (
                        <Button
                          aria-label={`Remove ${reaction.emoji}`}
                          key={reaction.id}
                          onClick={() => onRemoveReaction?.(reaction.id)}
                          type="button"
                        >
                          {reaction.emoji}
                        </Button>
                      ))}
                      <Button onClick={() => onReact?.(message.id, '👍')} type="button">React</Button>
                      <Button onClick={() => setThreadRoot(message.threadRootId || message.id)} type="button">Thread</Button>
                    </div>
                  </li>
                ))}
              </ol>
            </ScrollArea>
            <aside className="w-52 border-l border-(--ui-stroke-tertiary) p-3 text-sm">
              <h2 className="mb-2 text-xs uppercase text-(--ui-text-tertiary)">Members</h2>
              <ul>
                {room.members.map(member => (
                  <li className="mb-1 flex items-center justify-between gap-1" key={member.pubkey}>
                    <span>{member.name || member.pubkey}</span>
                    <span className="text-[0.65rem] text-(--ui-text-tertiary)">{member.role}</span>
                    <Button disabled={!canModerate} onClick={() => onKick?.(member.pubkey)} type="button">Remove</Button>
                  </li>
                ))}
              </ul>
              <Button
                disabled={!canModerate || !invitee.trim()}
                onClick={() => {
                  onInvite?.(invitee.trim())
                  setInvitee('')
                }}
                type="button"
              >
                Invite
              </Button>
              <input
                aria-label="Invite pubkey"
                className="mt-2 w-full rounded-md border border-(--ui-stroke-tertiary) bg-transparent px-2 py-1 text-xs"
                onChange={event => setInvitee(event.target.value)}
                value={invitee}
              />
            </aside>
          </div>
          {showDiagnostics && diagnostics ? <RoomDiagnostics rows={diagnostics} /> : null}
          <RoomComposer
            disabled={!relayOpen || !hasCredential}
            failed={failed}
            members={room.members}
            onRemove={onRemove}
            onRetry={onRetry}
            onSend={onSend}
            threadRootId={threadRoot}
          />
        </>
      )}
    </section>
  )
}
