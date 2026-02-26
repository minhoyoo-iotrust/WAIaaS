---
phase: 265-wallet-preset-foundation
plan: 02
status: completed
commit: 76f517d7
---

## Summary

Added `wallet_type` preset support to the `PUT /v1/wallets/{id}/owner` API endpoint.

### Changes

1. **openapi-schemas.ts**: Extended `SetOwnerRequestSchema` with optional `wallet_type` field (using `WalletPresetTypeSchema` from `@waiaas/core`). Extended `WalletOwnerResponseSchema` with `walletType` and `warning` fields.

2. **wallets.ts**: Added `BUILTIN_PRESETS` import and wallet_type processing logic in the owner handler. When `wallet_type` is provided, the preset's `approvalMethod` is saved to DB (overriding any manual `approval_method`). When both `wallet_type` and `approval_method` are provided, a warning is returned.

3. **wallet-owner-preset.test.ts**: Created 5 integration tests:
   - T-PRST-01: Valid preset sets DB values correctly
   - T-PRST-02: Invalid wallet_type returns 400 (Zod validation)
   - T-PRST-03: No wallet_type preserves backward compatibility
   - T-PRST-04: Conflict resolution (preset wins + warning)
   - T-PRST-05: approval_method without wallet_type uses existing logic

4. **wallet.skill.md**: Updated both skill files with `wallet_type` parameter documentation, preset usage example, and conflict resolution note.

### Verification

- `pnpm turbo run typecheck --filter=@waiaas/core --filter=@waiaas/daemon`: PASS
- `pnpm vitest run wallet-owner-preset.test.ts`: 5/5 PASS
- `pnpm turbo run lint --filter=@waiaas/daemon`: 0 errors (384 warnings)
