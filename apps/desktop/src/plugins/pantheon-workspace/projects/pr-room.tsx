import { useState, type ReactNode } from 'react'

import { deriveMergeAuthority } from './pr-lifecycle'
import { projectEnglish } from './i18n'
import { MachineTargetBanner } from './machine-target'
import type { MachineAvailability, PrRoomTab, ProjectRoomBinding } from './types'

const TABS: Array<{ id: PrRoomTab; label: string; operational: boolean }> = [
  { id: 'conversation', label: projectEnglish.conversation, operational: false },
  { id: 'review', label: projectEnglish.review, operational: true },
  { id: 'preview', label: projectEnglish.preview, operational: true },
  { id: 'files', label: projectEnglish.files, operational: true },
  { id: 'terminal', label: projectEnglish.terminal, operational: true },
  { id: 'artifacts', label: projectEnglish.artifacts, operational: true },
  { id: 'merge-packet', label: projectEnglish.mergePacket, operational: false }
]

function BindingIdentity({ binding }: { binding: ProjectRoomBinding }) {
  return (
    <dl className="grid gap-1 text-xs text-(--ui-text-secondary)">
      <div>
        <dt className="sr-only">Project</dt>
        <dd>{binding.projectName || binding.projectId}</dd>
      </div>
      <div>
        <dt className="sr-only">Room</dt>
        <dd>{binding.buzzRoomId}</dd>
      </div>
      <div>
        <dt className="sr-only">Worktree</dt>
        <dd>{binding.worktreePath}</dd>
      </div>
      <div>
        <dt className="sr-only">Branch</dt>
        <dd>{binding.targetBranch}</dd>
      </div>
    </dl>
  )
}

export function PrRoom({
  binding,
  machine,
  conversation,
  onActivateTab
}: {
  binding: ProjectRoomBinding
  machine: MachineAvailability
  conversation?: ReactNode
  onActivateTab?: (tab: PrRoomTab) => void
}) {
  const [tab, setTab] = useState<PrRoomTab>('conversation')
  const blocked = machine.status !== 'available'
  const authority = deriveMergeAuthority(binding)

  return (
    <section className="flex h-full min-h-0 flex-col gap-3 p-4">
      <header className="flex flex-col gap-2">
        <BindingIdentity binding={binding} />
        <MachineTargetBanner resolved={machine} />
      </header>
      <div className="flex flex-wrap gap-2" role="tablist">
        {TABS.map(item => {
          const disabled = blocked && item.operational

          return (
            <button
              aria-selected={tab === item.id}
              disabled={disabled}
              key={item.id}
              onClick={() => {
                if (disabled) {return}
                setTab(item.id)
                onActivateTab?.(item.id)
              }}
              role="tab"
              type="button"
            >
              {item.label}
            </button>
          )
        })}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {tab === 'conversation' ? conversation : null}
        {tab === 'review' ? <p>Read-only review for {binding.worktreePath}</p> : null}
        {tab === 'preview' ? <p>Preview stays closed until this tab is opened.</p> : null}
        {tab === 'files' ? <p>Files stay closed until this tab is opened.</p> : null}
        {tab === 'terminal' ? <p>Terminal stays closed until this tab is opened.</p> : null}
        {tab === 'artifacts' ? (
          <ul>
            {(binding.artifactIds || []).map(id => (
              <li key={id}>{id}</li>
            ))}
          </ul>
        ) : null}
        {tab === 'merge-packet' ? (
          <div>
            <pre>{JSON.stringify(binding.evidence || {}, null, 2)}</pre>
            {!authority.granted ? <p>{projectEnglish.noMergeAuthority}</p> : <p>Decision {authority.source}</p>}
          </div>
        ) : null}
      </div>
    </section>
  )
}
