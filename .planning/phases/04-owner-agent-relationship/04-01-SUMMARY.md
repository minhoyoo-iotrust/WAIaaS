---
phase: 04-owner-agent-relationship
plan: 01
subsystem: payments
tags: [squads, spending-limit, vault, budget-pool, replenishment, solana, withdrawal, threshold]

requires:
  - phase: 03-system-architecture
    provides: Dual Key architecture, Squads integration, 3-layer policy verification, transaction flow

provides:
  - 자금 충전 프로세스 설계 (REL-01)
  - 자금 회수 프로세스 설계 (REL-02)
  - 예산 풀 + Spending Limits 연동 모델
  - 계층적 예산 한도 체계 (3-Layer)
  - 자동/수동 보충(Replenishment) 프로세스
  - 폐기 시 자동 회수 절차 (ChangeThreshold 순서)
  - WithdrawalRequest 데이터 모델

affects: [04-02, 04-03, 05-api-integration]

tech-stack:
  added: []
  patterns: [Budget Pool + Spending Limits, 3-Layer Budget Hierarchy, Auto/Manual Replenishment, Spending Limit vs Threshold Change withdrawal mechanisms]

key-files:
  created: [.planning/deliverables/13-fund-deposit-process.md, .planning/deliverables/14-fund-withdrawal-process.md]
  modified: []

key-decisions:
  - "수동 회수: 방법 A (Owner에게 Spending Limit 할당) 권장 — Threshold 변경 없이 안전"
  - "폐기 시 회수: 방법 B (ChangeThreshold(1) → 회수 → RemoveMember) — 폐기이므로 Threshold 원복 불필요"
  - "수동 부분 회수 시 에이전트 비차단(non-blocking) 기본 정책"
  - "자동 보충 기본값: maxDailyReplenishments=5, ownerMinBalance=1 SOL, 비정상 패턴 1시간/3회"
  - "보충 기본 모드: MANUAL (안전한 기본값, 소유자가 AUTO 선택 가능)"

patterns-established:
  - "Budget Pool: 소유자가 Vault에 예치, 에이전트가 Spending Limit 범위 내 사용"
  - "3-Layer Budget Hierarchy: 서버 정책 → Squads 온체인 → Dynamic Threshold 라우팅"
  - "Vault PDA 주소 검증 필수: 멀티시그 PDA가 아닌 Vault PDA로만 전송"
  - "ChangeThreshold(1) → 회수 → RemoveMember 순서 강제 (Pitfall 4)"
  - "Redis 분산 락으로 동시 회수 요청 방지"

duration: 7min
completed: 2026-02-05
---

# Phase 4 Plan 01: 자금 충전/회수 프로세스 설계 Summary

**예산 풀(Budget Pool) 기반 자금 충전 프로세스와 수동/자동/비상 3가지 회수 프로세스를 Squads Spending Limits + 3-Layer 예산 한도 체계로 설계**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-05T02:41:17Z
- **Completed:** 2026-02-05T02:48:32Z
- **Tasks:** 2
- **Files created:** 2

## Accomplishments

- 예산 풀(Budget Pool) 모델 기반 자금 충전 프로세스 설계 (Vault PDA 도출, 토큰별 전송, Spending Limit 설정 포함)
- 3-Layer 계층적 예산 한도 체계 정의 (서버 정책 / Squads 온체인 / Dynamic Threshold 라우팅)
- 자동/수동 보충(Replenishment) 프로세스 설계 (Pitfall 5 무한 루프 방지 안전장치 포함)
- 수동/자동(폐기)/비상 3가지 회수 트리거 유형 정의 및 시퀀스 다이어그램
- Squads Vault 자금 이동 2가지 메커니즘 비교 (Spending Limit 방식 vs Threshold 변경 방식)
- BudgetConfig, ReplenishmentConfig, WithdrawalRequest 등 TypeScript 인터페이스 정의

## Task Commits

Each task was committed atomically:

1. **Task 1+2: 자금 충전/회수 프로세스 설계 문서 작성** - `b4e8e12` (docs)

**Plan metadata:** (pending)

## Files Created/Modified

- `.planning/deliverables/13-fund-deposit-process.md` - REL-01 자금 충전 프로세스 설계 (915 lines): 예산 풀 모델, 충전 흐름, Spending Limit 설정, 계층적 한도, 보충 프로세스, 에이전트 생성 플로우, 잔액 모니터링
- `.planning/deliverables/14-fund-withdrawal-process.md` - REL-02 자금 회수 프로세스 설계 (727 lines): 회수 트리거, 수동/자동 회수, Vault 자금 이동 메커니즘, WithdrawalRequest 데이터 모델, 안전장치

## Decisions Made

1. **수동 회수 메커니즘 선택**: 수동 부분/전액 회수에는 방법 A (Owner에게 OneTime Spending Limit 할당 후 SpendingLimitUse로 인출)를 권장. Threshold 변경 없이 에이전트 운영에 영향 없음.
2. **폐기 시 회수 메커니즘 선택**: 폐기 시에는 방법 B (ChangeThreshold(1) → Vault Transaction → RemoveMember)를 사용. 폐기이므로 Threshold 원복 불필요.
3. **수동 회수 시 비차단 기본 정책**: 부분 회수 시 에이전트 트랜잭션을 차단하지 않음 (잔여 잔액이 충분하면 영향 없음). 소유자가 suspendDuringWithdrawal 옵션으로 차단 모드 선택 가능.
4. **자동 보충 안전장치 기본값**: maxDailyReplenishments=5, ownerMinBalance=1 SOL, 비정상 패턴 윈도우=1시간/3회. Pitfall 5 무한 루프 방지.
5. **보충 기본 모드 MANUAL**: 자동 보충보다 안전한 기본값. 소유자가 원할 때 AUTO로 전환 가능.
6. **회수 실패 재시도 정책**: 최대 3회 재시도 (10초/30초/60초), 3회 실패 시 FAILED 상태로 소유자 수동 개입.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required (설계 문서 단계).

## Next Phase Readiness

- REL-01, REL-02 설계 완료로 자금 흐름의 양방향(충전/회수) 기반 확립
- 04-02 (에이전트 키 관리 생명주기)에서 CREATING -> ACTIVE -> SUSPENDED -> TERMINATED 상태 전이에 본 문서의 자금 설정/회수 절차를 연동
- 04-03 (비상 회수 메커니즘, 멀티 에이전트 관리)에서 비상 회수 트리거 상세화 시 본 문서의 방법 B(Threshold 변경) 절차를 참조
- Open Question: configAuthority의 vault 접근 범위는 구현 시 Devnet 테스트로 확인 필요

---
*Phase: 04-owner-agent-relationship*
*Completed: 2026-02-05*
