PAN-18 coder pass is in the isolated worktree. Non-HOLD lint is clean; 8 HOLD-file errors remain by design.

Worktree: /opt/data/worktrees/pantheon-desktop/PAN-18
Branch: fix/PAN-18-restore-lint-gate @ cc41981edb (uncommitted; not pushed)

What landed
- Mechanical ESLint --fix on the 68 non-HOLD inventory files (curly, perfectionist, type-only imports, unused imports).
- 38 no-restricted-imports: host symbols now come from @hermes/plugin-sdk; plugin-internal ../ imports lifted to plugin-root ./ paths (home-*, search-page, hidden-session.test).
- SDK widening + test: apps/desktop/src/sdk/plugin-host-surface.test.ts (red 4/4, then green 4/4).

Checks (this session)
- npm -w apps/desktop run lint -- --quiet → 8 errors, all HOLD files
- npm -w apps/desktop run typecheck → exit 0
- vitest: 50 files, 289 passed (plugin-host-surface + pantheon-workspace + sdk/index + quick-entry)
- git diff --check → clean
- Protected paths untouched; package-lock.json reverted (npm-install noise)

HOLD residual (needs formatting-only yes; not edited)
1. electron/hardening.ts — 4 (import/named-export order)
2. electron/hardening.test.ts — 1 (named-import order)
3. electron/pantheon-update-preflight.test.ts — 1 (unused import)
4. src/store/updates.ts — 2 (import order)

Ticket AC “lint exit 0” is blocked on those 8 until HOLD is lifted. Warnings remain (out of scope).

FARM_DONE coder
