# Pantheon release checklist

Gate G coverage ledger. Status values: `pass` | `partial` | `unavailable` | `pending-windows`.
Windows installer/update/rollback matrix is **not** executed on the Linux farm host.
Grok Bot product integration remains **unavailable** (PAN-10 PR #19). Do not treat substitution as Done.

Product spec: `/opt/data/dispatch/2026-08-24-pantheon-product-spec.md` (128 bold IDs).
Staging head recorded at plan time: `6c87ffcd90cc0090b822d5e95751eeda9d47c433`.

## Requirement coverage

| ID | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| FND-01 | Pantheon ships as a Windows Electron distribution based on Hermes Desktop. | pass | PAN-1 PR #2; apps/desktop/package.json productName Pantheon; .github/workflows/pantheon-windows.yml |
| FND-02 | Release inherits Hermes gateway/session behavior; no second agent runtime. | pass | PAN-1 PR #2; apps/desktop/src/pantheon/brand.ts agentRuntime hermes |
| FND-03 | Stock Buzz relay/protocol/identity remain compatible and upstream. | pass | apps/desktop/src/pantheon/buzz-client.ts BUZZ_ACP_PIN + NFR-COMP-03 |
| FND-04 | Named Hermes Desktop behaviors are protected by parity regression tests. | pass | apps/desktop/src/pantheon/parity-contract.ts + parity-contract.test.ts |
| FND-05 | Pantheon state keys are namespaced and scoped. | pass | PAN-1 PR #2; apps/desktop/src/pantheon/brand.ts appId com.syntropic.pantheon |
| FND-06 | Preserves prompt caching; rooms/chrome do not mutate past context. | pass | PAN-1 PR #2; inherited Hermes session contract + AGENTS.md cache rule |
| BOT-01 | Every Hermes profile has one canonical hidden-capable Bot Chat. | pass | PAN-4 #13; src/plugins/hermes-bots + canonical-chat-registry tests |
| BOT-02 | Clicking a pet opens that Bot Chat without merging room history. | pass | PAN-4 #13; hermes-bots plugin + parity bot-chat probe |
| BOT-03 | Hiding a bot removes roster row without disabling work. | pass | PAN-4 #13; src/plugins/hermes-bots/tests/hide-bots.test.mjs |
| BOT-04 | One Agent Editor writes the real Hermes profile. | pass | PAN-4 #13; pantheon-workspace rooms + agent editor surfaces |
| BOT-05 | Agent Editor writes route to the exact profile and machine. | pass | PAN-4 #13 + PAN-7 #14 machine-target tests |
| BOT-06 | Bot Mode Routines pane is absent; Cron Center is the scheduler. | pass | PAN-4 #13 BOT-06 comment in hermes-bots/plugin.js; PAN-6 Cron Center |
| BOT-07 | Hermes-local group-chat creation is absent; Buzz Rooms replace it. | pass | PAN-4 #13; rooms replace local groups |
| ROOM-01 | Room rows are Buzz-backed with pets, preview, unread, Needs You. | pass | PAN-4 #13; src/plugins/pantheon-workspace/rooms/room-list.tsx + tests |
| ROOM-02 | Offices, projects, PR rooms, temporary rooms share one room UI. | pass | PAN-4 #13 + PAN-7 PR rooms on same /rooms surface |
| ROOM-03 | Direct bot rows open Bot Chats; group rows open Buzz rooms. | pass | PAN-4 #13; rooms store + hidden-session tests |
| ROOM-04 | Room supports messages, attachments, reactions, threads, members. | pass | PAN-4 #13; room-workspace.tsx + room-workspace.test.tsx |
| ROOM-05 | Temporary rooms retain Buzz TTL and show expiry. | pass | PAN-4 #13; rooms types/store TTL fields + tests |
| ROOM-06 | Room send signs through local Buzz bridge; renderer never gets the key. | pass | PAN-2 PR #4; pantheon-buzz-ipc + buzz-client |
| ROOM-07 | History/membership reconcile from relay after reconnect. | pass | PAN-2 PR #4 + PAN-4 rooms store reconnectKeepPending |
| ROOM-08 | Hidden internal agent member sessions never appear in Sessions. | pass | PAN-4 #13; rooms/hidden-session.test.ts |
| ROOM-09 | Advanced diagnostics show binding, profile, session IDs, machine. | pass | PAN-4 #13; rooms/room-diagnostics.tsx + room-diagnostics.test.ts |
| SES-01 | Binder persists composite room binding before first Hermes turn. | pass | PAN-3 pin BUZZ_ACP_PIN in buzz-client.ts; room-session owned by buzz-acp store |
| SES-02 | Existing binding resumes; missing binding creates one hidden session. | pass | BUZZ_ACP_PIN + rooms hidden-session.test.ts |
| SES-03 | Restart of buzz-acp/desktop/gateway does not fork room history. | pass | BUZZ_ACP_PIN durable SQLite store; rooms reconnect tests |
| SES-04 | Deleted/inaccessible session is recoverable; no silent parallel history. | pass | rooms hidden-session + diagnostics binding health |
| SES-05 | Duplicate relay deliveries are idempotent by event ID. | pass | PAN-4 rooms store ingestEvent idempotency tests |
| SES-06 | Newer room message may steer only via interrupt contract. | pass | inherited Hermes interrupt/steer; rooms live ingest |
| SES-07 | Bot Chat branch is a Hermes tab; room-thread branch stays Buzz. | pass | PAN-9 PR #17; inherited branching + rooms threads |
| SES-08 | Filesystem checkpoints stay scoped and require preview + approval. | pass | PAN-9 PR #17; parity checkpoints probe |
| SURF-01 | Quick Entry remembers last Destination and can change before send. | pass | PAN-9 PR #17; src/pantheon/destination.ts + destination.test.ts |
| SURF-02 | HUD preserves Hermes Desktop chat surface and handoff. | pass | PAN-9 PR #17; src/app/hud + parity hud probe |
| SURF-03 | Browser/computer use preserves Hermes behavior; no real-cursor automation. | pass | PAN-9 PR #17; computer-use-status parity probe |
| SURF-04 | Chat-adjacent tabs: browser, computer, terminal, preview, file, review, project, canvas, cron, artifacts. | pass | PAN-7 #14 work-surfaces.tsx + work-surfaces.test.ts |
| SURF-05 | Every work surface identifies its machine target. | pass | PAN-7 #14 machine-target.tsx + machine-target.test.tsx |
| SURF-06 | Voice dictation available in Bot Chats and rooms. | pass | PAN-9 PR #17; composer voice + room composer |
| SURF-07 | Spoken replies per-agent, direct-chat-only by default. | pass | PAN-9 PR #17; voice controls + notification policy |
| MODEL-01 | Hermes chats retain per-session provider/model/reasoning/fast-mode. | pass | PAN-9 PR #17; model-catalog-menu + inherited session model |
| MODEL-02 | Changing a chat model never silently changes the profile default. | pass | PAN-9 PR #17; inherited per-session model controls |
| MODEL-03 | One global curated visibility list per provider. | pass | PAN-9 PR #17; model catalog |
| MODEL-04 | Per-agent default models supported; no per-agent hidden-model lists. | pass | PAN-9 PR #17 + PAN-4 agent editor |
| MODEL-05 | Claude/Codex/other runtimes use provider-specific controls. | pass | inherited Hermes provider controls; PAN-9 |
| MODEL-06 | Grok Bot shows runtime badge and has no Hermes model picker. | pass | PAN-10 PR #19 grok-status.tsx; no model picker on /grok |
| MODEL-07 | Status bar retains context, worktree, approval, timers, machine, Command Center. | pass | PAN-9 PR #17; model-status-bar parity probe |
| APP-01 | Approval request renders inline and in Needs You as one logical card. | pass | PAN-5 PR #8; needs-you approval-projections + tests |
| APP-02 | Choices are Allow once, Allow for this session, Deny. | pass | PAN-5 PR #8; approval-card.tsx + approval-card.test.tsx |
| APP-03 | Per-session YOLO remains visible; no estate-wide approve-all. | pass | PAN-5 PR #8; inherited YOLO + no global approve control |
| APP-04 | Approval cards name agent, room/session, action, and machine. | pass | PAN-5 PR #8; approval-projections.test.ts |
| APP-05 | Answering either copy resolves the backend request once. | pass | PAN-5 PR #8; approval-inbox.test.tsx |
| APP-06 | Only action-worthy events notify; ordinary chatter is quiet. | pass | PAN-5 PR #8; notifications/policy.test.ts |
| APP-07 | Mute controls exist per bot and room without disabling work. | pass | PAN-5 PR #8; notifications/mutes.test.ts |
| HOME-01 | Home is an on-demand inbox, not a forced startup dashboard. | pass | PAN-5 PR #8; plugin.test.tsx /home not NEW_CHAT_ROUTE |
| HOME-02 | Sections are Needs You, Working, Stalled/Failed, Today. | pass | PAN-5 PR #8; home projections + home-page.test.tsx |
| HOME-03 | Each item links to its exact source. | pass | PAN-5 PR #8; home/navigation.ts + tests |
| HOME-04 | Home combines projections; no competing task database. | pass | PAN-5 PR #8; home/sources.ts collector |
| HOME-05 | Healthy background activity does not create Home noise. | pass | PAN-5 PR #8; home store noise tests |
| CRON-01 | Cron Center reads/mutates existing Hermes cron jobs. | pass | PAN-6 PR #12; cron-center api/store |
| CRON-02 | List aggregates across profiles/connections with owner routing. | pass | PAN-6 PR #12; cron-center-page.test.tsx |
| CRON-03 | Row shows owner, schedule, model, next/last run, delivery, streak. | pass | PAN-6 PR #12; cron-center i18n + page tests |
| CRON-04 | Last result distinguishes healthy, silent, failed, needs attention. | pass | PAN-6 PR #12; cron-center result mapping tests |
| CRON-05 | Expanded detail shows source, receipts, bounded history. | pass | PAN-6 PR #12; cron-center detail |
| CRON-06 | Actions: Run now, Edit, Pause/Resume, Open owner chat. | pass | PAN-6 PR #12; cron-center actions |
| CRON-07 | Script-only jobs show No agent and do not claim a model. | pass | PAN-6 PR #12; cron-center-page.test.tsx |
| CRON-08 | Failed writes roll back optimistic UI. | pass | PAN-6 PR #12; cron-center store tests |
| CRON-09 | Row health from persisted job state plus execution ledger. | pass | PAN-6 PR #12; cron-center health derivation |
| PROJ-01 | Projects bind repo(s), branch, worktrees, rooms, roster, artifacts. | pass | PAN-7 PR #14; projects/store.ts + store.test.ts |
| PROJ-02 | PR room presents conversation, diff, preview, files, terminal, artifacts, merge packet. | pass | PAN-7 PR #14; pr-room.tsx + pr-room.test.tsx |
| PROJ-03 | PR room binds one worktree and one target branch. | pass | PAN-7 PR #14; worktree-branch-status e2e + project tests |
| PROJ-04 | Lifecycle create/open → work → review-ready → review → merged/closed → archive. | pass | PAN-7 PR #14; pr-lifecycle.ts + pr-lifecycle.test.ts |
| PROJ-05 | Talos review/merge evidence appear; app does not invent merge authority. | pass | PAN-7 PR #14; pr-room merge packet is evidence-only |
| PROJ-06 | Room archive preserves Buzz history and artifact provenance. | pass | PAN-7 PR #14; pr-lifecycle archive |
| PROJ-07 | Linear remains tracking; app may deep-link, does not rewrite Linear. | pass | PAN-7 PR #14; no Linear write client in desktop delta |
| ART-01 | Artifacts Library filters by agent, office, project, PR, room, session, machine, type. | pass | PAN-8 PR #16; artifacts + search filters |
| ART-02 | Every artifact shows producing bot/session/room and jumps to source. | pass | PAN-8 PR #16; artifacts library |
| ART-03 | Selecting an artifact previews beside chat without stealing focus. | pass | PAN-8 PR #16; artifact preview |
| ART-04 | PR rooms expose a scoped artifact list. | pass | PAN-8 PR #16 + PAN-7 PR room artifacts tab |
| ART-05 | Remote paths resolve through owning connection; no silent retarget. | pass | PAN-8 PR #16 + PAN-7 machine-target |
| SEARCH-01 | Global search spans Sessions, Bots, Rooms and labels source/machine. | pass | PAN-8 PR #16; search/sources.test.ts + federation.test.ts |
| SEARCH-02 | Advanced session search can include hidden internals, off by default. | pass | PAN-8 PR #16; search sources hidden-session flag |
| MEM-01 | Memory Graph remains an on-demand route. | pass | PAN-8 PR #16; /memory MemoryPage + plugin route |
| MEM-02 | Default scope is active bot; All Pantheon aggregates without merging private memories. | pass | PAN-8 PR #16; memory/scope.ts + scope.test.ts |
| MEM-03 | Existing edit/archive/delete safeguards remain. | pass | PAN-8 PR #16; inherited memory safeguards |
| CAP-01 | Skills/tools/MCP/keys/providers use existing Hermes surfaces and profile routing. | pass | PAN-8 PR #16; capability-embed |
| CAP-02 | Agent Editor embeds existing surfaces; does not fork behavior. | pass | PAN-8 PR #16; memory/capability-embed |
| GROK-01 | Direct Grok Bot chat when installed adapter is healthy. | unavailable | PAN-10 PR #19; Gate F adapter UNAVAILABLE — no product integration surface |
| GROK-02 | Grok joins a room only through explicit invitation. | unavailable | PAN-10 PR #19; capability not implemented without adapter |
| GROK-03 | Grok absent from PR/private rooms unless explicitly added. | unavailable | PAN-10 PR #19 |
| GROK-04 | Messages display a Grok Bot runtime badge. | unavailable | PAN-10 PR #19; no live Grok messages without adapter |
| GROK-05 | Agent Editor exposes only avatar, display name, room permissions for Grok. | unavailable | PAN-10 PR #19 |
| GROK-06 | Hermes/Pantheon never author or schedule Grok Bot prompts/routines. | unavailable | PAN-10 PR #19; honest unavailable, not a model-API substitute |
| GROK-07 | Adapter must prove supported local product surface; no built-in-model fallback. | unavailable | PAN-10 PR #19 grok-status.tsx reports UNAVAILABLE |
| CUST-01 | Preserve built-in and VS Code Marketplace theme support. | pass | PAN-9 PR #17; inherited themes/presets.ts |
| CUST-02 | Global settings include density, fonts, icons, accent. | pass | PAN-9 PR #17; inherited settings |
| CUST-03 | Each agent may have a pet/avatar and accent color. | pass | PAN-4/PAN-9; pets + agent editor |
| CUST-04 | Saved pane layouts for direct chat, office, project, PR room. | pass | PAN-9 PR #17; layout-presets.ts + layout-presets.test.ts |
| CUST-05 | Kelcee may reorder/hide navigation sections; nouns remain recoverable. | pass | PAN-5/PAN-9 nav customization |
| CUST-06 | Reset to Pantheon defaults restores shipped navigation and layouts. | pass | PAN-9 PR #17; layout-presets reset |
| CUST-07 | Arbitrary per-room CSS is not supported. | pass | PAN-9 PR #17; no per-room CSS surface shipped |
| UPD-01 | Pantheon shows an update badge and never silently restarts. | pending-windows | PAN-11 3d6c5413c0 code present; Windows installer/update matrix not executed on Linux farm |
| UPD-02 | Update preflight checks agents, streams, terminals, Computer Use, drafts, bridge. | pending-windows | PAN-11 updater preflight; Windows matrix HOLD |
| UPD-03 | If activity status unavailable or work active, update defers. | pending-windows | PAN-11 deferral; Windows matrix HOLD |
| UPD-04 | Configuration, mappings, layouts, bindings backed up before apply. | pending-windows | PAN-11 electron/pantheon-backup.ts; Windows matrix HOLD |
| UPD-05 | Compatibility checks: Pantheon/Hermes API, Buzz bridge, relay, ACP binder. | pending-windows | PAN-11 compatibility receipts; Windows matrix HOLD |
| UPD-06 | Sessions, panes, terminals, layouts survive a successful update. | pending-windows | PAN-11 restore path; Windows matrix HOLD |
| UPD-07 | One-click rollback restores previous working build and config backup. | pending-windows | PAN-11 hermes:updates:rollback + pantheon-backup.ts; Windows matrix HOLD |
| UPD-08 | Upstream Hermes merges and Pantheon releases are separate with recorded commits. | pass | PAN-1 + brand.ts PANTHEON_PROVENANCE; docs/pantheon/upstream-source-ledger.md |
| NFR-SEC-01 | Buzz owner private key stays in OS-protected storage; never copied to VPS/renderer/logs. | pending-windows | PAN-2 PR #4 key-safe bridge; Windows Credential Manager proof is pending-windows |
| NFR-SEC-02 | VPS agents use their own scoped Buzz identities. | pass | PAN-2 PR #4; no owner key on VPS |
| NFR-SEC-03 | Local bridge IPC is typed, allowlisted, size-validated; adapters pinned. | pass | PAN-2 PR #4; electron/pantheon-buzz-ipc.test.ts |
| NFR-SEC-04 | Remote paths resolve through explicit connection/machine; no write redirect. | pass | PAN-7 #14 machine-target + ART-05 |
| NFR-SEC-05 | Auth, billing, Telnyx, migrations, .env, platform keys remain HOLD. | pass | PAN-12 ticket HOLD; no HOLD-surface product edits in this batch |
| NFR-SEC-06 | Secrets are redacted from diagnostics and test fixtures. | pass | PAN-2; src/pantheon/security/redaction.test.ts |
| NFR-REL-01 | Reconnects converge from durable truth without duplicate agent replies. | pass | rooms reconnect + SES binder pin |
| NFR-REL-02 | Room send is optimistic and visibly fails/rolls back. | pass | PAN-2 PR #4; rooms store pending/rollback |
| NFR-REL-03 | Session binder writes are transactional with single-writer locking. | pass | BUZZ_ACP_PIN buzz-acp SQLite store |
| NFR-REL-04 | Background refresh merges caches and cannot replace foreground context. | pass | PAN-2 PR #4 + home ingest merge |
| NFR-REL-05 | Retries are bounded and end in a visible recovery action. | pass | PAN-2 PR #4; rooms/diagnostics recovery |
| NFR-PERF-01 | Initial shell stays interactive while Home/Rooms/Projects hydrate. | pass | PAN-2/PAN-5 background hydrate |
| NFR-PERF-02 | Room and artifact lists virtualize at session-list scale. | pass | PAN-4/PAN-8 list virtualization |
| NFR-PERF-03 | High-frequency stream events coalesce; Needs You flushes immediately. | pass | PAN-2 PR #4 + PAN-5 notifications coordinator |
| NFR-PERF-04 | Hidden tabs and inactive terminals preserve state without continuous layout. | pass | PAN-9 PR #17; inherited pane persistence |
| NFR-UX-01 | All icon-only actions have accessible names and keyboard access. | partial | Many icon controls have aria-label (titlebar, rooms, artifacts). Full Windows keyboard/a11y matrix not executed on this Linux farm. |
| NFR-UX-02 | Color is not the sole indicator for machine, health, unread, Needs You. | pass | PAN-5 PR #8; text labels + aria on unread/health |
| NFR-UX-03 | Follows Hermes DESIGN.md: flat surfaces, tokens, no one-off renderers. | pass | PAN-1 PR #2; DESIGN.md inheritance |
| NFR-UX-04 | No background event steals focus or opens a pane without user intent. | pass | PAN-5 PR #8; notification coordinator |
| NFR-COMP-01 | Records exact Hermes and Buzz source commits for every release. | pass | brand.ts PANTHEON_PROVENANCE + docs/pantheon/upstream-source-ledger.md |
| NFR-COMP-02 | Compatibility fallbacks are capability-detected, narrow, and tested. | pass | PAN-11 compatibility receipts + tests |
| NFR-COMP-03 | Stock Buzz clients continue to read/write Pantheon rooms. | pass | no private collaboration event kinds; BUZZ_ACP_PIN + rooms protocol |

## Automated suite receipts (Linux farm)

Filled by the PAN-12 coder after local commands. Do not invent Windows PASS.

| Suite | Command | Result | Notes |
| --- | --- | --- | --- |
| typecheck | `npm -w apps/desktop run typecheck` | pass | rc=0 (2026-08-24T20:31Z) |
| release-coverage | `npm -w apps/desktop exec vitest run src/pantheon/release-coverage.test.ts` | pass | 4/4 tests, rc=0 (2026-08-24T20:31Z) |
| lint | `npm -w apps/desktop run lint` | fail | rc=1; 897 problems (276 errors, 621 warnings) — baseline debt; new coverage files 0 errors |
| test:ui | `npm -w apps/desktop run test:ui` | timeout | killed after ~420s on Linux farm; no pass claimed |
| desktop e2e | Playwright `e2e/pantheon-*.spec.ts` | skipped | 7 skipped, rc=0; DISPLAY/WAYLAND unset on Linux farm |
| cargo buzz-bridge | `cargo test --manifest-path pantheon/buzz-bridge/Cargo.toml --tests` | skipped | `cargo` not on PATH (rc=1 from missing toolchain) |
| Windows pack / NSIS / manual matrix | Windows desktop host | pending-windows | Linux farm cannot execute |

## Windows manual matrix

Status: **pending-windows**. Required on a real Windows desktop before staging→main merge:

1. Fresh install of unsigned/signed Pantheon build.
2. Update badge appears; no silent restart (UPD-01).
3. Preflight defers while work is active (UPD-02/UPD-03).
4. Successful update preserves sessions/panes/terminals (UPD-06).
5. One-click rollback restores previous build + config (UPD-07).
6. Credential Manager still holds the Buzz owner key (NFR-SEC-01).
7. Keyboard access for icon-only actions (NFR-UX-01 remainder).

MERGE HOLD until this matrix plus Kelcee yes.

