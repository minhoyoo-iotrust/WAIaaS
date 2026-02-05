---
phase: 03-system-architecture
plan: 02
subsystem: api, security
tags: [transaction-flow, policy-engine, fail-safe, escalation, mermaid]

# Dependency graph
requires:
  - phase: 03-01
    provides: Dual Key 아키텍처 (ARCH-01), 시스템 컴포넌트 (ARCH-02)
provides:
  - 트랜잭션 데이터 흐름 다이어그램 (ARCH-03)
  - 8단계 트랜잭션 처리 흐름
  - 이중 정책 검증 상세 (서버 + Enclave)
  - Fail-safe 동작 모드 정의
  - 4단계 에스컬레이션 체계 (LOW/MEDIUM/HIGH/CRITICAL)
  - 트랜잭션 상태 코드 정의
affects: [03-03, 04-api-design, 05-implementation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fail-safe 원칙: 장애 시 모든 트랜잭션 거부"
    - "이중 정책 검증: API 레벨 + Enclave 레벨"
    - "단계별 에스컬레이션: 위반 심각도에 따른 차등 대응"
    - "재시도 없음: 호출자가 재시도 결정"
    - "동기 + Webhook: 즉시 응답과 비동기 알림 모두 지원"

key-files:
  created:
    - .planning/deliverables/10-transaction-flow.md
  modified: []

key-decisions:
  - "3중 정책 검증 레이어: 서버 → Enclave → Squads 온체인"
  - "10가지 정책 위반 코드 및 심각도 정의"
  - "4단계 Fail-safe 시나리오별 대응 정의"
  - "에스컬레이션 수준별 알림 채널 및 자동 조치 정의"
  - "5가지 트랜잭션 상태 코드 (PENDING, SUBMITTED, CONFIRMED, FAILED, REJECTED)"
  - "Webhook 재시도 정책: 3회, exponential backoff"

patterns-established:
  - "트랜잭션 흐름 8단계: 진입 → 1차검증 → 구성 → 시뮬레이션 → 2차검증+서명 → 온체인정책 → 제출 → 통보"
  - "에스컬레이션 4단계: LOW(알림) → MEDIUM(승인대기) → HIGH(동결) → CRITICAL(키해제)"
  - "Fail-safe 패턴: Enclave 연결 실패 시 즉시 거부, RPC 장애 시 fallback"

# Metrics
duration: 5min
completed: 2026-02-04
---

# Phase 03 Plan 02: 트랜잭션 데이터 흐름 다이어그램 Summary

**8단계 트랜잭션 흐름과 3중 정책 검증 레이어, Fail-safe 동작 모드, 4단계 에스컬레이션 체계를 10개의 Mermaid 다이어그램으로 시각화**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-04T14:19:21Z
- **Completed:** 2026-02-04T14:24:33Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- 트랜잭션 요청부터 온체인 확정까지 8단계 흐름 상세 문서화
- 서버 + Enclave + Squads 온체인 3중 정책 검증 레이어 설계
- Fail-safe 동작 모드 4가지 장애 시나리오별 정의
- LOW/MEDIUM/HIGH/CRITICAL 4단계 에스컬레이션 체계 수립
- 10개의 Mermaid 다이어그램으로 시각적 이해도 향상

## Task Commits

1. **Task 1: 트랜잭션 데이터 흐름 다이어그램 문서 작성 (ARCH-03)** - `c079682` (docs)

**Note:** 이 커밋은 03-03 plan의 security threat model과 함께 커밋됨

## Files Created/Modified

- `.planning/deliverables/10-transaction-flow.md` - 트랜잭션 데이터 흐름 다이어그램 (ARCH-03)

## Decisions Made

1. **3중 정책 검증 레이어 구조:**
   - Layer 1 (서버): 빠른 거부로 불필요한 처리 방지
   - Layer 2 (Enclave): 서버 침해 시 방어선
   - Layer 3 (온체인): 최종 불변 방어선

2. **Fail-safe 동작 원칙:**
   - Enclave 연결 실패 → 모든 트랜잭션 거부
   - 시뮬레이션 실패 → 해당 트랜잭션 거부
   - 모든 RPC 장애 → 트랜잭션 거부 (재시도 없음)

3. **에스컬레이션 수준별 대응:**
   - LOW: Push 알림만, 트랜잭션 거부
   - MEDIUM: Owner 승인 대기 (1시간 타임아웃)
   - HIGH: 지갑 즉시 동결 + 긴급 알림
   - CRITICAL: Agent Key 해제 + 긴급 잠금

4. **재시도 정책: 없음**
   - 호출자(AI Agent)가 재시도 여부 결정
   - retryable, failureCategory 정보 제공으로 판단 지원

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- ARCH-03 트랜잭션 흐름 문서 완료
- ARCH-04 보안 위협 모델 (03-03)로 이어서 진행 가능
- ARCH-01, ARCH-02와의 연결성 확보됨:
  - Agent Key 서명 흐름: ARCH-01 참조
  - 컴포넌트 간 데이터 흐름: ARCH-02 참조

---
*Phase: 03-system-architecture*
*Completed: 2026-02-04*
