# Phase 32 Plan 02: ownerAuth v0.8 확장 + 보안 공격 방어 메커니즘

ownerAuth 미들웨어에 Step 8.5(markOwnerVerified 자동 호출) + change_owner action 추가하고, 52/34 문서 간 교차 참조로 보안 공격 방어 4건(C-01/C-02/H-02/H-03)을 완성

---

phase: 32
plan: 02
subsystem: auth-security
tags: [ownerAuth, change_owner, GRACE, LOCKED, BEGIN-IMMEDIATE, security-defense]

dependency-graph:
  requires: [31-01, 31-02, 32-01]
  provides: [ownerAuth-v0.8, security-attack-defense, setOwner-BEGIN-IMMEDIATE]
  affects: [33-01, 34-01, 34-02, 35-03]

tech-stack:
  added: []
  patterns: [BEGIN-IMMEDIATE-setOwner, Step-8.5-auto-lock, change_owner-action]

key-files:
  created: []
  modified:
    - .planning/deliverables/52-auth-model-redesign.md
    - .planning/deliverables/34-owner-wallet-connection.md

decisions:
  - id: "32-02-01"
    summary: "Step 8.5는 next() 전에 실행 -- 핸들러 실행 전 LOCKED 보장 (보수적 접근)"
  - id: "32-02-02"
    summary: "change_owner action은 LOCKED 상태 PATCH /v1/agents/:id에만 적용 -- authRouter 미등록, 핸들러 레벨 검증"
  - id: "32-02-03"
    summary: "setOwner도 BEGIN IMMEDIATE 트랜잭션으로 원자화 -- resolveOwnerState 재확인 + 주소변경 + 감사로그 일체화"
  - id: "32-02-04"
    summary: "PATCH /v1/agents/:id의 인증 분기를 미들웨어가 아닌 비즈니스 로직에서 처리 -- 미들웨어 책임 위반 방지"

metrics:
  duration: "5m"
  completed: "2026-02-09"

---

## Objective

52-auth-model-redesign.md에 ownerAuth 미들웨어 v0.8 확장(Step 8.5, change_owner, 인증 맵 갱신)을 반영하고, 34-owner-wallet-connection.md에 보안 공격 방어 메커니즘(C-01/C-02/H-02/H-03)과 setOwner BEGIN IMMEDIATE 직렬화 설계를 추가한다.

## Task Commits

| # | Task | Commit | Key Changes |
|---|------|--------|-------------|
| 1 | 52-auth-model-redesign.md ownerAuth Step 8.5 + change_owner + 인증 맵 갱신 | e6258ac | ownerAuth Step 8.5 markOwnerVerified 추가, action enum 3개로 확장, ROUTE_ACTION_MAP change_owner 매핑, 인증 맵 LOCKED 분기 주석 |
| 2 | 34-owner-wallet-connection.md 보안 공격 방어 + setOwner BEGIN IMMEDIATE | 13f1e36 | C-01 3중 보호, C-02 3중 보호, H-02 withdraw 방어, H-03 killSwitchGuard 방어, ownerAuth v0.8 교차 참조 |

## Decisions Made

1. **Step 8.5 타이밍: next() 전 실행** -- 핸들러가 실행되는 시점에 항상 LOCKED 상태가 보장된다. Step 1-7(검증) -> 8.5(자동 잠금) -> 8(next()) 순서.

2. **change_owner action: authRouter 미등록** -- PATCH /v1/agents/:id는 NONE/GRACE에서 masterAuth(implicit), LOCKED에서만 ownerAuth 추가. 미들웨어 레벨에서 경로 기반 분기가 불가(바디 파싱 필요)하므로 OwnerLifecycleService 비즈니스 로직에서 처리.

3. **setOwner BEGIN IMMEDIATE** -- 기존 markOwnerVerified()와 동일 패턴으로 setOwner()도 BEGIN IMMEDIATE 트랜잭션화. "상태 확인 -> 변경" 사이 레이스 윈도우 제거. 33-time-lock-approval-mechanism.md의 BEGIN IMMEDIATE 테이블에 Phase 35 통합 시 추가.

4. **보안 공격 방어 4건 확정:**
   - C-01(Grace-to-Locked 레이스): 3중 보호 (markOwnerVerified 원자화 + setOwner BEGIN IMMEDIATE + 감사 로그)
   - C-02(보안 다운그레이드): 3중 보호 (LOCKED 해제 금지 + 알림 + killSwitchGuard)
   - H-02(유예 구간 withdraw): owner_verified=1 조건 (WITHDRAW-08)
   - H-03(Kill Switch Owner 변경): killSwitchGuard 4개 허용 경로 외 503 차단

## Deviations from Plan

None -- 계획대로 정확히 실행됨.

## Verification Results

1. [x] 52-auth-model-redesign.md에 ownerAuth Step 8.5가 [v0.8]로 추가되어 있다
2. [x] OwnerSignaturePayload.action에 change_owner가 추가되어 있다
3. [x] ROUTE_ACTION_MAP에 PATCH /v1/agents/:id -> change_owner 매핑이 있다
4. [x] 인증 맵에 PATCH /v1/agents/:id의 LOCKED 분기 주석이 있다
5. [x] 34-owner-wallet-connection.md에 C-01 방어 3중 보호가 명세되어 있다
6. [x] setOwner BEGIN IMMEDIATE 코드 예시가 있다
7. [x] C-02 방어 3중 보호가 명세되어 있다
8. [x] H-02 유예 구간 withdraw 방어가 명세되어 있다
9. [x] H-03 Kill Switch 상태 Owner 변경 방어가 명세되어 있다
10. [x] ownerAuth v0.8 변경 요약이 교차 참조로 명세되어 있다

## Next Phase Readiness

Phase 32 완료. 이 설계에 의존하는 후속 phase:
- Phase 33(정책 다운그레이드 + 알림): C-02 알림 템플릿 참조
- Phase 34(자금 회수 + 보안 분기): H-02 withdraw 활성화 조건 참조, setOwner BEGIN IMMEDIATE 패턴 참조
- Phase 35(DX + 설계 문서 통합): 33-time-lock BEGIN IMMEDIATE 테이블에 setOwner 추가, 14개 문서 v0.8 반영

## Self-Check: PASSED
