---
phase: 08-security-layers-design
plan: 01
subsystem: security
tags: [policy-engine, time-lock, approval, toctou, sqlite, zod, spending-limit]

# Dependency graph
requires:
  - phase: 07-session-transaction-protocol-design
    provides: IPolicyEngine 인터페이스, 파이프라인 Stage 3/4 확장점, 8-state transaction machine
  - phase: 06-core-architecture-design
    provides: policies 테이블 기본 구조 (CORE-02), IChainAdapter 4단계 tx (CORE-04)
provides:
  - DatabasePolicyEngine (DB-backed IPolicyEngine 구현)
  - 4-티어 보안 분류 상태 머신 (INSTANT/NOTIFY/DELAY/APPROVAL)
  - DELAY 쿨다운 큐잉 + 자동 실행 플로우 (DelayQueueWorker)
  - APPROVAL Owner 승인/거절/만료 플로우 (ApprovalTimeoutWorker)
  - TOCTOU 방지 reserved_amount 패턴
  - policies 테이블 스키마 확정 + PolicyRuleSchema (Zod)
  - Owner approve/reject API 엔드포인트 스펙
affects: [08-02-owner-wallet, 08-03-notification, 08-04-kill-switch, 09-01-api-spec]

# Tech tracking
tech-stack:
  added: []
  patterns: [DatabasePolicyEngine DB-backed rule evaluator, BEGIN IMMEDIATE reserved amount TOCTOU prevention, setInterval polling worker, policy override resolution]

key-files:
  created: [.planning/deliverables/33-time-lock-approval-mechanism.md]
  modified: []

key-decisions:
  - "policies 테이블 type 변경: ALLOWED_ADDRESSES -> WHITELIST, AUTO_STOP -> 08-04 분리, RATE_LIMIT 추가"
  - "인덱스 통합: idx_policies_agent_id + idx_policies_enabled -> idx_policies_agent_enabled 복합 인덱스"
  - "정책 캐시 없음: 매 요청 DB 직접 조회 (보안 정책 즉시 적용 보장)"
  - "에이전트별 정책 override: 같은 type이면 에이전트별 정책만 적용, 글로벌 무시"
  - "DELAY 폴링 주기 10초, APPROVAL 타임아웃 폴링 30초"
  - "DELAY/APPROVAL 거래 실행 시점에 tx 빌드 (blockhash 신선도 보장)"
  - "reserved_amount 좀비 정리: 15분 PENDING 초과 시 자동 EXPIRED 전이"
  - "DELAY 최소 쿨다운 60초, APPROVAL 최소 타임아웃 300초, 최대 86400초"

patterns-established:
  - "DatabasePolicyEngine: DENY 우선 순차 평가 (WHITELIST -> TIME_RESTRICTION -> RATE_LIMIT -> SPENDING_LIMIT)"
  - "BEGIN IMMEDIATE + reserved_amount: 정책 평가와 예약 기록을 원자적으로 수행하여 TOCTOU 방지"
  - "setInterval Worker: 폴링 기반 백그라운드 워커 (DelayQueueWorker, ApprovalTimeoutWorker)"
  - "Stage 5a 재실행: DELAY/APPROVAL 승인 후 buildTransaction부터 재실행 (blockhash 신선도)"

# Metrics
duration: 7min
completed: 2026-02-05
---

# Phase 8 Plan 01: 시간 지연 + 승인 메커니즘 Summary

**DatabasePolicyEngine 4-티어 보안 분류 + DELAY 쿨다운 큐잉 + APPROVAL Owner 승인 플로우 + TOCTOU 방지 reserved_amount 패턴 전체 설계**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-05T11:23:13Z
- **Completed:** 2026-02-05T11:30:50Z
- **Tasks:** 2
- **Files created:** 1

## Accomplishments
- DatabasePolicyEngine 6단계 평가 알고리즘 설계 (DENY 우선 순차 평가 + 4-티어 분류)
- policies 테이블 스키마 확정 + PolicyRuleSchema Zod 스키마 4종 (SPENDING_LIMIT, WHITELIST, TIME_RESTRICTION, RATE_LIMIT)
- 4-티어 보안 분류 상태 머신을 Mermaid stateDiagram + flowchart로 문서화
- DELAY 쿨다운 큐잉 플로우 + DelayQueueWorker 설계 (10초 폴링, 순차 실행)
- APPROVAL Owner 승인 대기 플로우 + ApprovalTimeoutWorker + approve/reject API 스펙
- TOCTOU 방지 BEGIN IMMEDIATE + reserved_amount 패턴 (동시 요청 시나리오 시퀀스 다이어그램)
- Phase 7 파이프라인 Stage 3/4 통합 포인트 4개 명시 + 데몬 라이프사이클 통합

## Task Commits

Each task was committed atomically:

1. **Task 1: DatabasePolicyEngine + 4-티어 상태 머신 + policies 스키마 설계** - `a6c9f83` (feat)
2. **Task 2: DELAY 쿨다운 큐잉 + APPROVAL 승인 플로우 상세 설계** - `a88196f` (feat)

## Files Created/Modified
- `.planning/deliverables/33-time-lock-approval-mechanism.md` - 시간 지연 + 승인 메커니즘 전체 설계 (10개 섹션, DatabasePolicyEngine, 4-티어 상태 머신, DELAY/APPROVAL 플로우, TOCTOU 방지)

## Decisions Made
1. **policies 타입 변경**: CORE-02의 `ALLOWED_ADDRESSES` -> `WHITELIST` (더 직관적), `AUTO_STOP` -> 08-04에서 별도 설계. `RATE_LIMIT` 신규 추가
2. **인덱스 통합**: 3개 단일 인덱스 -> `idx_policies_agent_enabled` 복합 인덱스 + `idx_policies_type` (쿼리 최적화)
3. **정책 캐시 없음**: 매 요청 DB 직접 조회. SQLite WAL 읽기 <1ms이므로 성능 충분. 보안 정책 즉시 적용 보장
4. **에이전트별 override**: 같은 type에 에이전트별 정책 존재 시 글로벌 정책 무시 (resolveOverrides)
5. **워커 폴링 주기**: DELAY 10초, APPROVAL 30초 (최소 쿨다운/타임아웃 대비 충분한 정밀도)
6. **tx 빌드 시점**: 실행 시점 (Stage 5a) -- DELAY/APPROVAL 모두 동일. blockhash 만료 방지
7. **좀비 예약량 정리**: PENDING + 15분 초과 -> EXPIRED 자동 전이 (5분 주기 + 데몬 시작 시)
8. **APPROVAL 타임아웃 범위**: 최소 300초 ~ 최대 86400초. 24시간 초과 reserved_amount 장기 보유 방지

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- DatabasePolicyEngine 설계 완료 -> 08-02 (Owner 지갑 연결)에서 ownerAuth 미들웨어 상세화 가능
- DELAY/APPROVAL 알림 호출 포인트 정의 -> 08-03 (알림 아키텍처)에서 NotificationService 설계 시 참조
- 정책 변경 감사 로그 정의 -> 08-04 (Kill Switch)에서 감사 로그 체계와 통합
- approve/reject API 스펙 -> 09-01 (REST API 전체 스펙)에서 OpenAPI 정의 시 포함

---
*Phase: 08-security-layers-design*
*Completed: 2026-02-05*
