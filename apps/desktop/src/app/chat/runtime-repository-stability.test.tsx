// @vitest-environment jsdom
import type { ExternalStoreAdapter } from '@assistant-ui/react'
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { ChatMessage } from '@/lib/chat-messages'
import { IncrementalExternalStoreRuntimeCore } from '@/lib/incremental-external-store-runtime'

import { useRuntimeMessageRepository } from './runtime-repository'

const MESSAGES: ChatMessage[] = [
  { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'open rockbot' }] },
  { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'one two three four five' }] }
]

// Fresh object + fresh closures each call — exactly what ChatRuntimeBoundary
// hands useIncrementalExternalStoreRuntime on every render.
const adapterLiteral = (messageRepository: ReturnType<typeof useRuntimeMessageRepository>) =>
  ({
    messageRepository,
    isRunning: false,
    setMessages: () => {},
    onNew: async () => {},
    onEdit: async () => {},
    onCancel: async () => {},
    onReload: async () => {}
  }) as unknown as ExternalStoreAdapter

describe('runtime repository / adapter stability across equivalent rerenders', () => {
  it('keeps repository identity stable when the messages array identity is unchanged', () => {
    const { rerender, result } = renderHook(({ msgs }) => useRuntimeMessageRepository(msgs), {
      initialProps: { msgs: MESSAGES }
    })
    const first = result.current

    for (let i = 0; i < 5; i += 1) {
      rerender({ msgs: MESSAGES })
    }

    expect(result.current).toBe(first)
  })

  it('never notifies subscribers across equivalent rerenders (no feedback loop fuel)', () => {
    const { rerender, result } = renderHook(({ msgs }) => useRuntimeMessageRepository(msgs), {
      initialProps: { msgs: MESSAGES }
    })
    const core = new IncrementalExternalStoreRuntimeCore(adapterLiteral(result.current))
    const thread = core.threads.getMainThreadRuntimeCore()

    let notifications = 0
    thread.subscribe(() => {
      notifications += 1
    })

    // 5 "renders": rerender the hook, rebuild the adapter literal, re-set it.
    for (let i = 0; i < 5; i += 1) {
      rerender({ msgs: MESSAGES })
      core.setAdapter(adapterLiteral(result.current))
    }

    expect(notifications).toBe(0)
  })
})
