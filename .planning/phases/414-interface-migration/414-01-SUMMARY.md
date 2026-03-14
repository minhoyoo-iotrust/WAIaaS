---
phase: 414-interface-migration
plan: 01
subsystem: admin-ui
tags: [migration, types, openapi, typed-client]
dependency_graph:
  requires: [413-02]
  provides: [types-aliases-module, 8-small-pages-migrated]
  affects: [admin-ui, settings-helpers]
tech_stack:
  added: []
  patterns: [generated-type-aliases, typed-client-pattern, path-level-type-extraction]
key_files:
  created:
    - packages/admin/src/api/types.aliases.ts
  modified:
    - packages/admin/src/utils/settings-helpers.ts
    - packages/admin/src/pages/polymarket.tsx
    - packages/admin/src/pages/hyperliquid.tsx
    - packages/admin/src/pages/credentials.tsx
    - packages/admin/src/pages/rpc-proxy.tsx
    - packages/admin/src/pages/telegram-users.tsx
    - packages/admin/src/pages/audit-logs.tsx
    - packages/admin/src/pages/tokens.tsx
    - packages/admin/src/pages/human-wallet-apps.tsx
    - packages/admin/src/__tests__/polymarket.test.tsx
    - packages/admin/src/__tests__/hyperliquid.test.tsx
    - packages/admin/src/__tests__/credentials.test.tsx
    - packages/admin/src/__tests__/rpc-proxy.test.tsx
    - packages/admin/src/__tests__/telegram-users.test.tsx
    - packages/admin/src/__tests__/audit-logs.test.tsx
    - packages/admin/src/__tests__/tokens.test.tsx
    - packages/admin/src/__tests__/human-wallet-apps.test.tsx
decisions:
  - types.aliases.ts provides central re-exports for generated types; pages import from here or directly from types.generated.ts
  - SettingsData and ApiKeyEntry kept as manual types (no named Zod schema); TODO(Phase 415)
  - KillSwitchState, RpcTestResult, NotifTestResult, RpcEndpointStatusEntry replaced with generated aliases
  - Path-level type extraction used for CredentialMetadata, AuditLogItem, TelegramUser (no named schema in generated types)
metrics:
  duration: 14min
  completed: 2026-03-15
---

# Phase 414 Plan 01: Central Type Aliases + 8 Small Pages Migration Summary

Central type aliases module created, settings-helpers migrated to generated types, and 8 small pages converted from manual apiGet/apiPost to typed client with generated type aliases.

## What Changed

### Task 1: Central Type Aliases + Settings Helpers
- Created `types.aliases.ts` with 30+ type aliases from generated OpenAPI types
- Migrated 4/6 interfaces in `settings-helpers.ts` to generated types (KillSwitchState, RpcTestResult, NotifTestResult, RpcEndpointStatusEntry)
- Kept SettingsData and ApiKeyEntry as manual (no matching named schema)

### Task 2: 8 Small Pages + 8 Test Files
Pages migrated: polymarket, hyperliquid, credentials, rpc-proxy, telegram-users, audit-logs, tokens, human-wallet-apps

For each page:
1. Replaced `import { apiGet, ... } from '../api/client'` with `import { api, ApiError } from '../api/typed-client'`
2. Removed manual `interface` declarations, replaced with generated type aliases
3. Converted `apiGet<T>(url)` to `api.GET(path, { params })` typed pattern
4. Converted `apiPost/apiPut/apiDelete` to `api.POST/PUT/DELETE` with typed body/params

For each test file:
1. Replaced `vi.mock('../api/client')` with `vi.mock('../api/typed-client')`
2. Updated mock structure from `apiGet.mockResolvedValue(data)` to `mockApiGet.mockResolvedValue({ data: ... })`
3. Updated assertions to match typed client call patterns

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed wallets list field name in polymarket/hyperliquid**
- **Found during:** Task 2
- **Issue:** Pages used `(res as { wallets: Wallet[] }).wallets` but API returns `{ items: WalletCrudResponse[] }`
- **Fix:** Changed to `data?.items ?? []` using typed client auto-inference
- **Files modified:** polymarket.tsx, hyperliquid.tsx

**2. [Rule 1 - Bug] Fixed audit log field names in rpc-proxy**
- **Found during:** Task 2
- **Issue:** Page used `row.action` and `row.metadata` but generated type has `eventType` and `details`
- **Fix:** Updated column renders to use correct field names
- **Files modified:** rpc-proxy.tsx

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 52e39109 | Central type aliases module + settings-helpers migration |
| 2 | 13e6d9da | 8 small pages + 8 test files migrated to typed client |
