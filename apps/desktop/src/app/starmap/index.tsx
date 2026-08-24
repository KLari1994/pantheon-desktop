import { useStore } from '@nanostores/react'
import { useEffect, useState } from 'react'

import { PageLoader } from '@/components/page-loader'
import { useI18n } from '@/i18n'
import {
  $starmapError,
  $starmapGraph,
  $starmapGraphKey,
  $starmapLoading,
  loadStarmapGraph,
  resetStarmapGraph
} from '@/store/starmap'
import type { StarmapGraph } from '@/types/hermes'

import { Panel, PanelEmpty } from '../overlays/panel'

import { StarMap } from './star-map'

export interface StarmapViewProps {
  onClose: () => void
  route?: { connectionId: string; profile: string; targetProfile?: string }
}

// Star map overlay: a top-down map of what Hermes has learned for a profile,
// over a radial time axis. Data is fetched on demand into the $starmap* atoms;
// the map itself lives in ./star-map. The chrome is owned by the map itself
// (timeline scrubber + legend float over the canvas), so there's no panel
// header here.
export function StarmapView({ onClose, route }: StarmapViewProps) {
  const { t } = useI18n()
  const graph = useStore($starmapGraph)
  const graphKey = useStore($starmapGraphKey)
  const loading = useStore($starmapLoading)
  const error = useStore($starmapError)
  const routeKey = route ? `${route.connectionId}::${route.targetProfile || route.profile}` : ''
  const routedGraph = !routeKey || graphKey === routeKey ? graph : null

  // A pasted share code populates the map with someone else's (or an exported)
  // graph, overriding the live profile scan. Cleared by "back to my map" and
  // whenever a fresh profile graph loads in.
  const [imported, setImported] = useState<StarmapGraph | null>(null)

  useEffect(() => {
    if (routeKey) {
      resetStarmapGraph()
      void loadStarmapGraph(true, {
        connectionId: route!.connectionId,
        profile: route!.targetProfile || route!.profile
      })
      return
    }

    void loadStarmapGraph()
  }, [routeKey])

  // Drop a stale import when the underlying profile graph changes out from under it.
  useEffect(() => {
    setImported(null)
  }, [graph])

  const shown = imported ?? routedGraph

  return (
    <Panel closeLabel={t.starmap.close} onClose={onClose}>
      {error ? (
        <PanelEmpty description={error} icon="warning" title={t.starmap.loadFailed} />
      ) : !shown && loading ? (
        <PageLoader aria-label={t.starmap.loading} className="min-h-0 flex-1" />
      ) : shown && shown.nodes.length === 0 && !imported ? (
        <PanelEmpty description={t.starmap.emptyDesc} icon="lightbulb" title={t.starmap.emptyTitle} />
      ) : shown ? (
        <StarMap
          graph={shown}
          imported={imported !== null}
          onImport={setImported}
          onResetMap={() => setImported(null)}
        />
      ) : null}
    </Panel>
  )
}
