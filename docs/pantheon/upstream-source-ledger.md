# Pantheon upstream source ledger

Records the exact Hermes and Buzz sources this downstream desktop is cut from.
Required by **UPD-08** and **NFR-COMP-01**. Update this file when either pin moves.

## Pins (as of staging `6c87ffcd90`)

| Source | Ref | Commit | Notes |
| --- | --- | --- | --- |
| Pantheon staging head | `origin/staging` | `6c87ffcd90cc0090b822d5e95751eeda9d47c433` | PAN-10 Gate F unavailable Grok Bot adapter (#19) |
| Hermes upstream snapshot | `refs/pull/92332/head` | `c584d15cdc31e1ebf3989c426ed05fb2ddb0c9fc` | Product-spec `source_snapshots.hermes_agent`. Exists as that PR head, not on upstream `main`. |
| Hermes fork main at cut | `ec44116d59` | `ec44116d596d798d6cb230825f1a635bc6dd38e9` | Staging was cut from this fork main (see `brand.ts` comment). |
| Buzz compatibility / protocol | spec snapshot | `0720f5380ce8a6c050afac159f8462c06cd51ab5` | Product-spec `source_snapshots.buzz`; `PANTHEON_PROVENANCE.buzzCompatibilityCommit`. |
| buzz-acp durable binder | `KLari1994/buzz` branch `pantheon` | `c11e582ec17293f0036f4363e1b26d2fdde86c71` | `BUZZ_ACP_PIN` in `apps/desktop/src/pantheon/buzz-client.ts`. Upstream PR https://github.com/block/buzz/pull/6682 |
| Downstream product repo | `github.com/KLari1994/pantheon-desktop` | this tree | `PANTHEON_PROVENANCE.downstreamRepoHttpsUrl` |

Runtime stamps: `apps/desktop/scripts/write-build-stamp.mjs` writes `install-stamp.json` with `commit`, `upstreamHermesCommit`, and `buzzCompatibilityCommit`.

## Known forks and patches

- Desktop identity is a Pantheon delta on Hermes Desktop (`productName` Pantheon, `appId` `com.syntropic.pantheon`). It is not Buzz Desktop.
- Grok Bot product adapter is capability-gated and currently **unavailable** (PAN-10 PR #19). No xAI model-API substitute is shipped.
- Local Buzz bridge is the signed sidecar under `pantheon/buzz-bridge/`; renderer never receives the owner private key.
- Windows CI runs on standard `windows-latest` hosted runners (PAN-13). That job is not a substitute for the Windows manual update/rollback matrix.

## How to refresh

1. Record the new Hermes and Buzz commits in `apps/desktop/src/pantheon/brand.ts` (`PANTHEON_PROVENANCE`).
2. Update this ledger with the new SHAs and why they moved.
3. Treat Hermes merge and Pantheon release as separate operations (UPD-08).
