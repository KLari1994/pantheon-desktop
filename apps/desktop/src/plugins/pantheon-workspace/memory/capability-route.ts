import type { PluginProfileRoute } from '@hermes/plugin-sdk'

export function requireExactCapabilityRoute(route: PluginProfileRoute): PluginProfileRoute {
  if (!route.connectionId.trim() || !route.profile.trim() || !route.targetProfile.trim()) {
    throw new Error('Capability actions require an exact connection/profile route')
  }

  return route
}

export function capabilitySurfaceProps(route: PluginProfileRoute): {
  embedded: true
  fixedConnection: string
  fixedProfile: string
} {
  const exact = requireExactCapabilityRoute(route)

  return {
    embedded: true,
    fixedConnection: exact.connectionId,
    fixedProfile: exact.targetProfile
  }
}
