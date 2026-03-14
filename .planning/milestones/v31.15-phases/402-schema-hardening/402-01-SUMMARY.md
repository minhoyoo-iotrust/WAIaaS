---
phase: 402-schema-hardening
plan: 01
subsystem: api
tags: [zod, schema, describe, openapi, mcp, amount, unit]

# Dependency graph
requires: []
provides:
  - "All 17 provider schemas have explicit unit .describe() on amount fields"
  - "All 7 MCP builtin tools have unit-aware amount descriptions"
affects: [403-provider-unit-migration, 404-typed-mcp-schemas, 405-humanAmount]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Zod .describe() for amount fields: smallest-unit providers include unit type + example, CLOB providers include exchange-native + NOT smallest units warning, legacy human-readable providers include migration notice"]

key-files:
  created: []
  modified:
    - packages/actions/src/providers/jupiter-swap/index.ts
    - packages/actions/src/providers/zerox-swap/index.ts
    - packages/actions/src/providers/lifi/index.ts
    - packages/actions/src/providers/across/index.ts
    - packages/actions/src/providers/dcent-swap/index.ts
    - packages/actions/src/providers/pendle/input-schemas.ts
    - packages/actions/src/providers/aave-v3/schemas.ts
    - packages/actions/src/providers/kamino/schemas.ts
    - packages/actions/src/providers/lido-staking/index.ts
    - packages/actions/src/providers/jito-staking/index.ts
    - packages/actions/src/providers/hyperliquid/schemas.ts
    - packages/actions/src/providers/drift/schemas.ts
    - packages/actions/src/providers/polymarket/schemas.ts
    - packages/mcp/src/tools/send-token.ts
    - packages/mcp/src/tools/approve-token.ts
    - packages/mcp/src/tools/transfer-nft.ts
    - packages/mcp/src/tools/simulate-transaction.ts
    - packages/mcp/src/tools/build-userop.ts
    - packages/mcp/src/tools/call-contract.ts
    - packages/mcp/src/tools/send-batch.ts

key-decisions:
  - ".describe() placed after .min() and before .or() for proper Zod chain ordering"
  - "CLOB providers consistently use 'exchange-native decimal units' + 'NOT smallest units' wording"
  - "Legacy human-readable providers (Aave, Kamino, Lido, Jito) include 'will migrate to smallest units in future' notice"

patterns-established:
  - "Amount .describe() pattern: smallest-unit providers use format 'Amount in smallest units (wei/lamports). Example: \"X\" = Y TOKEN'"
  - "CLOB .describe() pattern: 'X in exchange-native decimal units (e.g., \"Y\"). NOT smallest units.'"
  - "Legacy .describe() pattern: 'Amount in human-readable format (e.g., \"X\"). Note: will migrate to smallest units in future.'"

requirements-completed: [UNIT-04, UNIT-06, MCP-04, MCP-05]

# Metrics
duration: 6min
completed: 2026-03-14
---

# Phase 402 Plan 01: Schema Hardening Summary

**Zod .describe() unit info on all 17 provider amount schemas + 7 MCP builtin tools for AI agent unit disambiguation**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-14T06:50:27Z
- **Completed:** 2026-03-14T06:56:30Z
- **Tasks:** 2
- **Files modified:** 20

## Accomplishments
- 10 non-CLOB provider schemas (24 amount fields) now have explicit unit type and example values in .describe()
- 3 CLOB provider schemas (Hyperliquid, Drift, Polymarket) have exchange-native unit descriptions with NOT smallest units warning
- 7 MCP builtin tools (send_token, approve_token, transfer_nft, simulate_transaction, build_userop, call_contract, send_batch) have hardened amount descriptions
- Full typecheck (19 packages) and test suite (1133 tests) pass with zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Non-CLOB provider + CLOB schema descriptions** - `b1869b78` (feat)
2. **Task 2: MCP builtin tool amount descriptions** - `e0eb5db9` (feat)

## Files Created/Modified
- `packages/actions/src/providers/jupiter-swap/index.ts` - SwapInputSchema amount .describe()
- `packages/actions/src/providers/zerox-swap/index.ts` - SwapInputSchema sellAmount .describe()
- `packages/actions/src/providers/lifi/index.ts` - LiFiCrossSwapInputSchema fromAmount .describe()
- `packages/actions/src/providers/across/index.ts` - Quote + Execute amount .describe()
- `packages/actions/src/providers/dcent-swap/index.ts` - GetQuotes + DexSwap amount .describe()
- `packages/actions/src/providers/pendle/input-schemas.ts` - 5 schema amountIn/amount .describe()
- `packages/actions/src/providers/aave-v3/schemas.ts` - 4 schema amount .describe() (human-readable + migration notice)
- `packages/actions/src/providers/kamino/schemas.ts` - 4 schema amount .describe() (human-readable + migration notice)
- `packages/actions/src/providers/lido-staking/index.ts` - Stake/Unstake amount .describe() (human-readable ETH/stETH)
- `packages/actions/src/providers/jito-staking/index.ts` - Stake/Unstake amount .describe() (human-readable SOL/JitoSOL)
- `packages/actions/src/providers/hyperliquid/schemas.ts` - 12 exchange-native descriptions across perp/spot/transfer schemas
- `packages/actions/src/providers/drift/schemas.ts` - 6 exchange-native descriptions across perp/margin schemas
- `packages/actions/src/providers/polymarket/schemas.ts` - price/size exchange-native descriptions for buy/sell
- `packages/mcp/src/tools/send-token.ts` - amount description with wei/lamports examples
- `packages/mcp/src/tools/approve-token.ts` - amount description with max uint256 example
- `packages/mcp/src/tools/transfer-nft.ts` - amount clarified as count, not smallest-unit
- `packages/mcp/src/tools/simulate-transaction.ts` - amount + value descriptions with examples
- `packages/mcp/src/tools/build-userop.ts` - amount + batch calls amount descriptions
- `packages/mcp/src/tools/call-contract.ts` - value description with wei example
- `packages/mcp/src/tools/send-batch.ts` - instructions description with smallest-unit hint

## Decisions Made
- .describe() placed after .min() and before .or() for correct Zod chain semantics
- CLOB providers use consistent "exchange-native decimal units" + "NOT smallest units" wording
- Legacy human-readable providers include "will migrate to smallest units in future" notice for forward compatibility

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All schemas now have explicit unit descriptions, ready for Phase 403 (Provider Unit Migration)
- Legacy providers (Aave, Kamino, Lido, Jito) are marked with migration notice, aligning with Phase 403 scope

---
*Phase: 402-schema-hardening*
*Completed: 2026-03-14*
