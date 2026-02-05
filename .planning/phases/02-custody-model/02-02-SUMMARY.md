---
phase: 02-custody-model
plan: 02
subsystem: security
tags: [custody, dual-key, mpc, tee, squads, policy-engine, agent-wallet]

# Dependency graph
requires:
  - phase: 02-custody-model
    provides: CONTEXT.md AI 에이전트 특화 관점 결정, RESEARCH.md 커스터디 모델 분석
provides:
  - AI 에이전트 특화 커스터디 고려사항 문서 (CUST-02)
  - 일반 사용자 vs AI 에이전트 비교 분석
  - 자율성 제한 복합 정책 설계
  - 에이전트-서버 비밀값 분리 설계 (3가지 옵션)
  - 장애 복구 메커니즘 (5가지 유형)
  - 위협 모델 및 대응 방안 (6가지)
  - Dual Key 아키텍처 개념 정의
affects: [03-architecture, security-design, policy-engine]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dual Key Architecture (Owner Key + Agent Key)"
    - "Policy-governed autonomy"
    - "Squads 2-of-2 multisig for key separation"
    - "TEE-based Agent Key storage"
    - "KMS-based Owner Key management"

key-files:
  created:
    - ".planning/deliverables/06-ai-agent-custody-considerations.md"
  modified: []

key-decisions:
  - "Squads 2-of-2 멀티시그 권장 (Option C) - 온체인 정책 강제, 복잡도 낮음"
  - "복합 정책 4가지 유형: 금액 한도, 화이트리스트, 시간 제어, 에스컬레이션"
  - "비수탁(Non-Custodial) 모델로 규제 범위 최소화"
  - "Owner Key는 AWS KMS, Agent Key는 Nitro Enclave 권장"

patterns-established:
  - "Dual Key: Owner Key(마스터 권한) + Agent Key(정책 범위 내 자율)"
  - "Policy Engine: limits + whitelist + timeControls + escalation"
  - "Threat Model: 내부 3가지 + 외부 3가지 위협 동등 분석"

# Metrics
duration: 5min 32s
completed: 2026-02-04
---

# Phase 2 Plan 02: AI 에이전트 특화 커스터디 고려사항 Summary

**AI 에이전트 지갑의 자율성과 통제권 균형을 위한 Dual Key 아키텍처 및 복합 정책 설계 완료**

## Performance

- **Duration:** 5min 32s
- **Started:** 2026-02-04T12:59:58Z
- **Completed:** 2026-02-04T13:05:30Z
- **Tasks:** 1
- **Files created:** 1

## Accomplishments

- AI 에이전트와 일반 사용자의 지갑 사용 패턴 차이를 6가지 시나리오로 상세 비교
- 자율적 트랜잭션 시나리오 4개 정의 (DeFi 재투자, 정기 지불, 리밸런싱, 긴급 회수)
- 복합 정책 설계 (금액 한도, 화이트리스트, 시간 제어, 에스컬레이션)
- 에이전트-서버 비밀값 분리 3가지 옵션 비교 및 Squads 2-of-2 권장
- 장애 복구 메커니즘 5가지 유형별 정의
- 위협 모델 6가지 (내부 3, 외부 3) 및 대응 방안 문서화
- Phase 3로 연결될 Dual Key 아키텍처 개념 정의

## Task Commits

Each task was committed atomically:

1. **Task 1: AI 에이전트 특화 커스터디 고려사항 문서 작성 (CUST-02)** - `45e6887` (docs)

## Files Created/Modified

- `.planning/deliverables/06-ai-agent-custody-considerations.md` - AI 에이전트 특화 커스터디 고려사항 (1,429줄)

## Decisions Made

1. **에이전트-서버 비밀값 분리: Squads 2-of-2 권장 (Option C)**
   - 이유: 온체인 정책 강제 가능, 구현 복잡도 낮음, $10B+ 실사용 검증
   - 대안: Option A (2-of-2 MPC), Option B (KMS + Enclave)

2. **복합 정책 4가지 유형 설계**
   - 금액 한도: perTransaction, dailyTotal, weeklyTotal
   - 화이트리스트: addresses, programs, tokens
   - 시간 제어: allowedHours, cooldownSeconds, burstLimit
   - 에스컬레이션: thresholdAmount, requireOwnerApproval

3. **비수탁 모델로 규제 범위 최소화**
   - 사용자가 Owner Key 보유
   - MiCA, 한국 가상자산법 직접 적용 범위 외

4. **Dual Key 역할 분리**
   - Owner Key: 마스터 권한 (자금 회수, 에이전트 중지, 키 교체, 정책 변경)
   - Agent Key: 일상 운영 (정책 범위 내 자율 서명)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Phase 2 Plan 03 준비 완료:**
- CUST-01 (커스터디 모델 비교 분석)과 CUST-02 (AI 에이전트 특화 고려사항) 완료
- 권장 커스터디 모델 제안을 위한 기초 분석 완료

**Phase 3 연결 포인트:**
- Dual Key 아키텍처 개념 정의됨 (Owner Key + Agent Key)
- 정책 구조 TypeScript 인터페이스 정의됨
- Squads Protocol v4 연동 방향 제시됨
- 인프라 요구사항 (AWS KMS, Nitro Enclaves, Multi-AZ) 도출됨

**잠재적 고려사항:**
- Squads v4의 동적 threshold 기능이 AI 에이전트 정책에 충분한지 Phase 3에서 검증 필요
- 다중 리전 배포 시 Enclave attestation 일관성 추후 설계 필요

---
*Phase: 02-custody-model*
*Completed: 2026-02-04*
