import { type ComponentType, lazy, Suspense, useMemo, useState } from 'react'

import { CenteredThreadSpinner } from '@/components/assistant-ui/thread/status'
import { ErrorBoundary } from '@/components/error-boundary'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/error-state'

export const VIEW_IMPORT_TIMEOUT_MS = 15_000

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`Loading "${label}" timed out`)), ms)
    promise.then(
      value => {
        window.clearTimeout(timer)
        resolve(value)
      },
      error => {
        window.clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    )
  })
}

/**
 * A lazy view that can actually RETRY: React.lazy caches a rejected import
 * forever, so Retry re-creates the lazy component (fresh import attempt).
 * Failure/timeout degrades to a local ErrorState — never a blank page, never
 * the root boundary.
 */
export function retryableLazy<P extends object>(
  load: () => Promise<{ default: ComponentType<P> }>,
  label: string
): ComponentType<P> {
  return function RetryableLazyView(props: P) {
    const [attempt, setAttempt] = useState(0)
    const View = useMemo(() => lazy(() => withTimeout(load(), VIEW_IMPORT_TIMEOUT_MS, label)), [attempt])

    return (
      <ErrorBoundary
        fallback={({ error }) => (
          <div className="grid h-full place-items-center p-6">
            <ErrorState description={error.message} title={`"${label}" failed to load`}>
              <Button
                className="justify-self-center"
                onClick={() => setAttempt(current => current + 1)}
                size="sm"
                variant="outline"
              >
                Retry
              </Button>
            </ErrorState>
          </div>
        )}
        key={attempt}
        label={`lazy-view:${label}`}
      >
        <Suspense fallback={<CenteredThreadSpinner />}>
          <View {...props} />
        </Suspense>
      </ErrorBoundary>
    )
  }
}
