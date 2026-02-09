---
phase: 45-core-impl-objectives
plan: 01
subsystem: planning
tags: [objective, v1.1, v1.2, core-infra, auth, policy-engine, solana, jwt, argon2id]

# Dependency graph
requires:
  - phase: v0.1-v0.10
    provides: 30개 설계 문서 (24-64), 276 요구사항
provides:
  - v1.1 코어 인프라 + 기본 전송 objective 문서 (설계 문서 9개 매핑, E2E 12건)
  - v1.2 인증 + 정책 엔진 objective 문서 (설계 문서 7개 매핑, E2E 20건)
affects: [45-02, 46-core-impl-objectives, v1.1-implementation, v1.2-implementation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "objective 문서 7-section 부록 구조 (목표/구현 대상 설계 문서/산출물/기술 결정/E2E 검증/의존/리스크)"
    - "E2E 자동화 태그 체계 ([L0]~[L3], [HUMAN])"

key-files:
  created:
    - objectives/v1.1-core-infrastructure.md
    - objectives/v1.2-auth-policy-engine.md
  modified: []

key-decisions:
  - "v1.1 REST API 6개 최소 엔드포인트 확정 (agents, wallet balance/address, transactions, health)"
  - "v1.1 파이프라인 Stage 3 INSTANT 고정 패스스루 전략"
  - "v1.2 E2E 시나리오 20건 전체 [L0] 자동화 (DELAY/APPROVAL 테스트용 타이머 단축 + 테스트 키페어 자동 서명)"
  - "v1.2 WalletConnect는 v1.6에서 구현, v1.2에서는 CLI 수동 서명만"

patterns-established:
  - "objective 문서 구현 범위 명시 패턴: 전체/부분 + 구현하지 않는 범위(마일스톤 명시)"
  - "v0.8/v0.10 설계 결정 ID 추적 패턴: 설계 결정 ID -> 반영 위치 테이블"

# Metrics
duration: 6min
completed: 2026-02-09
---

# Phase 45 Plan 01: v1.1/v1.2 코어 구현 Objective 문서 Summary

**v1.1(코어 인프라 9개 설계 문서/E2E 12건) + v1.2(인증 정책 7개 설계 문서/E2E 20건) objective 문서 2개 생성, 전체 [L0] 자동화, [HUMAN] 0건**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-09T13:30:03Z
- **Completed:** 2026-02-09T13:36:26Z
- **Tasks:** 2/2
- **Files created:** 2

## Accomplishments

- v1.1 코어 인프라 objective 문서 완성: 설계 문서 9개(24-29, 31, 45, 54) 구현 범위 전체/부분 명시, 패키지 5개 + REST API 6개 산출물, E2E 12건 [L0]
- v1.2 인증 + 정책 엔진 objective 문서 완성: 설계 문서 7개(29, 30, 32, 33, 34, 52, 53) 구현 범위 명시, 컴포넌트 11개 산출물, E2E 20건 [L0]
- v0.8 Owner 선택적 등록 + v0.10 설계 결정 6건(PLCY-01/02/03, CONC-02, OWNER-01/07) v1.2 문서에 반영
- 두 문서 모두 부록 구조(7개 섹션) 완전 준수, [HUMAN] 0건

## Task Commits

Each task was committed atomically:

1. **Task 1: v1.1 코어 인프라 + 기본 전송 objective 문서 생성** - `6a4942a` (feat)
2. **Task 2: v1.2 인증 + 정책 엔진 objective 문서 생성** - `3a3c68b` (feat)

## Files Created/Modified

- `objectives/v1.1-core-infrastructure.md` - v1.1 마일스톤 objective: 설계 문서 9개 매핑, 패키지 5개 산출물, REST API 6개, 파이프라인 6-stage 골격, E2E 12건, 기술 결정 11건, 리스크 5건
- `objectives/v1.2-auth-policy-engine.md` - v1.2 마일스톤 objective: 설계 문서 7개 매핑, 컴포넌트 11개 산출물(sessionAuth/masterAuth/ownerAuth/authRouter/DatabasePolicyEngine/DELAY Worker/APPROVAL Worker/TOCTOU/Owner API/세션 관리/Rate Limiter), E2E 20건, 기술 결정 8건, 리스크 6건

## Decisions Made

1. **v1.1 REST API 인증 전략:** v1.1에서는 sessionAuth 미구현이므로 masterAuth implicit(데몬 구동 = 인증 완료)로 모든 API 호출. v1.2에서 전환
2. **v1.1 파이프라인 골격:** Stage 2/3/4 패스스루, Stage 3는 DefaultPolicyEngine(INSTANT 고정). v1.2에서 DatabasePolicyEngine으로 교체
3. **v1.2 DELAY/APPROVAL 테스트 전략:** 실 시간 대기 불가이므로 테스트 전용 config로 타임아웃 5~10초 단축 + 테스트 키페어 자동 서명
4. **v1.2 WalletConnect 시점:** v1.6(Desktop)에서 구현. v1.2에서는 CLI 기반 SIWS/SIWE 수동 서명 + 테스트 키페어

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- v1.1/v1.2 objective 문서 완성으로 45-02(v1.3/v1.4 objective) 착수 준비 완료
- v1.1 구현 착수를 위한 구현 범위/검증 기준 확정 완료
- v1.2 구현 착수를 위한 인증/정책 구현 범위 + v0.8/v0.10 설계 반영 완료
- 차단 요소 없음

## Self-Check: PASSED

---
*Phase: 45-core-impl-objectives*
*Completed: 2026-02-09*
