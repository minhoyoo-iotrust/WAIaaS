---
phase: 330-ui-restructure-feature-gate
plan: 02
subsystem: admin-ui
tags: [admin, menu, routing, erc8004, toggle, ui]
dependency_graph:
  requires: []
  provides: [defi-menu, agent-identity-menu, erc8004-toggle, unified-settings-parsing]
  affects: [packages/admin/src/components/layout.tsx, packages/admin/src/pages/erc8004.tsx, packages/admin/src/pages/actions.tsx]
tech_stack:
  added: []
  patterns: [nested-SettingsData-format, toggle-controlled-tab-visibility]
key_files:
  created: []
  modified:
    - packages/admin/src/components/layout.tsx
    - packages/admin/src/pages/actions.tsx
    - packages/admin/src/pages/erc8004.tsx
    - packages/admin/src/__tests__/erc8004.test.tsx
    - packages/admin/src/__tests__/erc8004-reputation.test.tsx
    - packages/admin/src/__tests__/actions.test.tsx
    - packages/admin/src/__tests__/actions-aave-v3.test.tsx
    - packages/admin/src/__tests__/actions-kamino.test.tsx
decisions:
  - Unified settings parsing to nested SettingsData format (matching DeFi page pattern)
  - Legacy routes (#/actions, #/erc8004) redirect to new routes instead of 404
  - Disabled state shows read-only table (not EmptyState) for previously-registered agents
metrics:
  duration: 25m
  completed: 2026-03-05
---

# Phase 330 Plan 02: Admin UI Menu Rename + ERC-8004 Toggle Summary

Admin UI sidebar renamed to DeFi/Agent Identity with integrated enable/disable toggle on the Agent Identity page.

## What Changed

### Task 1: Menu/Route Rename + ERC-8004 Card Removal
- Renamed `Actions` -> `DeFi` (route `#/defi`)
- Renamed `ERC-8004` -> `Agent Identity` (route `#/agent-identity`)
- Agent Identity nav item positioned immediately after DeFi (before Policies)
- Removed `erc8004_agent` provider card from DeFi page (9 DeFi providers remain)
- Added legacy route redirects: `#/actions` -> `#/defi`, `#/erc8004` -> `#/agent-identity`
- Commit: `0e9ee6c4`

### Task 2: Toggle + Settings Unification + Tests
- Added enable/disable toggle at the top of Agent Identity page (always visible)
- Toggle calls `PUT /v1/admin/settings` with `actions.erc8004_agent_enabled` key
- Unified settings parsing to nested `SettingsData` format (was using flat key + value/source object)
- Disabled state: shows disabled message + read-only Identity table (no action buttons, no Register Agent button), hides Registration File and Reputation tabs
- Enabled state: full 3-tab UI with all action buttons (original behavior)
- Always loads wallets/agents even when disabled (for read-only table display)
- Updated test mocks to nested SettingsData format
- Added toggle-specific tests (visible in both states, calls PUT API, hides tabs)
- Fixed provider card count from 10 to 9 in 3 DeFi page test files
- All 675 admin tests pass
- Commit: `50da645e`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed erc8004-reputation test mock format**
- **Found during:** Task 2
- **Issue:** `erc8004-reputation.test.tsx` used old flat settings format (`'actions.erc8004_agent_enabled': { value: 'true', source: 'admin' }`)
- **Fix:** Updated to nested format (`{ actions: { erc8004_agent_enabled: 'true' } }`)
- **Files modified:** `packages/admin/src/__tests__/erc8004-reputation.test.tsx`

**2. [Rule 1 - Bug] Fixed DeFi provider card count in tests**
- **Found during:** Task 2
- **Issue:** 3 test files expected 10 provider cards but now there are 9 (ERC-8004 removed)
- **Fix:** Updated assertions from 10 to 9
- **Files modified:** `actions.test.tsx`, `actions-aave-v3.test.tsx`, `actions-kamino.test.tsx`

## Decisions Made

1. **Nested SettingsData format**: Unified with DeFi page pattern (`settings['actions']['key']`) instead of the flat format (`settings['actions.key'].value`). This is the SSoT format returned by the admin settings API.
2. **Legacy route redirects**: Added redirects instead of removing old routes, ensuring bookmarks and external links still work.
3. **Read-only table when disabled**: Shows existing agent registrations as read-only (not hidden) when feature is disabled. This allows operators to see the current state before enabling/disabling.
