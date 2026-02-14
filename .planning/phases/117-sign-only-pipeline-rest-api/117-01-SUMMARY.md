---
phase: 117-sign-only-pipeline-rest-api
plan: 01
subsystem: pipeline, policy-engine
tags: [sign-only, policy-engine, toctou, reserved-amount, pipeline, sqlite]

# Dependency graph
requires:
  - "115-01: SIGNED status, SIGN type, ParsedTransaction/SignedTransaction 타입, parseTransaction/signExternalTransaction 메서드"
  - "116-02: DatabasePolicyEngine settingsService default deny toggles"
provides:
  - "executeSignOnly() 10-step sign-only 파이프라인 함수"
  - "SignOnlyDeps, SignOnlyRequest, SignOnlyResult 인터페이스"
  - "mapOperationToParam() ParsedOperation -> TransactionParam 변환 헬퍼"
  - "evaluateAndReserve reservation SUM 쿼리에 SIGNED 상태 포함"
  - "sign-only 파이프라인 유닛 테스트 17개"
affects:
  - "117-02 (REST API 라우트에서 executeSignOnly 호출)"
  - "118-mcp-sdk-admin-sign (MCP/SDK에서 sign-only 사용)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "별도 파이프라인 모듈 패턴 (stages.ts 수정 없이 sign-only.ts 분리)"
    - "ParsedOperation -> TransactionParam 매핑 (5-type: NATIVE_TRANSFER->TRANSFER, TOKEN_TRANSFER->TOKEN_TRANSFER, CONTRACT_CALL->CONTRACT_CALL, APPROVE->APPROVE, UNKNOWN->CONTRACT_CALL)"
    - "DELAY/APPROVAL tier 즉시 거부 패턴 (동기 API 비호환)"

key-files:
  created:
    - "packages/daemon/src/pipeline/sign-only.ts"
    - "packages/daemon/src/__tests__/sign-only-pipeline.test.ts"
  modified:
    - "packages/daemon/src/pipeline/database-policy-engine.ts"

key-decisions:
  - "sign-only 파이프라인을 별도 모듈로 분리 (stages.ts 수정 없음)"
  - "DELAY/APPROVAL tier는 POLICY_DENIED로 즉시 거부 (동기 API 비호환)"
  - "reservation SUM 쿼리에 SIGNED 포함하여 이중 지출 방지"
  - "TX_SUBMITTED 알림을 서명 완료 시 발행 (signOnly: true 메타데이터)"
  - "key release는 finally 블록에서만 수행 (catch에서 호출 금지)"

patterns-established:
  - "sign-only 파이프라인 테스트에서 in-memory SQLite + MockAdapter + MockKeyStore + DatabasePolicyEngine 실제 인스턴스 사용"

# Metrics
duration: 5min
completed: 2026-02-15
---

# Phase 117 Plan 01: Sign-Only Pipeline Summary

**executeSignOnly() 10-step 파이프라인 모듈과 reservation SUM 쿼리 SIGNED 확장으로 외부 tx 서명 + TOCTOU 이중 지출 방지 구현**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-14T16:11:52Z
- **Completed:** 2026-02-14T16:17:43Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- executeSignOnly() 10-step 파이프라인 모듈 생성 (parse -> map -> ID -> INSERT -> evaluate -> check -> tier check -> update tier -> sign -> SIGNED)
- mapOperationToParam() 헬퍼로 ParsedOperation 5종을 TransactionParam으로 변환
- evaluateAndReserve reservation SUM 쿼리에 SIGNED 상태 포함하여 sign-only tx의 reserved_amount가 SPENDING_LIMIT에 반영
- DELAY/APPROVAL tier 즉시 POLICY_DENIED 거부 + POST /v1/transactions/send 안내 메시지
- 17개 유닛 테스트 통과 (mapOperationToParam 5개 + executeSignOnly 12개)

## Task Commits

Each task was committed atomically:

1. **Task 1: sign-only.ts 파이프라인 모듈 + evaluateAndReserve SIGNED 쿼리 확장** - `b7fdf02` (feat)
2. **Task 2: sign-only 파이프라인 유닛 테스트** - `5277f97` (test)

## Files Created/Modified
- `packages/daemon/src/pipeline/sign-only.ts` - executeSignOnly() 10-step 파이프라인, mapOperationToParam() 헬퍼, SignOnlyDeps/SignOnlyRequest/SignOnlyResult 인터페이스
- `packages/daemon/src/pipeline/database-policy-engine.ts` - evaluateAndReserve reservation SUM 쿼리에 'SIGNED' 추가
- `packages/daemon/src/__tests__/sign-only-pipeline.test.ts` - sign-only 파이프라인 유닛 테스트 17개

## Decisions Made
- sign-only 파이프라인을 별도 sign-only.ts 모듈로 분리 (기존 stages.ts 6-stage 파이프라인 수정 없음)
- DELAY/APPROVAL tier는 POLICY_DENIED로 즉시 거부 (sign-only는 동기 API이므로 비동기 대기 불가)
- TX_SUBMITTED 알림을 서명 완료 시점에 fire-and-forget으로 발행 (signOnly: true 메타데이터 포함)
- key release는 반드시 finally 블록에서만 수행 (catch에서 releaseKey 호출 시 double-release 위험)
- sessionId FK 제약: 테스트에서 sessionId 없이 호출 (실제 API에서는 sessionAuth 미들웨어가 session 존재 보장)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] sessionId FK 제약으로 인한 테스트 실패**
- **Found during:** Task 2 (테스트 실행 시 INSTANT tier happy path)
- **Issue:** executeSignOnly에 'session-1' 문자열 전달 시 sessions 테이블에 해당 FK가 없어 FOREIGN KEY constraint failed
- **Fix:** 테스트에서 sessionId 파라미터를 제거 (undefined로 전달)
- **Files modified:** packages/daemon/src/__tests__/sign-only-pipeline.test.ts
- **Verification:** 17개 테스트 전체 통과
- **Committed in:** 5277f97 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 Rule 1 bug)
**Impact on plan:** 테스트 데이터 수정만 필요, 로직 변경 없음.

## Issues Encountered
- Pre-existing settings-service.test.ts 실패 (SETTING_DEFINITIONS count 32 -> 35 불일치) -- Phase 117 변경과 무관

## User Setup Required
None - 외부 서비스 설정 불필요.

## Next Phase Readiness
- sign-only.ts 모듈이 executeSignOnly() export -- Plan 02에서 REST API 라우트 핸들러가 이를 호출
- evaluateAndReserve에 SIGNED 포함되어 TOCTOU 이중 지출 방지 작동
- 17개 유닛 테스트가 파이프라인 로직 검증 완료
- Plan 02 (POST /v1/transactions/sign REST API 엔드포인트) 즉시 착수 가능

---
*Phase: 117-sign-only-pipeline-rest-api, Plan: 01*
*Completed: 2026-02-15*
