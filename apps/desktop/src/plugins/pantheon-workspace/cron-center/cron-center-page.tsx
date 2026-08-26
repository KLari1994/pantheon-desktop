import { ConfirmDialog, type PluginProfileRoute } from '@hermes/plugin-sdk'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'

import { CronEditorDialog } from './cron-editor-dialog'
import { cronCenterEnglish, cronCenterLabels, type CronCenterText } from './i18n'
import { projectCronRow } from './projections'
import type { CronCenterStore } from './store'
import type { CronCenterRow } from './types'

function useStoreValue<T>(store: { get: () => T; listen: (listener: (next: T) => void) => () => void }): T {
  return useSyncExternalStore(store.listen, store.get, store.get)
}

function actionMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function fieldText(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim()
  }

  if (value && typeof value === 'object' && 'detail' in value) {
    return typeof (value as { detail?: unknown }).detail === 'string' ? (value as { detail: string }).detail.trim() : ''
  }

  return ''
}

export function CronCenterPage({
  store,
  text = cronCenterEnglish,
  initialJobKey,
  onOpenOwnerChat,
  onNavigate
}: {
  store: CronCenterStore
  text?: CronCenterText | typeof cronCenterEnglish
  initialJobKey?: string | null
  onOpenOwnerChat?: (route: PluginProfileRoute) => void
  onNavigate?: (href: string) => void
}) {
  const slices = useStoreValue(store.$slices)
  const status = useStoreValue(store.$status)
  const pendingKey = useStoreValue(store.$pendingKey)
  const history = useStoreValue(store.$history)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const labels = useMemo(() => cronCenterLabels(text), [text])

  const rows = useMemo(
    () => Object.values(slices).flatMap(slice => slice.jobs.map(job => projectCronRow(slice.owner, job, labels))),
    [labels, slices]
  )

  const selected = rows.find(row => row.key === selectedKey) ?? null
  const sliceList = Object.values(slices)
  const degraded = sliceList.some(slice => slice.status === 'degraded' || slice.status === 'error')
  const ownersReady = sliceList.length > 0 && sliceList.every(slice => slice.status === 'ready')
  const exhausted = status === 'error' && rows.length === 0

  const [didApplyInitial, setDidApplyInitial] = useState(false)

  useEffect(() => {
    if (didApplyInitial || !initialJobKey) {
      return
    }
    const match = rows.find(row => row.key === initialJobKey)

    if (match) {
      setSelectedKey(match.key)
      setDidApplyInitial(true)
    }
  }, [didApplyInitial, initialJobKey, rows])

  useEffect(() => {
    if (!selected) {
      return
    }
    void store.loadHistory(selected.owner, selected.job.id)
  }, [selected, store])

  const runAction = (work: () => Promise<void>) => {
    void work().catch(error => {
      setActionError(actionMessage(error))
    })
  }

  if (status === 'loading' && rows.length === 0) {
    return <p className="p-4 text-sm text-(--ui-text-secondary)">{text.loading}</p>
  }

  if (exhausted) {
    return <p className="p-4 text-sm text-(--ui-text-secondary)">{text.error}</p>
  }

  if (rows.length === 0 && sliceList.length > 0 && !ownersReady) {
    return <p className="p-4 text-sm text-(--ui-text-secondary)">{status === 'error' ? text.error : text.degraded}</p>
  }

  if (rows.length === 0) {
    return <p className="p-4 text-sm text-(--ui-text-secondary)">{text.empty}</p>
  }

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-80 overflow-auto border-r border-(--ui-stroke-tertiary) p-3">
        <h1 className="text-sm font-medium">{text.title}</h1>
        {degraded ? <p className="mt-2 text-xs text-(--ui-text-secondary)">{text.degraded}</p> : null}
        {!selected && actionError ? <p className="mt-2 text-xs text-destructive">{actionError}</p> : null}
        <ul className="mt-3 flex flex-col gap-2">
          {rows.map(row => (
            <li key={row.key}>
              <button
                className={`w-full rounded-md border p-2 text-left ${selectedKey === row.key ? 'border-(--ui-stroke)' : 'border-(--ui-stroke-tertiary)'}`}
                onClick={() => {
                  setSelectedKey(row.key)
                  setMoreOpen(false)
                  setEditing(false)
                  setActionError(null)
                }}
                type="button"
              >
                {row.name}
              </button>
              <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-(--ui-text-tertiary)">
                <span>{row.owner.label}</span>
                <span>{row.schedule}</span>
                <span>{row.agentLabel}</span>
                <span>{row.resultLabel}</span>
                {row.currentExecution ? <span>{text.runningNow}</span> : null}
                <span>
                  {text.nextRun}: {row.nextRun || text.unavailable}
                </span>
                <span>
                  {text.lastRun}: {row.lastRun || text.unavailable}
                </span>
                <span>{row.delivery}</span>
                <span>{row.failureStreak}</span>
              </div>
            </li>
          ))}
        </ul>
      </aside>
      <section className="min-w-0 flex-1 overflow-auto p-4">
        {selected ? (
          <CronCenterDetail
            actionError={actionError}
            confirmDelete={confirmDelete}
            history={history.key === selected.key ? history.rows : []}
            moreOpen={moreOpen}
            onDelete={() => setConfirmDelete(true)}
            onEdit={() => setEditing(true)}
            onMore={() => setMoreOpen(open => !open)}
            onOpenOwnerChat={() => {
              onOpenOwnerChat?.({
                connectionId: selected.owner.connectionId,
                profile: selected.owner.profile,
                targetProfile: selected.owner.targetProfile,
                mode: selected.owner.mode
              })
            }}
            onPause={() => {
              runAction(() => store.pause(selected.owner, selected.job.id))
            }}
            onResume={() => {
              runAction(() => store.resume(selected.owner, selected.job.id))
            }}
            onRunNow={() => {
              runAction(() => store.trigger(selected.owner, selected.job.id))
            }}
            pending={pendingKey === selected.key}
            row={selected}
            text={text}
          />
        ) : (
          <p className="text-sm text-(--ui-text-secondary)">{text.title}</p>
        )}
      </section>
      {editing && selected ? (
        <CronEditorDialog
          job={selected.job}
          onClose={() => setEditing(false)}
          onSave={async updates => {
            await store.update(selected.owner, selected.job.id, updates)
            setEditing(false)
            setActionError(null)
          }}
          text={text}
        />
      ) : null}
      {selected ? (
        <ConfirmDialog
          confirmLabel={text.delete}
          destructive
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            try {
              await store.remove(selected.owner, selected.job.id)
              setConfirmDelete(false)
              setSelectedKey(null)
              setActionError(null)
            } catch (error) {
              setConfirmDelete(false)
              setActionError(actionMessage(error))
            }
          }}
          open={confirmDelete}
          title={text.deleteTitle(selected.name)}
        />
      ) : null}
      {onNavigate ? null : null}
    </div>
  )
}

function CronCenterDetail({
  row,
  text,
  pending,
  moreOpen,
  history,
  confirmDelete,
  actionError,
  onRunNow,
  onEdit,
  onPause,
  onResume,
  onOpenOwnerChat,
  onMore,
  onDelete
}: {
  row: CronCenterRow
  text: CronCenterText | typeof cronCenterEnglish
  pending: boolean
  moreOpen: boolean
  history: Array<{ id: string; title: string; preview: string }>
  confirmDelete: boolean
  actionError: string | null
  onRunNow: () => void
  onEdit: () => void
  onPause: () => void
  onResume: () => void
  onOpenOwnerChat: () => void
  onMore: () => void
  onDelete: () => void
}) {
  const sources = [
    { label: text.prompt, value: fieldText(row.job.prompt) },
    { label: text.script, value: fieldText(row.job.script) },
    { label: text.monitorScript, value: fieldText(row.job.monitor_script) },
    { label: text.monitorUrl, value: fieldText(row.job.monitor_url) }
  ].filter(entry => entry.value)

  const receipt = row.job.latest_execution

  const errors = [
    { label: text.lastError, value: fieldText(row.job.last_error) },
    { label: text.deliveryError, value: fieldText(row.job.last_delivery_error) },
    { label: text.fireError, value: fieldText(row.job.last_fire_error) },
    { label: text.receiptError, value: fieldText(receipt?.error) }
  ].filter(entry => entry.value)

  return (
    <div>
      <h2 className="text-base font-medium">{row.name}</h2>
      {actionError ? <p className="mt-2 text-xs text-destructive">{actionError}</p> : null}
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt>{text.owner}</dt>
          <dd>{row.owner.label}</dd>
        </div>
        <div>
          <dt>{text.schedule}</dt>
          <dd>{row.schedule}</dd>
        </div>
        <div>
          <dt>{text.agent}</dt>
          <dd>{row.agentLabel}</dd>
        </div>
        <div>
          <dt>{text.nextRun}</dt>
          <dd>{row.nextRun || text.unavailable}</dd>
        </div>
        <div>
          <dt>{text.lastRun}</dt>
          <dd>{row.lastRun || text.unavailable}</dd>
        </div>
        <div>
          <dt>{text.result}</dt>
          <dd>
            {row.resultLabel}
            {row.currentExecution ? ` · ${text.runningNow}` : ''}
          </dd>
        </div>
        <div>
          <dt>{text.delivery}</dt>
          <dd>{row.delivery}</dd>
        </div>
        <div>
          <dt>{text.failureStreak}</dt>
          <dd>{row.failureStreak}</dd>
        </div>
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={onRunNow} type="button">
          {pending ? text.running : text.runNow}
        </button>
        <button onClick={onEdit} type="button">
          {text.edit}
        </button>
        <button onClick={row.paused ? onResume : onPause} type="button">
          {row.paused ? text.resume : text.pause}
        </button>
        <button onClick={onOpenOwnerChat} type="button">
          {text.openOwnerChat}
        </button>
        <button onClick={onMore} type="button">
          {text.more}
        </button>
      </div>
      {moreOpen ? (
        <button className="mt-2 block" onClick={onDelete} type="button">
          {text.delete}
        </button>
      ) : null}
      <section className="mt-6">
        <h3 className="text-sm font-medium">{text.source}</h3>
        {sources.length ? (
          sources.map(entry => (
            <div className="mt-1" key={entry.label}>
              <p className="text-[11px] text-(--ui-text-tertiary)">{entry.label}</p>
              <pre className="whitespace-pre-wrap text-xs">{entry.value}</pre>
            </div>
          ))
        ) : (
          <pre className="mt-1 whitespace-pre-wrap text-xs">{text.unavailable}</pre>
        )}
      </section>
      <section className="mt-4">
        <h3 className="text-sm font-medium">{text.receipt}</h3>
        <p className="mt-1 text-xs">
          {receipt
            ? `${receipt.id || 'execution'} ${receipt.status || ''} ${receipt.claimed_at || ''}`.trim()
            : text.unavailable}
        </p>
        {errors.map(entry => (
          <p className="mt-1 text-xs" key={entry.label}>
            {entry.label}: {entry.value}
          </p>
        ))}
      </section>
      <section className="mt-4">
        <h3 className="text-sm font-medium">{text.history}</h3>
        <ul className="mt-1 flex flex-col gap-1 text-xs">
          {history.map(run => (
            <li key={run.id}>
              {run.title} — {run.preview}
            </li>
          ))}
        </ul>
      </section>
      {confirmDelete ? null : null}
    </div>
  )
}
