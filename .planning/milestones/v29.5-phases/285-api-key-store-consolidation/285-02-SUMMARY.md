---
phase: 285-api-key-store-consolidation
plan: 02
status: complete
commits:
  - 1eef92ab: "feat(285-02): remove ApiKeyStore, fix hot-reload, update action route guard"
  - 6911e023: "feat(285-02): add setApiKey bypass, migrate tests, update admin routes"
---

## Execution Summary

**Plan 285-02: ApiKeyStore removal + hot-reload fix + test conversion**

### Task 1: Action route guard + hot-reload fix + ApiKeyStore deletion

1. **actions.ts refactored**: Removed `ApiKeyStore` import and `apiKeyStore` from `ActionRouteDeps`. Made `settingsService` required. Replaced `apiKeyStore.has()` guard with `settingsService.hasApiKey()` in both GET provider listing and POST action execution.

2. **hot-reload.ts fixed**: Added `aave_v3` and `kamino` to `BUILTIN_NAMES` (now 7 total). Added `rpcCaller` to `HotReloadDeps` (duck-typed interface). Updated `reloadActionProviders()` to forward `rpcCaller` to `registerBuiltInProviders()`.

3. **daemon.ts updated**: Added `rpcCaller` field to `DaemonLifecycle`. Stored rpcCaller reference during Step 4f. Passed to `HotReloadOrchestrator` deps.

4. **api-key-store.ts deleted**: Entire file removed.

5. **server.ts cleaned**: Removed `ApiKeyStore` import. Updated action routes guard to check `settingsService` instead of `apiKeyStore`.

### Task 2: Test migration + setApiKey bypass

1. **setApiKey() added to SettingsService**: Bypasses `SETTING_DEFINITIONS` validation to support arbitrary provider names. Directly writes `actions.{providerName}_api_key` to DB with encryption.

2. **admin.ts PUT/DELETE updated**: Changed from `settingsService.set(settingKey, ...)` to `settingsService.setApiKey(provider, ...)` to avoid SETTING_DEFINITIONS validation errors for dynamic provider names.

3. **api-admin-api-keys.test.ts rewritten**: Uses SettingsService + ActionProviderRegistry. Added `onSettingsChanged` callback tracking. Added 2 new tests for hot-reload trigger verification (12 tests total, all pass).

4. **api-key-store.test.ts deleted**: ApiKeyStore class no longer exists.

5. **api-actions.test.ts updated**: Replaced `ApiKeyStore` with `SettingsService`. Uses `settingsService.setApiKey()` for API key setup.

6. **actions-staking-integration.test.ts updated**: Replaced `ApiKeyStore` with `SettingsService` in both test setup locations.

7. **migration-chain.test.ts updated**: Removed `'api_keys'` from `ALL_TABLES`. Updated all `LATEST_SCHEMA_VERSION` assertions from 27 to 28.

### Verification Results

| Check | Result |
|-------|--------|
| api-key-store.ts deleted | PASS |
| api-key-store.test.ts deleted | PASS |
| ApiKeyStore references (code) | 0 (7 comments only) |
| BUILTIN_NAMES includes aave_v3+kamino | PASS |
| rpcCaller forwarded in hot-reload | PASS |
| api_keys removed from ALL_TABLES | PASS |
| api-admin-api-keys tests (12) | PASS |
| api-actions tests (13) | PASS |
| migration-chain tests | PASS |
| actions-staking-integration tests | PASS |
| TypeScript typecheck | PASS |
| ESLint (0 errors) | PASS |

### Key Decision: setApiKey() bypass

During test migration, discovered that `SettingsService.set()` validates keys against `SETTING_DEFINITIONS`, which only contains pre-registered built-in keys. API key management needs to support arbitrary provider names (including custom/plugin providers and test providers like `test_provider`). Added `setApiKey(providerName, value)` as a dedicated method that bypasses this validation while maintaining encryption and DB semantics.
