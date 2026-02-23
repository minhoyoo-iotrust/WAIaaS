# Phase 248: Deferred Items

## Pre-existing Issues (Out of Scope)

### 1. config-loader.test.ts: actions section key count assertion
- **Test:** `DaemonConfigSchema actions section has 8 keys`
- **Location:** `packages/daemon/src/__tests__/config-loader.test.ts:709`
- **Issue:** Test asserts 8 keys but config now has 13 keys (8 Jupiter + 5 0x added in 248-01)
- **Impact:** Test failure, no functional impact
- **Action needed:** Update assertion from `toHaveLength(8)` to `toHaveLength(13)`
