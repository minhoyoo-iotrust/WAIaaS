---
phase: 373
plan: "01"
subsystem: daemon
tags: [polymarket, admin-settings, rest-api, daemon-boot]
dependency_graph:
  requires: [371-04, 372-03]
  provides: [polymarket-settings, polymarket-routes, polymarket-infra-boot]
  affects: [server.ts, daemon.ts, setting-keys.ts]
tech_stack:
  added: []
  patterns: [PolymarketInfraDeps-duck-typing, Drizzle-to-snake_case-adapter]
key_files:
  created:
    - packages/daemon/src/api/routes/polymarket.ts
    - packages/daemon/src/__tests__/polymarket-routes.test.ts
  modified:
    - packages/daemon/src/infrastructure/settings/setting-keys.ts
    - packages/daemon/src/api/routes/index.ts
    - packages/daemon/src/api/server.ts
    - packages/daemon/src/lifecycle/daemon.ts
    - packages/actions/src/index.ts
decisions:
  - "PolymarketInfraDeps duck-typed interface in routes to avoid importing full @waiaas/actions"
  - "Drizzle camelCase to snake_case adapter inline in daemon for PolymarketDb interfaces"
  - "Polymarket exports added to @waiaas/actions main index for clean daemon imports"
metrics:
  duration: ~8min
  completed: "2026-03-11"
---

# Phase 373 Plan 01: Admin Settings + REST Routes + Daemon Boot Summary

Admin Settings 7 keys for Polymarket config, 9 REST query routes, daemon infra boot with DB adapters and provider registration

## What Was Done

### Task 1: Admin Settings + REST Routes
- Added 7 Polymarket settings to `setting-keys.ts` (enabled, fee_bps, order_expiry, max_position, proxy_wallet, neg_risk, auto_approve_ctf)
- Created `polymarket.ts` routes file with 9 endpoints (positions, orders, order detail, markets, market detail, events, balance, pnl, setup)
- Each route validates wallet existence and checks Polymarket infra availability
- Re-exported from `routes/index.ts`

### Task 2: Daemon Boot + Server Mount + Tests
- Added `polymarketInfra` field to daemon and `CreateAppDeps`
- Daemon creates Polymarket infrastructure when `polymarket_enabled=true` with inline Drizzle-to-snake_case DB adapters
- Registers orderProvider and ctfProvider with ActionProviderRegistry
- Mounted routes in server.ts after Hyperliquid routes
- 13 test cases covering all routes, disabled state, and wallet not found

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Polymarket not exported from @waiaas/actions main index**
- **Found during:** Task 2
- **Issue:** `createPolymarketInfrastructure` and related types were only in the polymarket subfolder, not in the package's main exports
- **Fix:** Added Polymarket re-exports to `packages/actions/src/index.ts`
- **Commit:** eea38871

**2. [Rule 1 - Bug] DB adapter snake_case mapping**
- **Found during:** Task 2
- **Issue:** Drizzle returns camelCase properties but PolymarketApiKeyRow expects snake_case
- **Fix:** Created inline mapping adapters in daemon.ts
- **Commit:** eea38871

## Verification

- `pnpm turbo run typecheck --filter=@waiaas/daemon` -- PASSED
- `pnpm vitest run packages/daemon/src/__tests__/polymarket-routes.test.ts` -- 13/13 PASSED
- `pnpm vitest run packages/admin/src/__tests__/settings-completeness.test.ts` -- 5/5 PASSED
