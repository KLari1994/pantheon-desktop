import { classifyNotificationEvent, type NotificationEvent, type NotificationMutes } from './policy'

export interface NotificationDoorInput {
  id: string
  title?: string
  message?: string
  href: string
  onActivate: () => void
}

export interface NotificationCoordinatorOptions {
  toast: (input: NotificationDoorInput) => void
  native: (input: NotificationDoorInput) => void
  navigate: (href: string) => void
  focused: () => boolean
  subscribe?: (ingest: (event: NotificationEvent) => void) => () => void
  onRefresh?: () => void
  mutes?: NotificationMutes | (() => NotificationMutes)
}

export class NotificationCoordinator {
  private seen = new Set<string>()
  private hydrated = false
  private focused: () => boolean
  private unsubscribe: (() => void) | null = null

  constructor(private readonly options: NotificationCoordinatorOptions) {
    this.focused = options.focused
  }

  setFocused(focused: boolean): void {
    this.focused = () => focused
  }

  hydrate(events: NotificationEvent[]): void {
    for (const event of events) {
      this.seen.add(event.id)
    }
    this.hydrated = true
  }

  start(): void {
    if (!this.options.subscribe) {
      return
    }
    this.unsubscribe = this.options.subscribe(event => this.ingest(event))
  }

  ingest(event: NotificationEvent): void {
    if (this.seen.has(event.id)) {
      this.options.onRefresh?.()

      return
    }

    this.seen.add(event.id)
    const mutes = typeof this.options.mutes === 'function' ? this.options.mutes() : this.options.mutes
    const decision = classifyNotificationEvent(event, mutes || { mutedBots: [], mutedRooms: [] })

    if (decision === 'notify' && this.hydrated) {
      const input: NotificationDoorInput = {
        id: event.id,
        href: event.target.href,
        title: event.type,
        onActivate: () => this.options.navigate(event.target.href)
      }

      try {
        if (this.focused()) {
          this.options.toast(input)
        } else {
          this.options.native(input)
        }
      } catch {
        /* delivery failure must not retry or block refresh */
      }
    }

    this.options.onRefresh?.()
  }

  dispose(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
  }
}
