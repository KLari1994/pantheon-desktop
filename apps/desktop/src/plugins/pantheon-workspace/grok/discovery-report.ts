import schema from './discovery-report.schema.json'

export const DISCOVERY_REPORT_REQUIRED_FIELDS = schema.required

export type DocumentedIntegrationSurfaceType = 'documented-api' | 'documented-ipc'

export type GrokDiscoveryReport = {
  productName: string
  productVersion: string
  installPath: string
  processIdentity: string
  integrationSurface: {
    type: DocumentedIntegrationSurfaceType
    documentation: string
  }
  healthProbe: {
    kind: 'documented-health-endpoint' | 'documented-ipc-ping'
    description: string
  }
  authModel: string
  messageHistoryGuarantees: string
  redistributionTerms: string
  discoveryHost: string
  discoveredAt: string
  result: 'pass' | 'fail'
}

export type DiscoveryReportValidation = { ok: true; report: GrokDiscoveryReport } | { ok: false; reason: string }

const REJECTED_SURFACES: Record<string, string> = {
  'process-presence': 'process presence alone is not a documented integration surface',
  'screen-scraping': 'screen scraping is not a documented integration surface',
  scraping: 'screen scraping is not a documented integration surface',
  'remote-model-api': 'a remote model API is not a local documented product surface',
  'xai-model-api': 'a remote model API is not a local documented product surface'
}

const ALLOWED_SURFACES = new Set<DocumentedIntegrationSurfaceType>(['documented-api', 'documented-ipc'])
const ALLOWED_PROBES = new Set(['documented-health-endpoint', 'documented-ipc-ping'])

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function requireNonEmptyString(value: unknown, field: string): string | DiscoveryReportValidation {
  if (typeof value !== 'string' || value.trim() === '') {
    return { ok: false, reason: `missing required field ${field}` }
  }

  return value
}

export function validateDiscoveryReport(value: unknown): DiscoveryReportValidation {
  const report = asRecord(value)

  if (!report) {
    return { ok: false, reason: 'discovery report must be an object' }
  }

  for (const field of schema.required) {
    if (!(field in report)) {
      return { ok: false, reason: `missing required field ${field}` }
    }
  }

  const strings = [
    'productName',
    'productVersion',
    'installPath',
    'processIdentity',
    'authModel',
    'messageHistoryGuarantees',
    'redistributionTerms',
    'discoveryHost',
    'discoveredAt'
  ] as const

  const parsed: Partial<GrokDiscoveryReport> = {}

  for (const field of strings) {
    const next = requireNonEmptyString(report[field], field)

    if (typeof next !== 'string') {
      return next
    }

    parsed[field] = next
  }

  if (report.result !== 'pass' && report.result !== 'fail') {
    return { ok: false, reason: 'result must be pass or fail' }
  }

  parsed.result = report.result

  const surface = asRecord(report.integrationSurface)

  if (!surface) {
    return { ok: false, reason: 'missing required field integrationSurface' }
  }

  const surfaceType = typeof surface.type === 'string' ? surface.type : ''

  if (REJECTED_SURFACES[surfaceType]) {
    return { ok: false, reason: REJECTED_SURFACES[surfaceType] }
  }

  if (!ALLOWED_SURFACES.has(surfaceType as DocumentedIntegrationSurfaceType)) {
    return { ok: false, reason: 'integrationSurface.type must be a documented-api or documented-ipc' }
  }

  const documentation = requireNonEmptyString(surface.documentation, 'integrationSurface.documentation')

  if (typeof documentation !== 'string') {
    return documentation
  }

  parsed.integrationSurface = {
    type: surfaceType as DocumentedIntegrationSurfaceType,
    documentation
  }

  const probe = asRecord(report.healthProbe)

  if (!probe) {
    return { ok: false, reason: 'missing required field healthProbe' }
  }

  const probeKind = typeof probe.kind === 'string' ? probe.kind : ''

  if (probeKind === 'process-presence') {
    return { ok: false, reason: 'process presence alone is not a documented health probe' }
  }

  if (!ALLOWED_PROBES.has(probeKind)) {
    return { ok: false, reason: 'healthProbe.kind must be a documented non-invasive probe' }
  }

  const probeDescription = requireNonEmptyString(probe.description, 'healthProbe.description')

  if (typeof probeDescription !== 'string') {
    return probeDescription
  }

  parsed.healthProbe = {
    kind: probeKind as GrokDiscoveryReport['healthProbe']['kind'],
    description: probeDescription
  }

  return { ok: true, report: parsed as GrokDiscoveryReport }
}
