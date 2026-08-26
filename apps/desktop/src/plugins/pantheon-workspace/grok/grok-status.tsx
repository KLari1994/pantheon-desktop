import { useEffect, useState } from 'react'

import { createGrokProductAdapter, type GrokProductAdapter, type GrokProductStatus } from './adapter'

export function GrokStatusPage({ adapter = createGrokProductAdapter() }: { adapter?: GrokProductAdapter }) {
  const [status, setStatus] = useState<GrokProductStatus | null>(null)

  useEffect(() => {
    let cancelled = false

    void adapter.status().then(next => {
      if (!cancelled) {
        setStatus(next)
      }
    })

    return () => {
      cancelled = true
    }
  }, [adapter])

  const reason = status?.reason || 'UNAVAILABLE'
  const showChat = status?.available === true

  return (
    <section className="flex h-full min-w-0 flex-col overflow-hidden bg-(--ui-chat-surface-background) p-4">
      <h1 className="text-base font-medium">Grok Bot</h1>
      <p className="mt-2 text-sm text-(--ui-text-secondary)">
        {status?.available ? `available ${status.productVersion || ''}`.trim() : reason}
      </p>
      {showChat ? <div data-testid="grok-direct-chat">Direct chat</div> : null}
    </section>
  )
}
