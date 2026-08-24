export const REQUIRED_PARITY_FEATURES = [
  'bot-chat',
  'bot-hide-unhide',
  'pet-overlay',
  'quick-entry',
  'hud',
  'model-status-bar',
  'terminal-restore',
  'preview',
  'computer-use-status',
  'voice-controls',
  'artifacts',
  'memory-graph',
  'branching',
  'checkpoints',
  'update-gate'
] as const

interface ParityProbe {
  feature: string
  description: string
  anchors: readonly string[]
}

export const PANTHEON_PARITY_FEATURES: readonly ParityProbe[] = [
  {
    feature: 'bot-chat',
    description: 'Canonical bot chats remain a first-class conversation surface.',
    anchors: [
      'src/plugins/hermes-bots/plugin.js',
      'src/plugins/hermes-bots/tests/canonical-chat-registry.test.mjs',
      'e2e/sidebar-states.spec.ts'
    ]
  },
  {
    feature: 'bot-hide-unhide',
    description: 'Bot chats can be hidden and restored without losing identity.',
    anchors: ['src/plugins/hermes-bots/plugin.js', 'src/plugins/hermes-bots/tests/hide-bots.test.mjs']
  },
  {
    feature: 'pet-overlay',
    description: 'Pixel-pet overlay remains available as a desktop surface.',
    anchors: ['src/app/pet-overlay']
  },
  {
    feature: 'quick-entry',
    description: 'Global Quick Entry composer remains available.',
    anchors: ['src/app/quick-entry', 'src/store/quick-entry.ts']
  },
  {
    feature: 'hud',
    description: 'HUD window remains a first-class desktop surface.',
    anchors: ['src/app/hud']
  },
  {
    feature: 'model-status-bar',
    description: 'Model catalog and context usage stay visible in the shell.',
    anchors: ['src/app/shell/model-catalog-menu.tsx', 'src/app/shell/context-usage-panel.tsx']
  },
  {
    feature: 'terminal-restore',
    description: 'Terminal panes persist and restore in the right sidebar.',
    anchors: ['src/app/right-sidebar/terminal']
  },
  {
    feature: 'preview',
    description: 'Chat preview tiles remain part of the conversation surface.',
    anchors: ['src/app/chat/preview-tile.tsx']
  },
  {
    feature: 'computer-use-status',
    description: 'Computer-use settings and status remain available.',
    anchors: ['src/app/settings/computer-use-panel.tsx']
  },
  {
    feature: 'voice-controls',
    description: 'Composer voice controls remain available.',
    anchors: ['src/app/chat/composer/hooks/use-composer-voice.ts']
  },
  {
    feature: 'artifacts',
    description: 'Artifacts remain a first-class desktop surface.',
    anchors: ['src/app/artifacts']
  },
  {
    feature: 'memory-graph',
    description: 'Memory graph / starmap remains available.',
    anchors: ['src/app/starmap']
  },
  {
    feature: 'branching',
    description: 'Session branching remains available.',
    anchors: ['src/app/session/hooks/use-session-actions/index.ts', 'e2e/large-session-resume.spec.ts']
  },
  {
    feature: 'checkpoints',
    description: 'Prompt rewind / checkpoints remain available.',
    anchors: ['src/app/session/hooks/use-prompt-actions/rewind.ts']
  },
  {
    feature: 'update-gate',
    description: 'Desktop update gate remains in the Electron process.',
    anchors: ['electron/update-gate.ts', 'electron/updater-process.ts']
  }
]
