import { useSyncExternalStore } from 'react'

import { HOME_SECTIONS } from './projections'
import type { HomeStore } from './store'
import type { HomeItem } from './types'

function useStoreValue<T>(store: { get: () => T; listen: (listener: (next: T) => void) => () => void }): T {
  return useSyncExternalStore(store.listen, store.get, store.get)
}

export function HomePage({
  store,
  onNavigate
}: {
  store: HomeStore
  onNavigate: (href: string) => void
}) {
  const items = useStoreValue(store.$items)
  const status = useStoreValue(store.$status)

  if (status === 'loading' && items.length === 0) {
    return <p className="p-4 text-sm text-(--ui-text-secondary)">Loading inbox</p>
  }
  if (status === 'degraded' && items.length === 0) {
    return <p className="p-4 text-sm text-(--ui-text-secondary)">Inbox degraded</p>
  }
  if (items.length === 0) {
    return <p className="p-4 text-sm text-(--ui-text-secondary)">Nothing needs attention</p>
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-auto p-4">
      {HOME_SECTIONS.map(section => (
        <section key={section}>
          <h2 className="text-sm font-medium">{section}</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {items
              .filter(item => item.section === section)
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
