---
phase: 86-rest-api-5type-mcp-sdk
plan: 02
subsystem: sdk
tags: [mcp, sdk, python-sdk, 5-type, token-transfer, backward-compat]

# Dependency graph
requires:
  - phase: 58-mcp-server
    provides: MCP send_token tool + test infrastructure
  - phase: 61-sdk-release
    provides: TS SDK client/types/validation + Python SDK client/models
provides:
  - MCP send_token with TRANSFER/TOKEN_TRANSFER params (MCPSDK-04 enforced)
  - TS SDK sendToken supporting all 5 transaction types
  - TS SDK per-type validation (TRANSFER/TOKEN_TRANSFER/CONTRACT_CALL/APPROVE/BATCH)
  - Python SDK send_token with type/token kwargs and 5-type support
  - TokenInfo type/model in both TS and Python SDKs
affects: [mcp-tools, sdk-client, python-sdk]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Conditional body construction for backward-compat API calls"
    - "Per-type field validation with switch/case in TS SDK"
    - "Pydantic model_dump(exclude_none=True, by_alias=True) for clean API bodies"

key-files:
  created: []
  modified:
    - packages/mcp/src/tools/send-token.ts
    - packages/mcp/src/__tests__/tools.test.ts
    - packages/sdk/src/types.ts
    - packages/sdk/src/validation.ts
    - packages/sdk/src/__tests__/client.test.ts
    - packages/sdk/src/__tests__/validation.test.ts
    - python-sdk/waiaas/models.py
    - python-sdk/waiaas/client.py
    - python-sdk/tests/test_client.py
    - python-sdk/tests/test_models.py

key-decisions:
  - "MCP exposes only TRANSFER+TOKEN_TRANSFER (no CONTRACT_CALL/APPROVE/BATCH for AI agent security)"
  - "TS SDK SendTokenParams.to/amount become optional to support APPROVE/BATCH types"
  - "Python SDK send_token uses **kwargs for extensibility (calldata, spender, instructions, etc.)"
  - "Python SDK TokenInfo as separate Pydantic model (not inline dict) for validation"
  - "Pydantic by_alias=True for camelCase serialization of programId/instructionData"

patterns-established:
  - "Backward-compat body pattern: omit type/token fields when not set, send only legacy to/amount/memo"
  - "Per-type validation in SDK: switch on type field, validate required fields per type"

# Metrics
duration: 4min
completed: 2026-02-12
---

# Phase 86 Plan 02: MCP/SDK 5-Type Extension Summary

**MCP send_token with TRANSFER/TOKEN_TRANSFER params, TS SDK + Python SDK full 5-type sendToken with per-type validation and backward-compatible body construction**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-12T12:00:51Z
- **Completed:** 2026-02-12T12:05:05Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- MCP send_token accepts optional type (TRANSFER|TOKEN_TRANSFER) and token parameters with security policy enforced (no CONTRACT_CALL/APPROVE/BATCH)
- TS SDK extended with TokenInfo type, 5-type SendTokenParams, and per-type validation (13 new validation tests)
- Python SDK extended with TokenInfo model, 5-type SendTokenRequest, and send_token kwargs (8 new tests)
- Full backward compatibility preserved -- omitting type/token sends legacy body format in all 3 targets
- Zero test regressions: MCP 116, TS SDK 104, Python SDK 55 -- all passing

## Task Commits

Each task was committed atomically:

1. **Task 1: MCP send_token type/token extension + tests** - `e427444` (feat)
2. **Task 2: TS SDK + Python SDK 5-type send extension + tests** - `8c60286` (feat)

## Files Created/Modified
- `packages/mcp/src/tools/send-token.ts` - Added type/token params, conditional body construction
- `packages/mcp/src/__tests__/tools.test.ts` - 3 new tests for type/token body variants
- `packages/sdk/src/types.ts` - Added TokenInfo interface + extended SendTokenParams with 5-type fields
- `packages/sdk/src/validation.ts` - Rewritten validateSendToken with per-type validation switch
- `packages/sdk/src/__tests__/client.test.ts` - 2 new tests for TOKEN_TRANSFER and legacy body
- `packages/sdk/src/__tests__/validation.test.ts` - 13 new tests for all 5 types + unknown type
- `python-sdk/waiaas/models.py` - Added TokenInfo model + extended SendTokenRequest with 5-type fields
- `python-sdk/waiaas/client.py` - Extended send_token with type/token kwargs + **kwargs
- `python-sdk/tests/test_client.py` - 2 new tests for TOKEN_TRANSFER and legacy body
- `python-sdk/tests/test_models.py` - 6 new tests for TokenInfo + SendTokenRequest 5-type serialization

## Decisions Made
- MCP deliberately limits to TRANSFER + TOKEN_TRANSFER only (MCPSDK-04 security policy) -- CONTRACT_CALL/APPROVE/BATCH not exposed to AI agents
- TS SDK SendTokenParams.to and .amount changed to optional because APPROVE has no `to` and BATCH has no top-level `to`/`amount` -- validation layer handles required field checking per type
- Python SDK uses `**kwargs` to pass additional type-specific fields (calldata, spender, instructions) without explicit method parameters for each
- Python SDK TokenInfo defined as standalone Pydantic model rather than inline dict for type safety
- Pydantic `by_alias=True` used for camelCase serialization of programId/instructionData fields

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- MCP, TS SDK, and Python SDK fully support 5-type transaction parameters
- Backward compatibility verified -- existing integrations work unchanged
- Ready for Phase 86 plan 01 (REST API 5-type routes) to complete
- After Phase 86, integration testing and full build verification can proceed

## Self-Check: PASSED

All 11 files verified present. Both task commits (e427444, 8c60286) verified in git log.

---
*Phase: 86-rest-api-5type-mcp-sdk*
*Completed: 2026-02-12*
