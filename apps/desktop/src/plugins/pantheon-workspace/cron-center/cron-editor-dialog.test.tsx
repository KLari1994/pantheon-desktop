import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import { CronEditorDialog } from './cron-editor-dialog'
import type { CronCenterPersistedJob } from './types'

test('script-only editor shows No agent and does not claim a model', async () => {
  const onSave = vi.fn()

  const job: CronCenterPersistedJob = {
    id: 'script-1',
    enabled: true,
    name: 'rotate',
    no_agent: true,
    script: 'echo hi',
    schedule: { expr: '0 3 * * *' },
    provider: 'openai',
    model: 'gpt-5',
    reasoning_effort: 'high'
  }

  render(<CronEditorDialog job={job} onClose={() => undefined} onSave={onSave} />)
  expect(screen.getByText(/No agent/)).toBeTruthy()
  expect(screen.queryByText('gpt-5')).toBeNull()
  expect(screen.queryByText('openai')).toBeNull()
  expect(screen.queryByText('high')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(onSave).toHaveBeenCalledWith({
    deliver: 'local',
    name: 'rotate',
    schedule: '0 3 * * *'
  })
  expect(onSave.mock.calls[0]?.[0]).not.toHaveProperty('model')
  expect(onSave.mock.calls[0]?.[0]).not.toHaveProperty('provider')
})
