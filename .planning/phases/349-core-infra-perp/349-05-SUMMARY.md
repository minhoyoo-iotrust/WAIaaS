---
phase: 349-core-infra-perp
plan: 05
subsystem: admin
tags: [hyperliquid, admin-ui, admin-settings, skill-files, preact]

requires:
  - phase: 349-04
    provides: REST API query endpoints for Hyperliquid data
provides:
  - 9 HYPERLIQUID_* Admin Settings keys with defaults
  - Admin UI Hyperliquid page (Overview, Orders, Settings tabs)
  - Skill files updated for Hyperliquid Perp Trading
  - hyperliquid_perp in BUILTIN_PROVIDERS list
affects: [350, 351]

tech-stack:
  added: []
  patterns: [Preact signal-based tab layout, settings-driven form editor]

key-files:
  created:
    - packages/admin/src/pages/hyperliquid.tsx
    - packages/admin/src/components/hyperliquid/AccountSummary.tsx
    - packages/admin/src/components/hyperliquid/PositionsTable.tsx
    - packages/admin/src/components/hyperliquid/OpenOrdersTable.tsx
    - packages/admin/src/components/hyperliquid/SettingsPanel.tsx
  modified:
    - packages/admin/src/pages/actions.tsx
    - packages/admin/src/components/layout.tsx
    - packages/daemon/src/infrastructure/settings/setting-keys.ts
    - skills/transactions.skill.md
    - skills/admin.skill.md
    - skills/wallet.skill.md

key-decisions:
  - "Hyperliquid page as standalone route (/hyperliquid) separate from DeFi page"
  - "PositionsTable auto-refreshes every 10 seconds via setInterval"
  - "SettingsPanel saves all 9 HYPERLIQUID_* keys atomically via PUT /v1/admin/settings"
  - "EVM wallets only filter for wallet selector (Hyperliquid is EVM-based)"

requirements-completed: [HPERP-13, HINT-01, HINT-03]

duration: 15min
completed: 2026-03-08
---

# Phase 349 Plan 05: Admin Settings, Skill Files, and Admin UI Summary

**9 Admin Settings defaults, 3 skill file updates, and Admin UI page with positions/orders/settings tabs for Hyperliquid monitoring**

## Performance

- **Duration:** 15 min
- **Tasks:** 2
- **Files created:** 5
- **Files modified:** 6

## Accomplishments
- 9 HYPERLIQUID_* Admin Settings keys registered in setting-keys.ts
- Admin UI: HyperliquidPage with 3 tabs (Overview, Orders, Settings)
- AccountSummary: equity, margin used, available, ratio with color coding
- PositionsTable: 8-column table with auto-refresh (10s interval)
- OpenOrdersTable: 8-column table with order details
- SettingsPanel: form editor for all 9 runtime keys
- Skill files: transactions (REST/MCP/SDK examples), admin (settings reference), wallet (capability note)
- hyperliquid_perp added to BUILTIN_PROVIDERS in actions page

## Task Commits

1. **Task 1: Admin Settings defaults + Skill files** - `ef6f45ae` (feat)
2. **Task 2: Admin UI Hyperliquid page** - `1e2bcd8e` (feat)

## Deviations from Plan

None - plan executed exactly as written.

---
*Phase: 349-core-infra-perp*
*Completed: 2026-03-08*
