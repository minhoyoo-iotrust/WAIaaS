---
phase: 106-pipeline-network-resolve-design
plan: 01
subsystem: pipeline
tags: [network-resolver, pipeline-context, environment-validation, adapter-pool]

# Dependency graph
requires:
  - phase: 105-environment-data-model-db-migration
    provides: "EnvironmentType 매핑 함수 4개 (getDefaultNetwork, validateNetworkEnvironment, getNetworksForEnvironment, deriveEnvironment) + WalletSchema 변경 + DB 마이그레이션 v6a/v6b 설계"
provides:
  - "resolveNetwork() 순수 함수 설계 (3단계 우선순위 + 2중 검증)"
  - "PipelineContext 확장 설계 (wallet.environment + resolvedNetwork)"
  - "ENVIRONMENT_NETWORK_MISMATCH 에러 코드 설계 (TX domain, 400)"
  - "AdapterPool 호출부 2곳 변경 설계 (transactions.ts + daemon.ts)"
  - "Stage 1~6 데이터 흐름도 (resolvedNetwork 전파 경로)"
  - "daemon.ts executeFromStage5 tx.network NULL fallback 설계"
affects: [107-policy-network-design, 108-api-interface-design]

# Tech tracking
tech-stack:
  added: []
  patterns: ["resolveNetwork() 순수 함수 패턴 (3-level priority + 2-step validation)", "PipelineContext 생성 전 검증 시점 패턴", "tx.network DB 기록 -> 재진입부 직접 사용 패턴"]

key-files:
  created:
    - docs/70-pipeline-network-resolve-design.md
  modified: []

key-decisions:
  - "PIPE-D01: resolveNetwork()를 순수 함수로 설계 (클래스 아님)"
  - "PIPE-D02: 환경 검증 시점을 PipelineContext 생성 전(Route Handler)으로 결정"
  - "PIPE-D03: ENVIRONMENT_NETWORK_MISMATCH를 별도 TX 도메인 에러 코드로 신설"
  - "PIPE-D04: daemon.ts executeFromStage5에서 tx.network 직접 사용 (resolveNetwork 재호출 안 함)"
  - "PIPE-D05: AdapterPool 시그니처 변경 불필요 (호출부만 변경)"
  - "PIPE-D06: resolveNetwork()를 별도 파일(network-resolver.ts)에 배치"

patterns-established:
  - "네트워크 리졸브 순수 함수: request > wallet.default > environment fallback 우선순위"
  - "PipelineContext 생성 전 검증: DB INSERT 전에 환경-네트워크 교차 검증 완료"
  - "재진입부 DB 기록 참조: DELAY/APPROVAL 후 tx.network으로 동일 네트워크 보장"

# Metrics
duration: 6min
completed: 2026-02-14
---

# Phase 106 Plan 01: 파이프라인 네트워크 리졸브 설계 Summary

**resolveNetwork() 3단계 우선순위 순수 함수 + PipelineContext.resolvedNetwork 전파 + ENVIRONMENT_NETWORK_MISMATCH 에러 코드 + AdapterPool 호출부 2곳 변경 통합 설계 문서(docs/70, 7개 섹션)**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-14T01:27:22Z
- **Completed:** 2026-02-14T01:33:41Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- resolveNetwork() 순수 함수의 3단계 우선순위(request > wallet.default > environment), 2중 검증(chain + environment), 에러 분기 3개를 의사코드로 완전 정의 (입출력 예시 11개)
- PipelineContext.wallet.environment + resolvedNetwork의 Stage 1~6 전체 데이터 흐름도와 각 Stage별 참조 방식을 코드 수준으로 명시
- ENVIRONMENT_NETWORK_MISMATCH 에러 코드를 TX 도메인에 신설 (보안 이벤트 로깅 포함)하여 기존 68개 에러 코드 체계와 일관되게 정의
- AdapterPool 호출부 2곳(transactions.ts, daemon.ts)의 변경 의사코드를 캐시 키 호환성 확인 + NULL fallback과 함께 기술

## Task Commits

Each task was committed atomically:

1. **Task 1: NetworkResolver + ENVIRONMENT_NETWORK_MISMATCH + 환경 교차 검증** - `44dd4ab` (feat)
2. **Task 2: PipelineContext 확장 + Stage 1~6 흐름도 + AdapterPool 변경 + 설계 결정** - `990bfc3` (feat)

## Files Created/Modified

- `docs/70-pipeline-network-resolve-design.md` - 파이프라인 네트워크 리졸브 + 환경 교차 검증 + AdapterPool 호출 변경 통합 설계 문서 (7개 섹션 + 부록 2개)

## Decisions Made

- **PIPE-D01:** resolveNetwork()를 순수 함수로 설계. 상태 없는 로직에 클래스는 과도. 기존 validateChainNetwork() 패턴과 일관.
- **PIPE-D02:** 환경 검증 시점을 PipelineContext 생성 전으로 결정. DB INSERT 전 검증 보장으로 고아 PENDING 레코드 방지.
- **PIPE-D03:** ENVIRONMENT_NETWORK_MISMATCH를 TX 도메인 별도 에러 코드로 신설. 보안 추적 필요성.
- **PIPE-D04:** daemon.ts executeFromStage5에서 resolveNetwork() 재호출 대신 tx.network 직접 사용. wallet.defaultNetwork 변경 안전성.
- **PIPE-D05:** AdapterPool 시그니처 변경 불필요. 캐시 키 chain:network이 이미 완벽한 추상화.
- **PIPE-D06:** resolveNetwork()를 별도 파일(network-resolver.ts)에 배치. stages.ts 700줄+ 비대 + route handler import 필요.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- docs/70 설계 문서가 v1.4.6 구현자에게 resolveNetwork() -> PipelineContext -> Stage 1 INSERT -> AdapterPool 호출 변경까지 코드 작성에 충분한 의사코드를 제공
- Phase 107(정책 설계)에서 ctx.resolvedNetwork 참조 인터페이스가 확정됨
- Phase 108(API 설계)에서 request.network 필드 + TransactionRequestSchema 확장의 기반이 마련됨
- Phase 105의 docs/68(매핑 함수) + docs/69(마이그레이션)와의 참조 관계가 명확히 문서화됨

## Self-Check: PASSED

- FOUND: docs/70-pipeline-network-resolve-design.md
- FOUND: 106-01-SUMMARY.md
- FOUND: commit 44dd4ab (Task 1)
- FOUND: commit 990bfc3 (Task 2)

---
*Phase: 106-pipeline-network-resolve-design*
*Completed: 2026-02-14*
