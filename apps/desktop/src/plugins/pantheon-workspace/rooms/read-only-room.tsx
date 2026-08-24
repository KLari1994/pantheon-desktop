import { Button, ScrollArea } from '@hermes/plugin-sdk'

import type { BuzzMessage, BuzzRoom } from '@/pantheon/buzz-client'

export function ReadOnlyRoom({
  messages,
  room,
  status
}: {
  messages: BuzzMessage[]
  room: BuzzRoom
  status: string
}) {
  return (
    <section className="flex h-full min-h-0 flex-col gap-3 p-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-medium">{room.name}</h1>
          <p className="text-xs text-(--ui-text-tertiary)">Read-only Buzz room · {status}</p>
        </div>
        <Button disabled type="button">
          Send
        </Button>
      </header>
      <div className="text-sm text-(--ui-text-secondary)">
        {room.members.map(member => (
          <span className="mr-2" key={member.pubkey}>
            {member.name || member.pubkey}
          </span>
        ))}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <ol className="space-y-2">
          {messages.map(message => (
            <li className="rounded-md bg-(--ui-surface) px-3 py-2 text-sm" key={message.id}>
              <div className="text-xs text-(--ui-text-tertiary)">{message.author}</div>
              <div>{message.content}</div>
            </li>
          ))}
        </ol>
      </ScrollArea>
    </section>
  )
}
