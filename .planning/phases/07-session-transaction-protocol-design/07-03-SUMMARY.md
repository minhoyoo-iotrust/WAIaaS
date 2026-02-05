---
phase: 07-session-transaction-protocol-design
plan: 03
subsystem: api
tags: [transaction-pipeline, state-machine, zod, openapi, hono, session-api, wallet-api, cursor-pagination]

# Dependency graph
requires:
  - phase: 07-session-transaction-protocol-design
    provides: "세션 토큰 프로토콜 (SESS-PROTO), validateSessionConstraints(), SessionConstraintsSchema, SessionUsageStatsSchema"
  - phase: 07-session-transaction-protocol-design
    provides: "SolanaAdapter 13개 메서드 (CHAIN-SOL), pipe 빌드, 4단계 tx"
  - phase: 06-core-architecture-design
    provides: "transactions 테이블 (CORE-02), IChainAdapter (CORE-04), Hono/Zod SSoT (CORE-06)"
provides:
  - "거래 처리 파이프라인 6단계 설계 (TX-PIPE)"
  - "트랜잭션 상태 머신 8개 상태 + 허용 전이 매트릭스"
  - "API 9개 엔드포인트 Zod 요청/응답 스키마 전체 스펙"
  - "TransactionService 오케스트레이터 + 에러 복구 전략"
  - "IPolicyEngine 인터페이스 (Phase 8 확장점)"
  - "커서 기반 페이지네이션 공통 헬퍼 (UUID v7 활용)"
affects: [08-security-layers, 09-integration]

# Tech tracking
tech-stack:
  added: []
  patterns: ["파이프라인 6단계 순차 실행 오케스트레이터", "트랜잭션 상태 머신 + 전이 함수", "INSTANT 티어 동기 응답 (30초 타임아웃)", "커서 기반 페이지네이션 (UUID v7)", "에러 복구 전략 (Stage 5d 1회 재시도)"]

key-files:
  created: [".planning/deliverables/32-transaction-pipeline-api.md"]
  modified: []

key-decisions:
  - "INSTANT 티어 동기 응답: CONFIRMED까지 대기, 최대 30초 타임아웃"
  - "DELAY/APPROVAL 티어 비동기 응답: QUEUED 상태로 즉시 반환 (202 Accepted)"
  - "Phase 7 기본 동작: 모든 거래를 INSTANT 티어로 분류 (DefaultPolicyEngine passthrough)"
  - "Stage 5d 제출 실패 1회 재시도 (네트워크 일시 오류 대응, 500ms 대기)"
  - "Stage 5b 시뮬레이션 실패 시 재시도 불가 (새 요청 필요)"
  - "Stage 6 타임아웃 시 EXPIRED (blockhash 만료, 사용자 재요청)"
  - "커서 기반 페이지네이션: UUID v7의 시간 순서 활용 (WHERE id < cursor)"
  - "POST /v1/sessions는 sessionAuth 제외 (SESS-PROTO 결정 준수)"
  - "GET /v1/transactions/pending: Phase 7은 빈 배열 반환 (INSTANT만 사용)"

patterns-established:
  - "Pattern: 파이프라인 오케스트레이터 -- TransactionService.executeTransfer()가 6단계를 순차 실행, 각 단계 에러를 캐치하여 DB 상태 갱신"
  - "Pattern: 상태 전이 함수 -- validateTransition(current, next)로 비정상 전이 방지, ALLOWED_TRANSITIONS 맵 기반"
  - "Pattern: 에러 응답 팩토리 -- createErrorResponse(code, message, requestId, options)로 CORE-06 에러 포맷 준수"
  - "Pattern: 커서 기반 paginate() -- limit+1 조회 -> hasMore 판단 -> nextCursor 반환"

# Metrics
duration: 7min
completed: 2026-02-05
---

# Phase 7 Plan 03: Transaction Pipeline & API Summary

**거래 처리 파이프라인 6단계 설계 + 세션/거래/지갑/nonce API 9개 엔드포인트 Zod 스키마 전체 스펙 -- 상태 머신, 시퀀스 다이어그램, 오케스트레이터, Phase 8 확장점 인터페이스 포함**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-05T10:38:51Z
- **Completed:** 2026-02-05T10:45:38Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- 트랜잭션 상태 머신 8개 상태 + 허용 전이 매트릭스를 Mermaid stateDiagram으로 완전 정의
- 파이프라인 6단계 각각의 입력/출력/에러/DB 변경/audit_log를 코드 수준으로 상세 설계
- Stage 2에서 SESS-PROTO의 validateSessionConstraints() 5가지 검증 항목 통합
- Stage 5에서 CHAIN-SOL의 SolanaAdapter 4단계 실행 (build/simulate/sign/submit) 통합
- Phase 8 확장점: IPolicyEngine 인터페이스 + PolicyDecision 타입 + DefaultPolicyEngine passthrough 구현
- TransactionService 오케스트레이터 + 단계별 타이밍 로그 + 에러 복구 전략 설계
- API 9개 엔드포인트 (nonce 1 + session 3 + transaction 3 + wallet 2) 전체 Zod 스키마 정의
- 각 엔드포인트에 createRoute 패턴, operationId, tags, security, 에러 코드 명시
- 커서 기반 페이지네이션 공통 헬퍼 (UUID v7 시간 순서 활용) 설계
- 정상/실패 시퀀스 다이어그램 3개 (INSTANT 성공, 세션 제약 위반, 시뮬레이션 실패)
- INSTANT 티어 타이밍 예산 (30초 동기 응답) 분석

## Task Commits

Each task was committed atomically:

1. **Task 1: 거래 처리 파이프라인 6단계 상세 설계** - `537cec5` (feat)
2. **Task 2: 세션/거래/지갑 API 엔드포인트 전체 스펙 설계** - Task 1과 동일 커밋 (전체 문서를 구조적 일관성을 위해 한 번에 작성)

## Files Created/Modified

- `.planning/deliverables/32-transaction-pipeline-api.md` - 거래 처리 파이프라인 + API 전체 스펙 (TX-PIPE), 9개 섹션, ~2160줄

## Decisions Made

1. **INSTANT 티어 동기 응답 (30초):** CONFIRMED까지 HTTP 응답을 대기한다. 타임아웃 시 SUBMITTED 상태로 응답하고 클라이언트가 GET으로 폴링한다. Solana confirmed ~400ms~6초이므로 대부분 5초 내 완료.

2. **DELAY/APPROVAL 비동기 응답 (202):** QUEUED 상태로 즉시 응답한다. Phase 8에서 백그라운드 워커(DELAY) 또는 Owner 승인(APPROVAL)이 Stage 5 재진입을 트리거한다.

3. **Phase 7 DefaultPolicyEngine passthrough:** 정책 미설정 시 모든 거래를 ALLOW + INSTANT으로 통과시킨다. Phase 8에서 policies 테이블 기반 실제 정책 평가로 교체된다.

4. **Stage 5d 1회 재시도:** 제출 실패가 네트워크 일시 오류일 수 있으므로 500ms 대기 후 1회 재시도한다. 서명된 트랜잭션은 동일하므로 멱등 재시도가 안전하다.

5. **커서 기반 페이지네이션:** UUID v7의 시간 순서를 활용하여 `WHERE id < cursor ORDER BY id DESC LIMIT N` 패턴을 사용한다. offset 기반 대비 성능 우수하고 concurrent insert에 안전하다.

6. **GET /v1/transactions/pending Phase 7 동작:** 모든 거래가 INSTANT이므로 QUEUED 상태 거래가 없어 빈 배열을 반환한다. Phase 8에서 DELAY/APPROVAL 대기 거래가 이 엔드포인트로 조회된다.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 7 세션/거래/지갑 API 전체 스펙이 완성되어 Phase 8 Security Layers 설계 준비 완료
- IPolicyEngine 인터페이스가 Phase 8 정책 엔진의 계약(contract)으로 작동
- 4개 보안 티어(INSTANT/NOTIFY/DELAY/APPROVAL) 분기 로직이 Phase 8 시간 지연/승인 설계의 기반
- 상태 전이 함수가 Phase 8 Kill Switch의 일괄 상태 변경에 활용 가능
- 에러 복구 전략이 Phase 9 SDK/MCP의 자동 재시도 정책 설계 기반

---
*Phase: 07-session-transaction-protocol-design*
*Completed: 2026-02-05*
