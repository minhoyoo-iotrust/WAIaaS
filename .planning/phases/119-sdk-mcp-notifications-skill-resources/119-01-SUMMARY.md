---
phase: 119-sdk-mcp-notifications-skill-resources
plan: 01
subsystem: sdk, mcp
tags: [typescript, python, pydantic, sign-transaction, mcp-tools]

# Dependency graph
requires:
  - phase: 117-sign-only-pipeline
    provides: "POST /v1/transactions/sign REST API 엔드포인트"
  - phase: 118-evm-calldata-encoding
    provides: "encode_calldata MCP 도구 패턴, EncodeCalldata SDK 패턴"
provides:
  - "TS SDK signTransaction() 메서드 (POST /v1/transactions/sign)"
  - "Python SDK sign_transaction() 메서드 (POST /v1/transactions/sign)"
  - "MCP sign_transaction 13번째 도구"
  - "SignTransactionParams/Operation/Response TS 타입"
  - "SignTransactionRequest/Operation/PolicyResult/Response Pydantic 모델"
affects: [skill-files, admin-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "sign_transaction SDK 메서드 패턴 (encodeCalldata와 동일한 withRetry POST 패턴)"
    - "MCP tool registration 패턴 유지 (registerXxx 함수, z schema, apiClient.post)"

key-files:
  created:
    - packages/mcp/src/tools/sign-transaction.ts
  modified:
    - packages/sdk/src/types.ts
    - packages/sdk/src/client.ts
    - packages/sdk/src/index.ts
    - packages/sdk/src/__tests__/client.test.ts
    - packages/mcp/src/server.ts
    - packages/mcp/src/__tests__/server.test.ts
    - python-sdk/waiaas/models.py
    - python-sdk/waiaas/client.py
    - python-sdk/waiaas/__init__.py
    - python-sdk/tests/test_models.py

key-decisions:
  - "MCP sign_transaction에 chain 파라미터 미노출 (wallet에서 자동 추론)"
  - "EncodeCalldataParams/Response도 함께 index.ts export에 추가 (기존 누락 수정)"

patterns-established:
  - "sign-only API SDK/MCP 통합 패턴: POST body에 transaction + optional network"

# Metrics
duration: 3min
completed: 2026-02-15
---

# Phase 119 Plan 01: Sign Transaction SDK/MCP Summary

**TS/Python SDK signTransaction() 메서드 + MCP sign_transaction 13번째 도구를 추가하여 sign-only REST API를 3개 클라이언트 인터페이스에서 사용 가능하게 함**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-14T17:06:43Z
- **Completed:** 2026-02-14T17:10:26Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- TS SDK `signTransaction()` 메서드가 POST /v1/transactions/sign을 호출하고 SignTransactionResponse를 반환
- Python SDK `sign_transaction()` async 메서드가 동일 엔드포인트를 호출하고 typed response를 반환
- MCP `sign_transaction` 도구가 13번째 도구로 등록되어 apiClient.post('/v1/transactions/sign')를 호출
- SDK 테스트 3건 + Python 모델 테스트 7건 + MCP 13-tool 카운트 검증 통과

## Task Commits

Each task was committed atomically:

1. **Task 1: TS SDK signTransaction + MCP sign_transaction 도구** - `59a0498` (feat)
2. **Task 2: Python SDK sign_transaction + 모델 테스트** - `4205921` (feat)

## Files Created/Modified
- `packages/sdk/src/types.ts` - SignTransactionParams/Operation/Response 타입 추가
- `packages/sdk/src/client.ts` - signTransaction() 메서드 추가 (11번째 메서드)
- `packages/sdk/src/index.ts` - EncodeCalldata + SignTransaction 타입 export 추가
- `packages/sdk/src/__tests__/client.test.ts` - signTransaction 성공/네트워크/에러 테스트 3건
- `packages/mcp/src/tools/sign-transaction.ts` - registerSignTransaction MCP 도구 (NEW)
- `packages/mcp/src/server.ts` - 13번째 도구 등록 + 주석 갱신
- `packages/mcp/src/__tests__/server.test.ts` - 12->13 tool count 갱신
- `python-sdk/waiaas/models.py` - SignTransactionRequest/Operation/PolicyResult/Response Pydantic 모델
- `python-sdk/waiaas/client.py` - sign_transaction() async 메서드
- `python-sdk/waiaas/__init__.py` - SignTransactionRequest/Response export
- `python-sdk/tests/test_models.py` - 역직렬화/직렬화/PolicyResult 테스트 7건

## Decisions Made
- MCP sign_transaction에 chain 파라미터 미노출 (wallet에서 자동 추론)
- EncodeCalldataParams/Response도 함께 index.ts export에 추가 (기존 누락 수정)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- sign-only API가 TS SDK, Python SDK, MCP 3개 인터페이스에서 모두 사용 가능
- 119-02 플랜(알림 관련) 진행 준비 완료

## Self-Check: PASSED

- All 12 files verified (11 modified/created + 1 SUMMARY)
- Both task commits verified: 59a0498, 4205921
- Build: 2/2 packages successful
- Tests: 43 SDK + 9 MCP + 28 Python = 80 total passed

---
*Phase: 119-sdk-mcp-notifications-skill-resources*
*Completed: 2026-02-15*
