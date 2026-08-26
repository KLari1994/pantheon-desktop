import { useState } from 'react'

import { cronCenterEnglish, type CronCenterText } from './i18n'
import {
  type CronCenterJobUpdates,
  type CronCenterPersistedJob,
  cronEditorUpdates,
  jobIsScriptOnly,
  validateCronEditor
} from './types'

export function CronEditorDialog({
  job,
  onClose,
  onSave,
  text = cronCenterEnglish
}: {
  job: CronCenterPersistedJob
  onClose: () => void
  onSave: (updates: CronCenterJobUpdates) => Promise<void> | void
  text?: CronCenterText | typeof cronCenterEnglish
}) {
  const scriptOnly = jobIsScriptOnly(job)
  const [name, setName] = useState(job.name || '')
  const [schedule, setSchedule] = useState(job.schedule?.expr || job.schedule_display || '')
  const [prompt, setPrompt] = useState(job.prompt || '')
  const [deliver, setDeliver] = useState(job.deliver || 'local')
  const [error, setError] = useState<string | null>(null)

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 p-4"
      role="dialog"
    >
      <form
        className="w-full max-w-lg rounded-md border border-(--ui-stroke-tertiary) bg-(--ui-bg) p-4"
        onSubmit={event => {
          event.preventDefault()
          const invalid = validateCronEditor({ prompt, schedule, scriptOnlyJob: scriptOnly })

          if (invalid) {
            setError(invalid)

            return
          }

          void Promise.resolve(
            onSave(
              cronEditorUpdates(
                { deliver, model: job.model || '', name, prompt, provider: job.provider || '', schedule },
                { scriptOnlyJob: scriptOnly }
              )
            )
          ).catch(error => {
            setError(error instanceof Error ? error.message : String(error))
          })
        }}
      >
        <h2 className="text-sm font-medium">{text.edit}</h2>
        <label className="mt-3 block text-xs">
          {text.name}
          <input
            className="mt-1 w-full border px-2 py-1"
            onChange={event => setName(event.target.value)}
            value={name}
          />
        </label>
        <label className="mt-3 block text-xs">
          {text.schedule}
          <input
            className="mt-1 w-full border px-2 py-1"
            onChange={event => setSchedule(event.target.value)}
            value={schedule}
          />
        </label>
        <label className="mt-3 block text-xs">
          {text.delivery}
          <input
            className="mt-1 w-full border px-2 py-1"
            onChange={event => setDeliver(event.target.value)}
            value={deliver}
          />
        </label>
        {scriptOnly ? (
          <p className="mt-3 text-xs text-(--ui-text-secondary)">
            {text.noAgent}
            {job.script ? `: ${job.script}` : ''}
          </p>
        ) : (
          <label className="mt-3 block text-xs">
            {text.prompt}
            <textarea
              className="mt-1 w-full border px-2 py-1"
              onChange={event => setPrompt(event.target.value)}
              value={prompt}
            />
          </label>
        )}
        {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} type="button">
            {text.cancel}
          </button>
          <button type="submit">{text.save}</button>
        </div>
      </form>
    </div>
  )
}
