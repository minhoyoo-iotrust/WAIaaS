---
phase: 284-kamino-integration
plan: 01
status: complete
---

## Summary

Registered KaminoLendingProvider in registerBuiltInProviders, added 3 Kamino Admin Settings keys to the SSoT, and wired HealthFactorMonitor to read Kamino-specific HF threshold.

## Key Changes

- Added Kamino entry to `registerBuiltInProviders` providers array reading from `actions.kamino_enabled`, `actions.kamino_market`, `actions.kamino_hf_threshold`
- Added 3 `SettingDefinition` entries for Kamino (enabled=false, market=main, hf_threshold=1.2)
- Added 3 `keyToLabel` entries for Admin UI display
- Updated `HealthFactorMonitor.loadFromSettings()` to also read Kamino HF threshold, using minimum across providers for conservative safety
- Updated kamino-provider test: asserts Kamino IS registered when enabled, skipped when disabled

## Key Files

### key-files.created
- (none)

### key-files.modified
- packages/actions/src/index.ts
- packages/daemon/src/infrastructure/settings/setting-keys.ts
- packages/admin/src/utils/settings-helpers.ts
- packages/daemon/src/services/monitoring/health-factor-monitor.ts
- packages/actions/src/__tests__/kamino-provider.test.ts

## Self-Check: PASSED
- All 340 actions tests pass
- 3 Kamino settings in SSoT
- HealthFactorMonitor reads both Aave V3 and Kamino thresholds
