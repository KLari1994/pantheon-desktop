import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef } from 'react'

import { VIRTUALIZE_THRESHOLD, type RoomSummary } from './types'

function hashHue(value: string): string {
  let hash = 0
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) % 360
  return `hsl(${hash} 55% 55%)`
}

export function RoomList({
  rooms,
  selectedId,
  onSelect
}: {
  rooms: RoomSummary[]
  selectedId?: string | null
  onSelect: (id: string) => void
}) {
  const parentRef = useRef<HTMLDivElement>(null)
  const virtualize = rooms.length >= VIRTUALIZE_THRESHOLD
  const virtualizer = useVirtualizer({
    count: rooms.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 12,
    initialRect: { height: 600, width: 280 }
  })

  const renderRow = (room: RoomSummary) => (
    <button
      type="button"
      key={room.id}
      data-room-id={room.id}
      className={`flex w-full items-start gap-2 rounded-md px-2 py-2 text-left ${selectedId === room.id ? 'bg-(--chrome-action-hover)' : ''}`}
      onClick={() => onSelect(room.id)}
    >
      <div className="flex -space-x-1" aria-hidden="true">
        {room.memberAgentIds.slice(0, 3).map(id => (
          <span
            key={id}
            className="inline-block size-5 rounded-full border border-(--ui-stroke-tertiary)"
            style={{ background: hashHue(id) }}
          />
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{room.name}</span>
          <span className="text-[0.65rem] uppercase text-(--ui-text-tertiary)">{room.kind}</span>
          {room.unread ? <span className="size-2 rounded-full bg-(--ui-accent)" aria-label="Unread" /> : null}
          {room.needsYou ? (
            <span className="rounded bg-amber-500/20 px-1 text-[0.65rem] text-amber-700">Needs You</span>
          ) : null}
          {room.expiresAt ? <span className="text-[0.65rem] text-(--ui-text-tertiary)">TTL {room.expiresAt}</span> : null}
        </div>
        <div className="truncate text-xs text-(--ui-text-tertiary)">{room.latestPreview}</div>
      </div>
    </button>
  )

  return (
    <div ref={parentRef} className="h-full overflow-auto" data-virtualized={virtualize ? 'true' : 'false'}>
      {virtualize ? (
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map(item => (
            <div
              key={item.key}
              data-index={item.index}
              ref={virtualizer.measureElement}
              style={{ position: 'absolute', top: 0, transform: `translateY(${item.start}px)`, width: '100%' }}
            >
              {renderRow(rooms[item.index]!)}
            </div>
          ))}
        </div>
      ) : (
        rooms.map(renderRow)
      )}
    </div>
  )
}
