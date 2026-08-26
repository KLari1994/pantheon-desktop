import { useSyncExternalStore } from 'react'

import { HOME_SECTIONS } from './home/projections'
import type { HomeStore } from './home/store'
import type { HomeItem } from './home/types'
import type { ApprovalChoice, ApprovalProjection } from './needs-you/approval-projections'
import { NeedsYouList } from './needs-you/needs-you-list'

function useStoreValue<T>(store: { get: () => T; listen: (listener: (next: T) => void) => () => void }): T {
  return useSyncExternalStore(store.listen, store.get, store.get)
}

export interface HomeApprovalsProps {
  cards: ApprovalProjection[]
  busyId?: string | null
  errors?: Record<string, string>
  onNavigate: (card: ApprovalProjection) => void
  onRespond: (card: ApprovalProjection, choice: ApprovalChoice) => void
  onMute: (scope: { kind: 'bot' | 'room'; id: string }) => void
}

export function HomePage({
  store,
  onNavigate,
  approvals
}: {
  store: HomeStore
  onNavigate: (href: string) => void
  approvals?: HomeApprovalsProps
}) {
  const items = useStoreValue(store.$items)
  const status = useStoreValue(store.$status)

  if (status === 'loading' && items.length === 0 && !approvals?.cards.length) {
    return <p className="p-4 text-sm text-(--ui-text-secondary)">Loading inbox</p>
  }

  if (status === 'degraded' && items.length === 0 && !approvals?.cards.length) {
    return <p className="p-4 text-sm text-(--ui-text-secondary)">Inbox degraded</p>
  }

  if (items.length === 0 && !approvals?.cards.length) {
    return <p className="p-4 text-sm text-(--ui-text-secondary)">Nothing needs attention</p>
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-auto p-4">
      {HOME_SECTIONS.map(section => (
        <section key={section}>
          <h2 className="text-sm font-medium">{section}</h2>
          {section === 'Needs You' && approvals ? (
            <NeedsYouList
              busyId={approvals.busyId}
              cards={approvals.cards}
              errors={approvals.errors}
              onMute={approvals.onMute}
              onNavigate={approvals.onNavigate}
              onRespond={approvals.onRespond}
            />
          ) : null}
          <ul className="mt-2 flex flex-col gap-2">
            {items
              .filter(item => item.section === section)
              .filter(item => !(section === 'Needs You' && approvals && item.kind === 'approval'))
              .map(item => (
                <HomeRow item={item} key={item.id} onNavigate={onNavigate} />
              ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function HomeRow({ item, onNavigate }: { item: HomeItem; onNavigate: (href: string) => void }) {
  return (
    <li className="rounded-md border border-(--ui-stroke-tertiary) p-2">
      <button className="text-left" onClick={() => onNavigate(item.navigation.href)} type="button">
        Open {item.title}
      </button>
      <div className="mt-1 flex flex-wrap gap-2 text-xs text-(--ui-text-tertiary)">
        <span>{item.agent}</span>
        <span>{item.context}</span>
        <span>{item.machine}</span>
        <span aria-hidden="true">{item.status === 'failed' ? '✕' : item.status === 'working' ? '…' : '●'}</span>
        <span>{item.statusLabel}</span>
      </div>
    </li>
  )
}
