# PAN-18 — Restore Pantheon Desktop lint gate on current main

lane: premium-farm
custom lane:premium-farm (drive registrar enum is pi)
base: main
worktree: /opt/data/worktrees/pantheon-desktop/PAN-18
branch: fix/PAN-18-restore-lint-gate
base_sha: cc41981edb754f1e524acf32064058f398461e7c
Linear: PAN-18
repo: https://github.com/KLari1994/pantheon-desktop
uuid: 64e6b198-e0a6-423b-b173-40b5854875ec
batch: b-pantheon-fullfix-20260825

## Summary
Restore the Pantheon Desktop JavaScript/TypeScript lint gate on current main without changing product behavior.

## Why
PR #28 (PAN-17) is locally green and candidate-only lint-clean, but GitHub CI fails because current main contains 278 pre-existing ESLint errors across 72 unchanged files. Inventory: /opt/data/worktrees/pantheon-desktop/PAN-17/.farm/lint-full-after-pan17.json

Top classes: 101 braces, 53 JSX prop ordering, 38 import ordering, 38 plugin restricted imports, 30 named-import ordering.

## Acceptance criteria
- On exact worktree at current main, npm -w apps/desktop run lint exits 0 with zero errors; warnings may remain.
- Repair all 278 current errors across the 72 inventoried files. Safe mechanical changes for braces/import/export/JSX order and type-only imports.
- Resolve 38 no-restricted-imports plugin violations by moving required host capabilities behind existing @hermes/plugin-sdk generic surface or ticket-scoped existing seam. Do not disable the rule, blanket-ignore plugin directories, or special-case Pantheon in core.
- Preserve runtime behavior. No feature expansion.
- electron/hardening.ts/test and updater preflight/store files are PROTECTED: no edits until Kelcee explicitly approves formatting/import-only work there. If these appear in the 72, STOP and escalate with file list.
- PR targets base=main.

## Verification
- npm -w apps/desktop run lint — zero errors
- npm -w apps/desktop run typecheck
- npm -w apps/desktop run check if feasible
- Full Pantheon focused tests plus tests for any SDK surface widened
- git diff --check
- Green GitHub JS and TS checks on exact head

## Out of scope
- Fixing warnings after zero errors
- Feature work from PAN-15/16/14
- Changing lint rules, disabling lint, raising thresholds, broad ignores

## HOLD
auth billing Telnyx migrations .env keys outbound send production/customer data
hardening*/pantheon-update-preflight*/src/store/updates.ts without Kelcee yes

planner: claude-fable-5 read-only
coder: grok-4.6 high / xai-oauth
reviewer: claude-fable-5 read-only
documenter: grok-4.6 high / xai-oauth
verify: npm -w apps/desktop run lint (0 errors) + typecheck + focused tests
done: gate green + Fable PASS + Grok docs + PR; merge authority Kelcee unless batch grant expanded
