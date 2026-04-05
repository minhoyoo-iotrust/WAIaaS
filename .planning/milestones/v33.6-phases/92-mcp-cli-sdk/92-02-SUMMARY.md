---
phase: 92-mcp-cli-sdk
plan: 02
subsystem: sdk
tags: [typescript, python, pydantic, sdk, walletId, terminology]

# Dependency graph
requires:
  - phase: 91-daemon-api-jwt-config
    provides: "walletId terminology in daemon API responses and core interfaces"
provides:
  - "TS SDK response types (BalanceResponse, AddressResponse, AssetsResponse, TransactionResponse) with walletId field"
  - "Python SDK models (WalletAddress, WalletBalance, WalletAssets, TransactionDetail) with wallet_id/walletId"
  - "All SDK tests updated and passing (104 TS + 55 Python = 159 tests)"
affects: [mcp, cli, admin]

# Tech tracking
tech-stack:
  added: []
  patterns: ["walletId field in SDK response types", "wallet_id with walletId alias in Pydantic models"]

key-files:
  created: []
  modified:
    - packages/sdk/src/types.ts
    - packages/sdk/src/client.ts
    - packages/sdk/src/__tests__/client.test.ts
    - packages/sdk/src/__tests__/error.test.ts
    - python-sdk/waiaas/models.py
    - python-sdk/waiaas/client.py
    - python-sdk/tests/conftest.py
    - python-sdk/tests/test_models.py
    - python-sdk/tests/test_client.py

key-decisions:
  - "Python __init__.py docstring kept as-is (service name, not entity name)"
  - "Test fixture constant renamed AGENT_ID -> WALLET_ID in Python conftest.py"
  - "TS SDK error.test.ts updated AGENT_NOT_FOUND -> WALLET_NOT_FOUND for consistency"

patterns-established:
  - "SDK walletId convention: TS uses walletId, Python uses wallet_id with walletId alias"

# Metrics
duration: 3min
completed: 2026-02-13
---

# Phase 92 Plan 02: SDK walletId Rename Summary

**TS SDK and Python SDK response types renamed from agentId to walletId with 159 tests passing**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-13T01:31:20Z
- **Completed:** 2026-02-13T01:34:36Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- TS SDK 4 response interfaces (BalanceResponse, AddressResponse, AssetsResponse, TransactionResponse) use walletId
- Python SDK 4 models (WalletAddress, WalletBalance, WalletAssets, TransactionDetail) use wallet_id with walletId alias
- Zero agentId/agent_id occurrences remain in SDK packages
- All 159 SDK tests pass (104 TS + 55 Python)

## Task Commits

Each task was committed atomically:

1. **Task 1: TS SDK + Python SDK source field rename** - `1b3c509` (feat)
2. **Task 2: TS SDK + Python SDK test files wallet terminology update + test pass** - `aa18399` (test)

## Files Created/Modified
- `packages/sdk/src/types.ts` - TS SDK response types with walletId field
- `packages/sdk/src/client.ts` - Updated comment from "agent client" to "wallet client"
- `packages/sdk/src/__tests__/client.test.ts` - All mock responses use walletId
- `packages/sdk/src/__tests__/error.test.ts` - WALLET_NOT_FOUND error fixture
- `python-sdk/waiaas/models.py` - Python models with wallet_id/walletId alias
- `python-sdk/waiaas/client.py` - Updated docstrings from "agent wallet" to "wallet"
- `python-sdk/tests/conftest.py` - AGENT_ID constant renamed to WALLET_ID
- `python-sdk/tests/test_models.py` - walletId in JSON fixtures, wallet_id in assertions
- `python-sdk/tests/test_client.py` - walletId in mock responses, wallet_id in assertions

## Decisions Made
- Python __init__.py docstring kept as-is ("AI Agent Wallet-as-a-Service client") because it describes the service name, not the entity
- Test fixture constant renamed AGENT_ID -> WALLET_ID in Python conftest.py for consistency
- TS SDK error.test.ts updated AGENT_NOT_FOUND -> WALLET_NOT_FOUND to match daemon error codes

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SDK packages fully aligned with walletId terminology
- Ready for MCP and CLI updates in remaining v1.4.2 phases

## Self-Check: PASSED

All 9 modified files verified present. Both commit hashes (1b3c509, aa18399) verified in git log.

---
*Phase: 92-mcp-cli-sdk*
*Completed: 2026-02-13*
