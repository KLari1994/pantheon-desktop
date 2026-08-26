import type { HomeItem } from './types'

function atom<T>(initial: T) {
  let value = initial
  const listeners = new Set<(next: T) => void>()

  return {
    get: () => value,
    set: (next: T) => {
      value = next

      for (const listener of listeners) {listener(next)}
    },
    listen: (listener: (next: T) => void) => {
      listeners.add(listener)

      return () => listeners.delete(listener)
    }
  }
}

export type HomeStoreStatus = 'degraded' | 'idle' | 'loading' | 'ready'

function sameItems(left: HomeItem[], right: HomeItem[]): boolean {
  if (left.length !== right.length) {return false}

  return left.every((item, index) => {
    const other = right[index]

    return (
      other !== undefined &&
      item.id === other.id &&
      item.section === other.section &&
      item.status === other.status &&
      item.timestamp === other.timestamp &&
      item.navigation.href === other.navigation.href &&
      item.agent === other.agent &&
      item.context === other.context &&
      item.machine === other.machine &&
      item.title === other.title
    )
  })
}

export class HomeStore {
  readonly $items = atom<HomeItem[]>([])
  readonly $status = atom<HomeStoreStatus>('idle')
  private generation = 0
  private readonly keysUsed = new Set<string>()

  constructor(private readonly storage?: { get?: (key: string) => unknown; set?: (key: string, value: unknown) => void }) {}

  persistedKeys(): string[] {
    return [...this.keysUsed]
  }

  beginHydration(): number {
    this.$status.set('loading')
    this.generation += 1

    return this.generation
  }

  applyRefresh(items: HomeItem[], generation: number): HomeItem[] {
    if (generation !== this.generation) {return this.$items.get()}
    const previous = this.$items.get()

    if (sameItems(previous, items)) {
      this.$status.set('ready')

      return previous
    }

    this.$items.set(items)
    this.$status.set('ready')

    return items
  }

  markDegraded(generation: number): void {
    if (generation !== this.generation) {return}
    this.$status.set('degraded')
  }
}
