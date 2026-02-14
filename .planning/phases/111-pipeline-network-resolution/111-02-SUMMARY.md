---
phase: 111-pipeline-network-resolution
plan: 02
subsystem: pipeline
tags: [network-resolver, route-handler, daemon-lifecycle, adapter-pool, error-conversion, integration-test]

# Dependency graph
requires:
  - phase: 111-pipeline-network-resolution
    plan: 01
    provides: "resolveNetwork() 순수 함수, ENVIRONMENT_NETWORK_MISMATCH 에러 코드, PipelineContext.resolvedNetwork"
  - phase: 110-schema-policy-engine
    provides: "wallet.environment + wallet.defaultNetwork DB 스키마, ALLOWED_NETWORKS 정책"
provides:
  - "transactions.ts resolveNetwork() 호출 + ENVIRONMENT_NETWORK_MISMATCH WAIaaSError 변환"
  - "daemon.ts executeFromStage5 tx.network 직접 사용 + getDefaultNetwork fallback (PIPE-D04)"
  - "pipeline.ts resolveNetwork() 호출 (approve/reject 워크플로우 경로)"
  - "AdapterPool에 resolvedNetwork 전달 (rpcUrl + adapter resolve)"
  - "네트워크 해결 통합 테스트 5개"
affects: [transactions-api, daemon-lifecycle, pipeline, adapter-pool]

# Tech tracking
tech-stack:
  added: []
  patterns: ["resolveNetwork → WAIaaSError 변환 패턴 (environment → ENVIRONMENT_NETWORK_MISMATCH, chain → ACTION_VALIDATION_FAILED)", "daemon.ts 재진입 시 tx.network DB 기록값 직접 사용 (resolveNetwork 재호출 안 함)"]

key-files:
  created:
    - "packages/daemon/src/__tests__/pipeline-network-resolve.test.ts"
  modified:
    - "packages/daemon/src/api/routes/transactions.ts"
    - "packages/daemon/src/lifecycle/daemon.ts"
    - "packages/daemon/src/pipeline/pipeline.ts"

key-decisions:
  - "PIPE-D04 준수: daemon.ts executeFromStage5에서 tx.network 직접 사용, null일 때 getDefaultNetwork fallback"
  - "resolveNetwork 에러 분류: environment 포함 메시지 -> ENVIRONMENT_NETWORK_MISMATCH, 나머지 -> ACTION_VALIDATION_FAILED"
  - "pipeline.ts에도 resolveNetwork 호출 추가 (approve/reject 워크플로우에서 TransactionPipeline 사용 가능성)"

patterns-established:
  - "Route handler에서 resolveNetwork() catch → WAIaaSError 변환 + 보안 로깅 패턴"
  - "daemon.ts 재진입 시 DB 기록값(tx.network) 우선 사용 패턴 (wallet 설정 변경 시 안전성 확보)"
  - "AdapterPool.resolve에 resolvedNetwork 전달 패턴 (rpcUrl과 adapter 모두 동일 네트워크)"

# Metrics
duration: 5min
completed: 2026-02-14
---

# Phase 111 Plan 02: 파이프라인 네트워크 해결 통합 Summary

**transactions.ts/daemon.ts/pipeline.ts에 resolveNetwork() 통합 -- 환경 불일치 WAIaaSError 변환 + AdapterPool resolvedNetwork 전달 + daemon.ts 재진입 tx.network 직접 사용 + 통합 테스트 5개**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-14T12:15:33Z
- **Completed:** 2026-02-14T12:20:50Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- transactions.ts POST /transactions/send에서 resolveNetwork() 호출 + ENVIRONMENT_NETWORK_MISMATCH / ACTION_VALIDATION_FAILED WAIaaSError 변환 완료
- daemon.ts executeFromStage5에서 tx.network(DB 기록값) 직접 사용 + getDefaultNetwork fallback (PIPE-D04 준수)
- pipeline.ts TransactionPipeline.executeSend에서 resolveNetwork() 호출로 approve/reject 워크플로우 경로도 커버
- AdapterPool의 resolveRpcUrl + resolve에 resolvedNetwork 전달 (3개 파일 모두)
- 통합 테스트 5개: Stage 1 기록, Stage 3 전달, 환경 불일치, 체인 불일치, daemon.ts 재진입

## Task Commits

Each task was committed atomically:

1. **Task 1: transactions.ts + daemon.ts + pipeline.ts 네트워크 해결 통합** - `767a6d2` (feat)
2. **Task 2: 네트워크 해결 통합 테스트 + 기존 테스트 회귀 수정** - `4e21da7` (test)

## Files Created/Modified
- `packages/daemon/src/api/routes/transactions.ts` - resolveNetwork() 호출 + WAIaaSError 변환 + resolvedNetwork를 rpcUrl/adapter/PipelineContext에 전달
- `packages/daemon/src/lifecycle/daemon.ts` - tx.network 직접 사용 + getDefaultNetwork fallback + resolvedNetwork를 rpcUrl/adapter에 전달
- `packages/daemon/src/pipeline/pipeline.ts` - resolveNetwork() 호출 + resolvedNetwork를 PipelineContext에 전달
- `packages/daemon/src/__tests__/pipeline-network-resolve.test.ts` - 5개 통합 테스트 (Stage 1 기록, Stage 3 전달, 환경 불일치, 체인 불일치, 재진입 시뮬레이션)

## Decisions Made
- **PIPE-D04 준수**: daemon.ts executeFromStage5에서 resolveNetwork() 재호출 대신 tx.network(DB 기록값) 직접 사용. wallet.defaultNetwork가 변경되어도 이미 생성된 트랜잭션의 네트워크가 바뀌지 않음.
- **에러 분류 전략**: resolveNetwork()가 던지는 에러 메시지에 "environment" 포함 여부로 ENVIRONMENT_NETWORK_MISMATCH vs ACTION_VALIDATION_FAILED 구분. 환경 불일치는 보안 중요도 높으므로 별도 에러 코드 + 콘솔 경고.
- **pipeline.ts에도 resolveNetwork 추가**: TransactionPipeline.executeSend()가 approve/reject 워크플로우에서 사용될 가능성 있으므로, route handler와 동일한 네트워크 해결 로직 적용.

## Deviations from Plan

None - plan executed exactly as written. 111-01에서 PipelineContext 인터페이스 변경과 테스트 mock 업데이트가 이미 완료되어 이번 플랜에서는 추가 회귀 수정 불필요.

## Issues Encountered
- **Pre-existing**: api-agents.test.ts 6개 테스트 실패 (wallet API 응답에서 `body.network` 참조). Phase 110에서 wallet 스키마 변경 후 미갱신. 이번 플랜 범위 외.
- **Pre-existing**: CLI E2E 3개 실패 (E-07~09). 이번 플랜 범위 외.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 111 전체 완료: resolveNetwork() 순수 함수 + PipelineContext 확장 + route handler/daemon.ts/pipeline.ts 통합
- 전체 네트워크 해결 흐름 완성: HTTP 요청 -> resolveNetwork -> AdapterPool -> Stage 1 DB 기록 -> Stage 3 정책 -> Stage 5 실행
- Phase 112+ 준비 완료: 멀티네트워크 지원, L2 확장 등 후속 작업 가능

## Self-Check: PASSED

- [x] pipeline-network-resolve.test.ts exists (5 tests)
- [x] transactions.ts contains resolveNetwork import + call
- [x] daemon.ts contains getDefaultNetwork import + tx.network usage
- [x] pipeline.ts contains resolveNetwork import + call
- [x] Commit 767a6d2 (Task 1 feat) exists
- [x] Commit 4e21da7 (Task 2 test) exists
- [x] 111-02-SUMMARY.md exists

---
*Phase: 111-pipeline-network-resolution*
*Completed: 2026-02-14*
