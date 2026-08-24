/**
 * Single source of Pantheon's downstream identity. package.json build config
 * and electron/*.ts cannot import this module (electron's composite tsconfig
 * only includes electron/), so brand.test.ts pins their literals to these
 * values — edit here first, then update the mirrored literals it names.
 */
export const PANTHEON_BRAND = {
  productName: 'Pantheon',
  appId: 'com.syntropic.pantheon',
  protocol: 'pantheon',
  artifactPrefix: 'Pantheon',
  agentRuntime: 'hermes'
} as const

/**
 * Source provenance shipped inside every build (NFR-COMP-01 / UPD-08).
 * The downstream commit is stamped at build time by
 * scripts/write-build-stamp.mjs into install-stamp.json (`commit`).
 * That script also persists these two upstream pins as
 * `upstreamHermesCommit` and `buzzCompatibilityCommit`.
 * Note: the Hermes pin exists upstream only as refs/pull/92332/head, not on
 * upstream main; staging was cut from fork main ec44116d596d798d6cb230825f1a635bc6dd38e9.
 */
export const PANTHEON_PROVENANCE = {
  downstreamRepoHttpsUrl: 'https://github.com/KLari1994/pantheon-desktop.git',
  downstreamRepoCanonical: 'github.com/klari1994/pantheon-desktop',
  upstreamHermesCommit: 'c584d15cdc31e1ebf3989c426ed05fb2ddb0c9fc',
  upstreamHermesRef: 'refs/pull/92332/head',
  buzzCompatibilityCommit: '0720f5380ce8a6c050afac159f8462c06cd51ab5'
} as const
