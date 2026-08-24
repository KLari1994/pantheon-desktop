import {
  validateDiscoveryReport,
  type GrokDiscoveryReport
} from './discovery-report'

export const GROK_UNAVAILABLE_REASONS = {
  missing: 'UNAVAILABLE — discovery report missing',
  failed: 'UNAVAILABLE — discovery report failed',
  unsupportedHost: 'UNAVAILABLE — Grok Bot product discovery is unsupported on this host',
  noSurface: 'UNAVAILABLE — installed product exposes no supported adapter surface'
} as const

export type GrokProductStatus = {
  available: boolean
  productVersion?: string
  reason?: string
}

export type GrokProductMessageEvent = {
  roomId?: string
  messageId: string
  text: string
}

export type GrokProductTransport = {
  sendDirect(text: string): Promise<{ messageId: string }>
  inviteToRoom(roomId: string): Promise<void>
  removeFromRoom(roomId: string): Promise<void>
  sendRoomMessage(roomId: string, text: string): Promise<{ messageId: string }>
  onMessage(listener: (event: GrokProductMessageEvent) => void): () => void
}

export interface GrokProductAdapter {
  status(): Promise<GrokProductStatus>
  sendDirect(text: string): Promise<{ messageId: string }>
  inviteToRoom(roomId: string): Promise<void>
  removeFromRoom(roomId: string): Promise<void>
  sendRoomMessage(roomId: string, text: string): Promise<{ messageId: string }>
  onMessage(listener: (event: GrokProductMessageEvent) => void): () => void
}

export type GrokProductAdapterOptions = {
  report?: unknown
  transport?: GrokProductTransport | null
  discoveryHost?: string
}

function currentDiscoveryHost(explicit?: string): string {
  if (explicit) {
    return explicit
  }

  return typeof process !== 'undefined' && process.platform === 'win32'
    ? 'windows-workstation'
    : 'linux-vps'
}

function unavailableStatus(reason: string): GrokProductStatus {
  return { available: false, reason }
}

export function resolveGrokProductStatus(
  options: GrokProductAdapterOptions = {}
): GrokProductStatus {
  const host = currentDiscoveryHost(options.discoveryHost)
  const unsupportedHost = host !== 'windows-workstation'

  if (options.report === undefined) {
    return unavailableStatus(
      unsupportedHost ? GROK_UNAVAILABLE_REASONS.unsupportedHost : GROK_UNAVAILABLE_REASONS.missing
    )
  }

  const validated = validateDiscoveryReport(options.report)
  if (!validated.ok) {
    return unavailableStatus(GROK_UNAVAILABLE_REASONS.noSurface)
  }

  const report: GrokDiscoveryReport = validated.report
  if (report.result !== 'pass') {
    return unavailableStatus(GROK_UNAVAILABLE_REASONS.failed)
  }

  if (!options.transport) {
    return unavailableStatus(GROK_UNAVAILABLE_REASONS.noSurface)
  }

  return {
    available: true,
    productVersion: report.productVersion
  }
}

export function createGrokProductAdapter(
  options: GrokProductAdapterOptions = {}
): GrokProductAdapter {
  const transport = options.transport ?? null

  const requireAvailable = async () => {
    const status = resolveGrokProductStatus(options)
    if (!status.available || !transport) {
      throw new Error(status.reason || GROK_UNAVAILABLE_REASONS.noSurface)
    }

    return transport
  }

  return {
    async status() {
      return resolveGrokProductStatus(options)
    },
    async sendDirect(text) {
      return (await requireAvailable()).sendDirect(text)
    },
    async inviteToRoom(roomId) {
      await (await requireAvailable()).inviteToRoom(roomId)
    },
    async removeFromRoom(roomId) {
      await (await requireAvailable()).removeFromRoom(roomId)
    },
    async sendRoomMessage(roomId, text) {
      return (await requireAvailable()).sendRoomMessage(roomId, text)
    },
    onMessage(listener) {
      if (!transport || !resolveGrokProductStatus(options).available) {
        return () => undefined
      }

      return transport.onMessage(listener)
    }
  }
}
