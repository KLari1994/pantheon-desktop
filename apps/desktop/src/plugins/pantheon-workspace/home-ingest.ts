import { projectHomeItems } from './home/projections'
import type { HomeStore } from './home/store'
import type { HomeSourceEvent } from './home/types'
import type { NotificationEvent } from './notifications/policy'

export interface HomeNotificationBridge {
  subscribe: (ingest: (event: NotificationEvent) => void) => () => void
  ingest: (event: NotificationEvent) => void
}

export interface HomeIngestionOptions {
  store: HomeStore
  listEvents: () => HomeSourceEvent[]
  subscribe: (onChange: (events: HomeSourceEvent[]) => void) => () => void
  notifications?: HomeNotificationBridge
  onHydrate?: (events: HomeSourceEvent[]) => void
}

export function startHomeIngestion(options: HomeIngestionOptions): {
  startNotifications: () => void
  dispose: () => void
} {
  let disposed = false

  const apply = (events: HomeSourceEvent[]) => {
    if (disposed) {
      return
    }
    const generation = options.store.beginHydration()

    try {
      options.store.applyRefresh(projectHomeItems(events), generation)
    } catch {
      options.store.markDegraded(generation)
    }
  }

  const unsubscribeSnapshot = options.subscribe(events => apply(events))
  queueMicrotask(() => {
    if (disposed) {
      return
    }
    const events = options.listEvents()
    apply(events)
    options.onHydrate?.(events)
  })

  let unsubscribeNotifications: () => void = () => undefined

  return {
    startNotifications() {
      if (!options.notifications) {
        return
      }
      unsubscribeNotifications = options.notifications.subscribe(event => options.notifications?.ingest(event))
    },
    dispose() {
      disposed = true
      unsubscribeSnapshot()
      unsubscribeNotifications()
    }
  }
}
