---
phase: 111-pipeline-network-resolution
plan: 01
subsystem: pipeline
tags: [network-resolver, environment, pipeline-context, error-codes, tdd]

# Dependency graph
requires:
  - phase: 109-environment-network-foundation
    provides: "EnvironmentType, getDefaultNetwork, validateChainNetwork, validateNetworkEnvironment"
  - phase: 110-schema-policy-engine
    provides: "wallet.environment + wallet.defaultNetwork DB 스키마, ALLOWED_NETWORKS 정책"
provides:
  - "resolveNetwork() 순수 함수 (3단계 우선순위 네트워크 해결)"
  - "ENVIRONMENT_NETWORK_MISMATCH 에러 코드 (TX 도메인, 69번째)"
  - "PipelineContext.resolvedNetwork 필드"
  - "Stage 1 INSERT network + Stage 3 policy network 전달"
affects: [111-02, transactions-route, daemon-lifecycle]

# Tech tracking
tech-stack:
  added: []
  patterns: ["순수 함수 네트워크 해결 (resolveNetwork)", "PipelineContext resolvedNetwork 전파 패턴"]

key-files:
  created:
    - "packages/daemon/src/pipeline/network-resolver.ts"
    - "packages/daemon/src/__tests__/network-resolver.test.ts"
  modified:
    - "packages/core/src/errors/error-codes.ts"
    - "packages/core/src/i18n/en.ts"
    - "packages/core/src/i18n/ko.ts"
    - "packages/daemon/src/pipeline/stages.ts"
    - "packages/daemon/src/api/routes/transactions.ts"
    - "packages/daemon/src/lifecycle/daemon.ts"
    - "packages/daemon/src/pipeline/pipeline.ts"

key-decisions:
  - "PIPE-D01: resolveNetwork()를 순수 함수로 별도 파일에 배치 (stages.ts 비대 방지)"
  - "PIPE-D03: ENVIRONMENT_NETWORK_MISMATCH 별도 에러 코드 (보안 중요도 높음)"
  - "PIPE-D04: daemon.ts executeFromStage5에서 tx.network 직접 사용 (resolveNetwork 재호출 안 함)"

patterns-established:
  - "resolveNetwork() 3단계 우선순위: request > walletDefault > envDefault"
  - "PipelineContext에서 wallet.environment + resolvedNetwork 분리 (immutable wallet 속성 vs resolved 결과)"

# Metrics
duration: 8min
completed: 2026-02-14
---

# Phase 111 Plan 01: resolveNetwork() TDD 구현 Summary

**resolveNetwork() 순수 함수 TDD 구현 -- 3단계 우선순위 네트워크 해결 + chain/environment 교차 검증 + ENVIRONMENT_NETWORK_MISMATCH 에러 코드 69번째 등록**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-14T12:03:54Z
- **Completed:** 2026-02-14T12:12:17Z
- **Tasks:** 2
- **Files modified:** 18

## Accomplishments
- resolveNetwork() 순수 함수 TDD 완성 (11개 테스트 PASS)
- ENVIRONMENT_NETWORK_MISMATCH 에러 코드 69번째로 등록 (TX 도메인, httpStatus 400)
- PipelineContext 인터페이스 확장: wallet.environment + wallet.defaultNetwork + resolvedNetwork
- Stage 1 INSERT에 network: ctx.resolvedNetwork, Stage 3 policy에 txParam.network 전달
- 6개 기존 파이프라인 테스트 mock을 새 인터페이스에 맞게 업데이트

## Task Commits

Each task was committed atomically:

1. **Task 1: RED -- resolveNetwork 테스트 + 에러 코드 + PipelineContext 확장** - `821b0b6` (test)
2. **Task 2: GREEN -- resolveNetwork() 순수 함수 구현 + 빌드/테스트 회귀 확인** - `e512839` (feat)

## Files Created/Modified
- `packages/daemon/src/pipeline/network-resolver.ts` - resolveNetwork() 순수 함수 (3단계 우선순위 + 2중 교차 검증)
- `packages/daemon/src/__tests__/network-resolver.test.ts` - 11개 TDD 테스트 (정상 5, 환경불일치 2, 체인불일치 2, L2 1, override 1)
- `packages/core/src/errors/error-codes.ts` - ENVIRONMENT_NETWORK_MISMATCH 에러 코드 추가 (69번째)
- `packages/core/src/i18n/en.ts` - 영문 에러 메시지 추가
- `packages/core/src/i18n/ko.ts` - 한글 에러 메시지 추가
- `packages/core/src/__tests__/errors.test.ts` - 에러 코드 카운트 68->69, TX 도메인 22->23
- `packages/core/src/__tests__/package-exports.test.ts` - 에러 코드 카운트 68->69
- `packages/core/src/__tests__/i18n.test.ts` - 에러 코드 카운트 68->69
- `packages/daemon/src/pipeline/stages.ts` - PipelineContext 인터페이스 변경 + Stage 1/3 network 전달
- `packages/daemon/src/api/routes/transactions.ts` - PipelineContext 생성 시 새 인터페이스 적용
- `packages/daemon/src/lifecycle/daemon.ts` - executeFromStage5에서 tx.network 직접 사용
- `packages/daemon/src/pipeline/pipeline.ts` - PipelineContext 생성 시 새 인터페이스 적용
- `packages/daemon/src/__tests__/pipeline*.test.ts` (6개) - 테스트 mock을 새 인터페이스에 맞게 업데이트

## Decisions Made
- **PIPE-D01**: resolveNetwork()를 `network-resolver.ts` 별도 파일에 순수 함수로 배치. stages.ts가 이미 700줄 이상이고 route handler에서도 import 필요.
- **PIPE-D03**: ENVIRONMENT_NETWORK_MISMATCH를 ACTION_VALIDATION_FAILED와 분리. 환경 불일치는 보안 중요도 높음 (testnet 키로 mainnet 트랜잭션 차단).
- **PIPE-D04**: daemon.ts executeFromStage5에서 tx.network(DB 기록값) 직접 사용. resolveNetwork() 재호출 시 wallet.defaultNetwork 변경으로 다른 네트워크가 리졸브될 위험.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] transactions.ts, daemon.ts, pipeline.ts PipelineContext 호출부 수정**
- **Found during:** Task 2 (GREEN -- 빌드 검증)
- **Issue:** PipelineContext 인터페이스 변경 후 3개 파일에서 `wallet.network` 참조로 TS2353 빌드 에러
- **Fix:** 3개 파일의 PipelineContext 생성부를 새 인터페이스(environment, defaultNetwork, resolvedNetwork)로 수정
- **Files modified:** transactions.ts, daemon.ts, pipeline.ts
- **Verification:** `pnpm build` 성공
- **Committed in:** e512839 (Task 2 commit)

**2. [Rule 2 - Missing Critical] 6개 파이프라인 테스트 mock 업데이트**
- **Found during:** Task 2 (GREEN -- 테스트 회귀 확인)
- **Issue:** 6개 파이프라인 테스트 파일의 PipelineContext mock이 구형 `wallet.network` 사용 (런타임 동작은 정상이나 타입 불일치)
- **Fix:** 모든 테스트 mock을 `wallet: { environment, defaultNetwork }` + `resolvedNetwork` 형태로 수정
- **Files modified:** pipeline.test.ts, pipeline-notification.test.ts, pipeline-stage1-stage3.test.ts, pipeline-stage4.test.ts, pipeline-integration.test.ts, pipeline-stage5-execute.test.ts
- **Verification:** 72개 파이프라인 테스트 모두 PASS
- **Committed in:** e512839 (Task 2 commit)

**3. [Rule 1 - Bug] i18n.test.ts 에러 코드 카운트 수정**
- **Found during:** Task 1 (RED -- core 테스트 검증)
- **Issue:** i18n.test.ts도 에러 코드 68개 하드코딩 확인. 플랜에 누락됨.
- **Fix:** 68 -> 69로 수정
- **Files modified:** packages/core/src/__tests__/i18n.test.ts
- **Verification:** `pnpm --filter @waiaas/core test` 168 PASS
- **Committed in:** 821b0b6 (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (1 bug, 1 missing critical, 1 blocking)
**Impact on plan:** 모든 auto-fix는 빌드 성공과 테스트 정합성에 필수. 스코프 변경 없음.

## Issues Encountered
- **Pre-existing**: api-agents.test.ts 6개 테스트 실패 (wallet API 응답에서 `body.network` 참조). Phase 110에서 wallet 스키마가 `network` -> `environment` + `defaultNetwork`로 변경되었으나 해당 테스트 미갱신. 이번 플랜 범위 외 (기존 결함).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- resolveNetwork() 함수가 준비되어 111-02에서 route handler 통합 (transactions.ts에서 resolveNetwork 호출 + AdapterPool 연동) 가능
- ENVIRONMENT_NETWORK_MISMATCH 에러 코드가 등록되어 route handler에서 WAIaaSError 변환 가능
- PipelineContext.resolvedNetwork 필드가 확정되어 전체 Stage 1-6에서 참조 가능

## Self-Check: PASSED

- [x] network-resolver.ts exists with resolveNetwork export
- [x] network-resolver.test.ts exists (11 tests)
- [x] ENVIRONMENT_NETWORK_MISMATCH in error-codes.ts
- [x] resolvedNetwork in stages.ts PipelineContext
- [x] Commit 821b0b6 (RED) exists
- [x] Commit e512839 (GREEN) exists
- [x] 111-01-SUMMARY.md exists

---
*Phase: 111-pipeline-network-resolution*
*Completed: 2026-02-14*
