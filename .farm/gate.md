# PAN-18 independent gate (Daedalus)

observed_at: 2026-08-25T14:39:00Z
worktree: /opt/data/worktrees/pantheon-desktop/PAN-18
branch: fix/PAN-18-restore-lint-gate
base: main @ cc41981edb754f1e524acf32064058f398461e7c
head: uncommitted on top of cc41981edb (coder session 20260825_141107_fb4518)
coder: FARM_DONE coder @ 2026-08-25T14:27Z (grok-4.6 / xai-oauth)

## Commands run by Daedalus (not the coder pane)

### 1) HOLD path touch check
```
git diff --name-only | grep -E 'hardening|pantheon-update-preflight|src/store/updates\.ts'
→ empty (HOLD paths clean)
```

### 2) git diff --check
exit 0

### 3) npm -w apps/desktop run lint -- --quiet
exit 1 — **exactly 8 errors, all on ticket-protected HOLD files**, all `--fix`-able:

1. electron/hardening.test.ts:28 — perfectionist/sort-named-imports
2. electron/hardening.ts:12 — perfectionist/sort-imports
3. electron/hardening.ts:637 — perfectionist/sort-named-exports
4. electron/hardening.ts:640 — perfectionist/sort-named-exports
5. electron/hardening.ts:643 — perfectionist/sort-named-exports
6. electron/pantheon-update-preflight.test.ts:2 — unused-imports/no-unused-imports
7. src/store/updates.ts:17 — perfectionist/sort-imports
8. src/store/updates.ts:22 — perfectionist/sort-imports

Non-HOLD inventory: **0 errors** (270/68 files cleared by coder).

### 4) npm -w apps/desktop run typecheck
exit 0

### 5) vitest (focused)
- src/sdk/plugin-host-surface.test.ts → 4/4 pass
- src/plugins/pantheon-workspace (48 files) → 258/258 pass
exit 0

### 6) Diff scope
67 files changed, +773/-354 (includes renames home-* / search-page / hidden-session to plugin-root paths for no-restricted-imports). package-lock not dirty.

## Gate decision

**FAIL (HOLD residual)** — ticket AC requires `lint` exit 0. Residual 8 errors are formatting-only on files the ticket marks PROTECTED without Kelcee yes.

Blocker owner: Kelcee
Escalation (already open, no duplicate): **kq:29fdaaa8**
  "PAN-18: approve formatting-only edits on 4 protected Pantheon files…"

Unblock path after yes:
1. ESLint --fix only the 4 HOLD paths (or accept mechanical import/export order + drop unused path import)
2. Re-run this gate → expect lint 0
3. premium-farm-reviewer → documenter → PR base=main
4. Then PAN-17 PR #28 can land; PAN-15/16/14 serial-hold lifts in order

## Not claimed
- FARM_DONE gate (withheld — AC not met)
- PR opened
- Review run
- Merge

HOLD residual blocks green gate. Non-HOLD work is verified green.
