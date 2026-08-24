import { atom } from 'nanostores'

import type { RuntimeReadinessResult } from '@/lib/runtime-readiness'

// Last readiness the statusbar poller proved (null = checking/unknown).
// Published from useStatusSnapshot — the single poll — so other surfaces
// (the empty-chat setup action) read the same truth without a second poll.
export const $inferenceReadiness = atom<null | RuntimeReadinessResult>(null)
