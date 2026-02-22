---
phase: 233-db-migration-schema-policy
plan: 03
subsystem: policy
tags: [caip-19, policy-engine, allowed-tokens, zod, token-matching]

# Dependency graph
requires:
  - phase: 231-caip-module
    provides: "parseCaip19, Caip19Schema from @waiaas/core caip module"
provides:
  - "AllowedTokensRulesSchema with optional CAIP-19 assetId per token entry"
  - "4-scenario evaluateAllowedTokens matching matrix in DatabasePolicyEngine"
  - "TransactionParam.assetId field for CAIP-19 policy matching"
affects: [234-api-sdk-mcp-integration]

# Tech tracking
tech-stack:
  added: []
  patterns: ["4-scenario matching matrix for gradual CAIP-19 adoption in policies"]

key-files:
  created: []
  modified:
    - packages/core/src/schemas/policy.schema.ts
    - packages/daemon/src/pipeline/database-policy-engine.ts

key-decisions:
  - "address remains required even with assetId for backward compatibility"
  - "4-scenario matrix enables gradual migration: old policies (address-only) match new TX (assetId) and vice versa"
  - "Scenario 1 uses exact string comparison (CAIP-19 already normalized at construction)"
  - "Scenarios 2-3 use parseCaip19 with try/catch for graceful degradation"
  - "Denial reason includes assetId when available for better diagnostics"

patterns-established:
  - "4-scenario matching: assetId+assetId, assetId+address, address+assetId, address+address"
  - "parseCaip19 try/catch in policy evaluation for graceful CAIP-19 parse failure"

requirements-completed: [PLCY-01, PLCY-02, PLCY-03, PLCY-04]

# Metrics
duration: 4min
completed: 2026-02-22
---

# Phase 233 Plan 03: Policy Schema + Engine Summary

**ALLOWED_TOKENS policy extended with optional CAIP-19 assetId and 4-scenario matching matrix for chain-aware token policy enforcement**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-22T04:37:11Z
- **Completed:** 2026-02-22T04:41:21Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- AllowedTokensRulesSchema accepts optional assetId (validated as CAIP-19) per token entry
- evaluateAllowedTokens implements 4-scenario matching matrix: both assetId (exact match), policy assetId + TX address (extract), policy address + TX assetId (extract), both address-only (unchanged)
- EVM addresses normalized to lowercase in all comparison scenarios (PLCY-04)
- parseCaip19 errors caught gracefully -- invalid CAIP-19 strings simply don't match
- All 100 existing policy engine tests pass without modification

## Task Commits

Each task was committed atomically:

1. **Task 1: AllowedTokensRulesSchema assetId extension** - `6231d684` (feat)
2. **Task 2: 4-scenario evaluateAllowedTokens + TransactionParam.assetId** - `7942d09f` (feat)

**Plan metadata:** TBD (docs: complete plan)

## Files Created/Modified
- `packages/core/src/schemas/policy.schema.ts` - Added Caip19Schema import, optional assetId to AllowedTokensRulesSchema token entries
- `packages/daemon/src/pipeline/database-policy-engine.ts` - Added parseCaip19 import, assetId to AllowedTokensRules and TransactionParam interfaces, rewrote evaluateAllowedTokens with 4-scenario matching matrix

## Decisions Made
- address remains required even when assetId is present -- backward compatibility and fallback path
- 4-scenario matrix enables gradual migration from address-only to CAIP-19 identifiers
- Scenario 1 uses exact `===` comparison because CAIP-19 strings are already normalized (tokenAssetId lowercases EVM, preserves Solana base58)
- Scenarios 2-3 extract assetReference via parseCaip19 and lowercase for comparison
- Denial reason shows txAssetId when available, falling back to txTokenAddress

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Policy engine ready for CAIP-19-aware ALLOWED_TOKENS enforcement
- Pipeline stage 2 (policy evaluation) can now pass assetId from transaction request to TransactionParam
- API/SDK/MCP integration (Phase 234) can wire assetId through the full request path

## Self-Check: PASSED

- FOUND: packages/core/src/schemas/policy.schema.ts
- FOUND: packages/daemon/src/pipeline/database-policy-engine.ts
- FOUND: commit 6231d684
- FOUND: commit 7942d09f

---
*Phase: 233-db-migration-schema-policy*
*Completed: 2026-02-22*
