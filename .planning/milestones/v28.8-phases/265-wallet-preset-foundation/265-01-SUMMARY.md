---
phase: 265-wallet-preset-foundation
plan: 01
status: completed
commit: 7509a9be
---

## Summary

Created the WalletPreset type system and DB v24 migration for the wallet preset foundation.

### Changes

1. **wallet-preset.ts** (new): Created `WalletPresetTypeSchema` (Zod enum), `WalletPreset` interface, and `BUILTIN_PRESETS` registry with D'CENT preset (approval_method: walletconnect).

2. **core/index.ts**: Re-exported `WALLET_PRESET_TYPES`, `WalletPresetTypeSchema`, `BUILTIN_PRESETS`, and types from wallet-preset.ts.

3. **schema.ts**: Added `walletType: text('wallet_type')` to wallets table definition.

4. **migrate.ts**: Bumped `LATEST_SCHEMA_VERSION` from 23 to 24. Added `wallet_type TEXT` to fresh DDL. Added v24 migration (`ALTER TABLE wallets ADD COLUMN wallet_type TEXT`).

5. **migration-chain.test.ts**: Added 6 tests (T-17a through T-17f) covering v23->v24 migration, fresh DB, backward compatibility, schema equivalence, and v1->v24 full chain.

### Verification

- All 52 migration chain tests pass
- Typecheck passes for @waiaas/core and @waiaas/daemon
