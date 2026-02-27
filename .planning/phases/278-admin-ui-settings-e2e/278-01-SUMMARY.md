# Plan 278-01 Summary: Settings Keys + Actions Page Aave V3 Card + Service Integration

## Status: DONE

## What was delivered
1. **4 Aave V3 settings in SSoT** (`setting-keys.ts`):
   - `actions.aave_v3_enabled` (default: `true`)
   - `actions.aave_v3_health_factor_warning_threshold` (default: `1.2`)
   - `actions.aave_v3_position_sync_interval_sec` (default: `300`)
   - `actions.aave_v3_max_ltv_pct` (default: `0.8`)

2. **keyToLabel entries** in `settings-helpers.ts` for Admin UI display.

3. **Aave V3 card** in `actions.tsx` BUILTIN_PROVIDERS (6th provider) with:
   - Toggle enable/disable
   - Advanced Settings section (3 FormField inputs: HF threshold, sync interval, max LTV)
   - onBlur auto-save via apiPut

4. **PositionTracker** integration with settingsService for LENDING sync interval override.

5. **HealthFactorMonitor** `loadFromSettings()` method that reads warning threshold and max LTV from settingsService.

## Commit
- `abc7e99a` feat(278-01): add Aave V3 runtime settings + Actions card + service integration
