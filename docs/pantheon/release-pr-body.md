# MERGE HOLD — staging → main (PAN-12 / Gate G)

Do **not** merge this PR until:

1. Windows manual matrix is executed on a real Windows desktop and recorded as pass (currently **pending-windows**).
2. Kelcee explicitly says yes.

This body is the release packet. Opening a draft PR is allowed. Silent main merge is not.

## Summary

Gate G release candidate for Pantheon Desktop. Coverage ledger, automated suite receipts, Playwright specs, and upstream pins are in-tree. Grok Bot product integration remains unavailable. Windows installer/update/rollback matrix has not been run on the Linux farm host.

## Completed tickets (PAN-1…11 + PAN-13)

| Ticket | Evidence |
| --- | --- |
| PAN-1 | Downstream shell — PR #2 `e5e3db418f` |
| PAN-2 | Key-safe Buzz bridge — PR #4 `ebdd6545a7` |
| PAN-3 | Durable buzz-acp binder pin `c11e582ec17293f0036f4363e1b26d2fdde86c71` (`BUZZ_ACP_PIN`) |
| PAN-4 | Unified rooms / agent editor — PR #13 `767673515e` |
| PAN-5 | Home / Needs You — PR #8 `5e33eaa95f` |
| PAN-6 | Cron Center — PR #12 `d8af85538e` |
| PAN-7 | Projects / PR rooms — PR #14 `a1df5c0709` |
| PAN-8 | Artifacts / search / memory / capabilities — PR #16 `ce48d466b2` |
| PAN-9 | Destination / HUD / voice / layouts — PR #17 `c4457e2f3b` |
| PAN-10 | Gate F Grok Bot **unavailable** — PR #19 `6c87ffcd90` |
| PAN-11 | Update preflight / rollback / compatibility — `3d6c5413c0` |
| PAN-13 | Standard hosted Windows runners — PR #11 `5b0e31bfe3` |
| PAN-12 | This coverage / receipts / e2e specs / MERGE HOLD packet |

## Gates

- Gate F Grok Bot: **unavailable** (not Done-by-substitution).
- Gate G Windows release proof: **HOLD** — automated Linux receipts only; Windows matrix pending.
- HOLD surfaces untouched: auth, billing, Telnyx, migrations, `.env`, keys, outbound send, customer data.

## Receipts

- Coverage ledger: `docs/pantheon/release-checklist.md` (128 spec IDs).
- Coverage test: `apps/desktop/src/pantheon/release-coverage.test.ts`.
- Upstream pins: `docs/pantheon/upstream-source-ledger.md`.
- Playwright specs: `apps/desktop/e2e/pantheon-*.spec.ts` (skip with reason when DISPLAY/dist missing).
- Windows CI: `.github/workflows/pantheon-windows.yml` (standard runners; not a manual-matrix PASS).

## Known unavailable

- Installed xAI Grok Bot product adapter (GROK-01…GROK-07).
- Windows manual install/update/rollback matrix (UPD-01…UPD-07, NFR-SEC-01 remainder, NFR-UX-01 remainder).

## Rollback

Use the existing PAN-11 machinery; do not invent a second updater:

- `hermes:updates:rollback` IPC in `apps/desktop/electron/main.ts`
- config/layout backup + restore in `apps/desktop/electron/pantheon-backup.ts`
- updater host `--rollback` handoff covered by `electron/updater-process.test.ts`

If this release is applied and must be undone: roll back to the previous working desktop build and its compatible configuration backup, then confirm Buzz owner key still lives only in OS credential storage.

## Merge authority

Kelcee retains staging→main merge authority for this release PR. Farm coder must not merge.
