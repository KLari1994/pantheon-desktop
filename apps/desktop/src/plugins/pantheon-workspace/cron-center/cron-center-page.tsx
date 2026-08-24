import { ConfirmDialog, type PluginProfileRoute } from '@hermes/plugin-sdk'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'

import { CronEditorDialog } from './cron-editor-dialog'
import { cronCenterEnglish } from './i18n'
import { projectCronRow } from './projections'
import type { CronCenterStore } from './store'
import type { CronCenterRow } from './types'

function useStoreValue<T>(store: { get: () => T; listen: (listener: (next: T) => void) => () => void }): T {
  return useSyncExternalStore(store.listen, store.get, store.get)
}

export function CronCenterPage({
  store,
  text = cronCenterEnglish,
  initialJobKey,
  onOpenOwnerChat,
  onNavigate
}: {
  store: CronCenterStore
  text?: typeof cronCenterEnglish
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

  const rows = useMemo(
    () =>
      Object.values(slices).flatMap(slice => slice.jobs.map(job => projectCronRow(slice.owner, job))),
    [slices]
  )

  const selected = rows.find(row => row.key === selectedKey) ?? null
  const degraded = Object.values(slices).some(slice => slice.status === 'degraded' || slice.status === 'error')
  const exhausted = status === 'error' && rows.length === 0

  const [didApplyInitial, setDidApplyInitial] = useState(false)

  useEffect(() => {
    if (didApplyInitial || !initialJobKey) {return}
    const match = rows.find(row => row.key === initialJobKey || row.job.id === initialJobKey)

    if (match) {
      setSelectedKey(match.key)
      setDidApplyInitial(true)
    }
  }, [didApplyInitial, initialJobKey, rows])

  useEffect(() => {
    if (!selected) {return}
    void store.loadHistory(selected.owner, selected.job.id)
  }, [selected, store])

  if (status === 'loading' && rows.length === 0) {
    return <p className="p-4 text-sm text-(--ui-text-secondary)">{text.loading}</p>
  }

  if (exhausted) {
    return <p className="p-4 text-sm text-(--ui-text-secondary)">{text.error}</p>
  }

  if (rows.length === 0) {
    return <p className="p-4 text-sm text-(--ui-text-secondary)">{text.empty}</p>
  }

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-80 overflow-auto border-r border-(--ui-stroke-tertiary) p-3">
        <h1 className="text-sm font-medium">{text.title}</h1>
        {degraded ? <p className="mt-2 text-xs text-(--ui-text-secondary)">{text.degraded}</p> : null}
        <ul className="mt-3 flex flex-col gap-2">
          {rows.map(row => (
            <li key={row.key}>
              <button
                className={`w-full rounded-md border p-2 text-left ${selectedKey === row.key ? 'border-(--ui-stroke)' : 'border-(--ui-stroke-tertiary)'}`}
                onClick={() => {
                  setSelectedKey(row.key)
                  setMoreOpen(false)
                  setEditing(false)
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
              void store.pause(selected.owner, selected.job.id)
            }}
            onResume={() => {
              void store.resume(selected.owner, selected.job.id)
            }}
            onRunNow={() => {
              void store.trigger(selected.owner, selected.job.id)
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
            await store.remove(selected.owner, selected.job.id)
            setConfirmDelete(false)
            setSelectedKey(null)
          }}
          open={confirmDelete}
          title={text.deleteTitle(selected.name)}
        />
      ) : null}
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
  onRunNow,
  onEdit,
  onPause,
  onResume,
  onOpenOwnerChat,
  onMore,
  onDelete
}: {
  row: CronCenterRow
  text: typeof cronCenterEnglish
  pending: boolean
  moreOpen: boolean
  history: Array<{ id: string; title: string; preview: string }>
  confirmDelete: boolean
  onRunNow: () => void
  onEdit: () => void
  onPause: () => void
  onResume: () => void
  onOpenOwnerChat: () => void
  onMore: () => void
  onDelete: () => void
}) {
  const source =
    row.job.prompt ||
    row.job.script ||
    row.job.monitor_script ||
    row.job.monitor_url ||
    text.unavailable

  const receipt = row.job.latest_execution

  return (
    <div>
      <h2 className="text-base font-medium">{row.name}</h2>
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
          <dd>{row.resultLabel}</dd>
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
        <pre className="mt-1 whitespace-pre-wrap text-xs">{source}</pre>
      </section>
      <section className="mt-4">
        <h3 className="text-sm font-medium">{text.receipt}</h3>
        <p className="mt-1 text-xs">
          {receipt ? `${receipt.id || 'execution'} ${receipt.status || ''} ${receipt.claimed_at || ''}`.trim() : text.unavailable}
        </p>
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
