import { type PluginProfileRoute, SkillsView } from '@hermes/plugin-sdk'

import { capabilitySurfaceProps } from './capability-route'

export function AgentEditorCapabilities({ route }: { route: PluginProfileRoute }) {
  const pins = capabilitySurfaceProps(route)

  return <SkillsView embedded fixedConnection={pins.fixedConnection} fixedProfile={pins.fixedProfile} />
}
