---
phase: 405-human-amount-parameter
plan: 02
subsystem: actions
tags: [humanAmount, provider-schema, mcp, zod, decimal-conversion]

requires:
  - phase: 405-01
    provides: "humanAmount XOR schema + resolveHumanAmount helper + parseAmount"
provides:
  - "resolveProviderHumanAmount shared helper for provider-level humanAmount conversion"
  - "10 provider schemas with per-provider humanAmount variants"
  - "MCP auto-exposure of humanAmount via jsonSchemaToZodParams"
affects: ["packages/actions/src/providers/*", "packages/mcp/src/tools/action-provider.ts"]

tech-stack:
  added: []
  patterns: ["Provider-level humanAmount with decimals field (no registry access)", "resolveProviderHumanAmount mutates params before schema parse"]

key-files:
  created:
    - packages/actions/src/common/resolve-human-amount.ts
    - packages/actions/src/__tests__/provider-human-amount.test.ts
  modified:
    - packages/actions/src/providers/jupiter-swap/index.ts
    - packages/actions/src/providers/zerox-swap/index.ts
    - packages/actions/src/providers/dcent-swap/index.ts
    - packages/actions/src/providers/across/index.ts
    - packages/actions/src/providers/lifi/index.ts
    - packages/actions/src/providers/aave-v3/schemas.ts
    - packages/actions/src/providers/aave-v3/index.ts
    - packages/actions/src/providers/kamino/schemas.ts
    - packages/actions/src/providers/kamino/index.ts
    - packages/actions/src/providers/lido-staking/index.ts
    - packages/actions/src/providers/jito-staking/index.ts
    - packages/actions/src/providers/pendle/input-schemas.ts
    - packages/actions/src/providers/pendle/index.ts
    - packages/mcp/src/__tests__/action-provider-schema.test.ts

key-decisions:
  - "Provider humanAmount requires decimals field since providers lack TokenRegistryService access"
  - "Per-provider naming: humanAmount (most), humanSellAmount (zerox), humanAmountIn (pendle), humanFromAmount (lifi)"
  - "CLOB providers (Hyperliquid, Drift, Polymarket) excluded from humanAmount (exchange-native units)"
  - "resolveProviderHumanAmount deletes both humanAmount and decimals from params after conversion"

patterns-established:
  - "resolveProviderHumanAmount(params, amountField, humanAmountField) before schema.parse()"
  - "humanAmountFields DRY constant for multi-schema providers (Aave V3, Kamino)"

requirements-completed: [HAMNT-04, HAMNT-05, TEST-05, TEST-06]

duration: 8min
completed: 2026-03-14
---

# Phase 405 Plan 02: Action Provider humanAmount + MCP auto-exposure Summary

**resolveProviderHumanAmount shared helper with per-provider humanAmount variants for 10 DeFi providers and MCP auto-exposure via jsonSchemaToZodParams**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-14T10:20:00Z
- **Completed:** 2026-03-14T10:28:44Z
- **Tasks:** 2
- **Files modified:** 16

## Accomplishments
- Created resolveProviderHumanAmount shared helper for provider-level decimal conversion
- Added humanAmount+decimals optional fields to 10 non-CLOB provider schemas (Jupiter, 0x, D'CENT, Across, LI.FI, Aave V3, Kamino, Lido, Jito, Pendle)
- Verified MCP auto-exposure: jsonSchemaToZodParams converts humanAmount/decimals fields without code changes
- Confirmed CLOB providers (Hyperliquid, Drift, Polymarket) have no humanAmount fields

## Task Commits

Each task was committed atomically:

1. **Task 1: Provider schemas + shared helper (TDD)** - `89f6c64d` (feat)
2. **Task 2: MCP humanAmount exposure + integration tests** - `97fec2eb` (test)

## Files Created/Modified
- `packages/actions/src/common/resolve-human-amount.ts` - Shared humanAmount->amount conversion helper
- `packages/actions/src/__tests__/provider-human-amount.test.ts` - 23 tests for provider humanAmount
- `packages/actions/src/providers/jupiter-swap/index.ts` - humanAmount + decimals fields, resolveProviderHumanAmount in resolve()
- `packages/actions/src/providers/zerox-swap/index.ts` - humanSellAmount variant
- `packages/actions/src/providers/dcent-swap/index.ts` - humanAmount for get_quotes + dex_swap schemas
- `packages/actions/src/providers/across/index.ts` - humanAmount for execute action
- `packages/actions/src/providers/lifi/index.ts` - humanFromAmount variant
- `packages/actions/src/providers/aave-v3/schemas.ts` - humanAmount for supply/withdraw/borrow/repay schemas
- `packages/actions/src/providers/aave-v3/index.ts` - resolveProviderHumanAmount in resolve()
- `packages/actions/src/providers/kamino/schemas.ts` - humanAmount for supply/withdraw/borrow/repay schemas
- `packages/actions/src/providers/kamino/index.ts` - resolveProviderHumanAmount in resolve()
- `packages/actions/src/providers/lido-staking/index.ts` - humanAmount for stake/unstake
- `packages/actions/src/providers/jito-staking/index.ts` - humanAmount for stake/unstake
- `packages/actions/src/providers/pendle/input-schemas.ts` - humanAmountIn/humanAmount variants
- `packages/actions/src/providers/pendle/index.ts` - resolveProviderHumanAmount in resolve()
- `packages/mcp/src/__tests__/action-provider-schema.test.ts` - 4 new MCP humanAmount auto-exposure tests

## Decisions Made
- Provider humanAmount requires `decimals` field since providers lack TokenRegistryService access
- Per-provider naming convention follows original amount field: humanAmount, humanSellAmount, humanAmountIn, humanFromAmount
- CLOB providers excluded: Hyperliquid, Drift, Polymarket use exchange-native units (not smallest-unit)
- resolveProviderHumanAmount deletes both humanAmount and decimals from params after conversion (clean params for schema parse)
- Used humanAmountFields DRY constant for Aave V3 and Kamino (4 schemas each)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing MCP typecheck errors (Object possibly undefined on lines 105/121/125/139, unused RESERVED_FIELDS) remain. Verified these exist before this plan's changes -- out of scope per deviation rules.

## Next Phase Readiness
- All 10 smallest-unit providers support humanAmount as alternative to amount
- MCP tools automatically expose humanAmount via jsonSchemaToZodParams
- CLOB providers correctly excluded
- Ready for any follow-up humanAmount-related features

---
*Phase: 405-human-amount-parameter*
*Completed: 2026-03-14*
