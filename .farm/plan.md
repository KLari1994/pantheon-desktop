# PAN-18 plan (Sol fallback — Fable spend-limited 2026-08-25T14:08Z)

planner_source: GPT-5.6 Sol fallback after claude-fable-5 returned org monthly spend limit
worktree: /opt/data/worktrees/pantheon-desktop/PAN-18
branch: fix/PAN-18-restore-lint-gate
base: main @ cc41981edb754f1e524acf32064058f398461e7c
inventory: .farm/lint-inventory-summary.json (+ full baseline .farm/lint-baseline.json from PAN-17 capture)

## Goal
Make `npm -w apps/desktop run lint` exit 0 with **zero errors** on current main. Warnings may remain. No product behavior change. PR base=main.

## Error classes (278 / 72 files)

| rule | count | fix class |
|---|---:|---|
| curly | 101 | add braces to single-line if/for/while |
| perfectionist/sort-jsx-props | 53 | reorder JSX props per rule |
| perfectionist/sort-imports | 38 | reorder import groups/lines |
| no-restricted-imports | 38 | route plugin code through `@hermes/plugin-sdk` (or existing generic seam) — **not** disable rule / blanket ignore |
| perfectionist/sort-named-imports | 30 | sort named import identifiers |
| @typescript-eslint/consistent-type-imports | 9 | `import type` where required |
| perfectionist/sort-exports | 4 | export order |
| perfectionist/sort-named-exports | 3 | named export order |
| unused-imports/no-unused-imports | 2 | remove unused import |

## PROTECTED surfaces (ticket HOLD — Kelcee yes required)

These 4 files are in the 278 inventory but **must not be edited without Kelcee approval**:

1. `apps/desktop/electron/hardening.ts` (4) — import/named-export order only
2. `apps/desktop/electron/hardening.test.ts` (1) — named-import order only
3. `apps/desktop/electron/pantheon-update-preflight.test.ts` (1) — unused import only
4. `apps/desktop/src/store/updates.ts` (2) — import order only

**Coder rule:** fix the other **68 files / 270 errors** first. Leave protected paths untouched. If residual errors are only these 8, stop with `FARM_DONE coder` + residual list; Daedalus escalates Kelcee for formatting-only approval rather than crossing HOLD.

## Implementation order

1. **Mechanical autofix batch (safe):** run ESLint with `--fix` **only** on the non-protected error files (explicit path list from inventory). Accept only curly / perfectionist / consistent-type-imports / unused-imports fixes. Inspect diff; no logic changes.
2. **no-restricted-imports (38):** do **not** autofix blindly.
   - For each violation, identify the forbidden import.
   - Prefer existing `@hermes/plugin-sdk` export.
   - If missing capability: add **minimal generic** SDK export + unit test (plugin boundary doctrine). No private `@/` imports from `pantheon-workspace/**`. No Node APIs leaked to renderer.
   - Group fixes by symbol; one commit-quality logical change set.
3. **Re-run lint** on full desktop workspace. Target: 0 errors outside protected files; ideally 0 total if protected somehow clean on this main (re-verify — do not assume inventory stale).
4. **typecheck** `npm -w apps/desktop run typecheck`.
5. **Focused tests:** desktop vitest suite (or at least packages touched by SDK widening + any file with non-mechanical edits).
6. **git diff --check**. HOLD greps empty on auth/billing/etc.

## Will not touch
- Lint rule config / thresholds / eslint-disable blast radius
- PAN-14/15/16/17 product features
- Provider defaults, telemetry, generated snapshots
- Protected files listed above without Kelcee yes

## Verification (exact)
```sh
npm -w apps/desktop run lint          # 0 errors
npm -w apps/desktop run typecheck
# if feasible:
npm -w apps/desktop run check
# tests for any SDK surface widened + broad desktop vitest if time-bounded
git diff --check
```

## Rollback
- Single branch `fix/PAN-18-restore-lint-gate` off `cc41981edb`.
- Intermediate safe point after mechanical autofix commit.
- Full rollback = reset branch to `origin/main`.

## Risks
- Autofix reordering changes runtime only if code depended on import side-effects — rare; watch electron main entry and store init files.
- SDK widening must stay generic and tested.
- Protected residual may block "zero errors" AC until Kelcee approves 8 mechanical edits.

## BLOCKED items
- None for starting non-protected work.
- Protected 8 errors: **Kelcee formatting approval** (filed separately if still residual after main pass).

FARM_DONE planner
