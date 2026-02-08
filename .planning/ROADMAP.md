# Roadmap: WAIaaS v0.8

## Overview

Owner 지갑 등록을 필수에서 선택으로 전환하고, 등록 여부에 따라 보안 기능이 점진적으로 해금되는 모델을 설계한다. 데이터 모델 기반 설계(스키마/타입)에서 시작하여, Owner 생명주기, 정책 다운그레이드, 자금 회수/보안 분기를 순차적으로 설계한 뒤, 14개 기존 설계 문서에 일괄 통합한다. 본 마일스톤은 설계 문서 수정이 산출물이며, 코드 구현은 포함하지 않는다.

## Milestones

<details>
<summary>v0.1-v0.7 (Phases 1-30) -- SHIPPED 2026-02-08</summary>

7 milestones, 30 phases, 79 plans, 210 requirements, 30 설계 문서 (24-64)
상세: .planning/MILESTONES.md

</details>

- [ ] **v0.8 Owner 선택적 등록 + 점진적 보안 모델** - Phases 31-35 (in progress)

## Phases

- [x] **Phase 31: 데이터 모델 + 타입 기반 설계** - agents 스키마 nullable 전환 + 핵심 타입 정의
- [x] **Phase 32: Owner 생명주기 설계** - 등록/변경/해제 + 유예/잠금 2단계 상태 머신
- [x] **Phase 33: 정책 다운그레이드 + 알림 설계** - APPROVAL->DELAY 다운그레이드 + 알림 템플릿
- [ ] **Phase 34: 자금 회수 + 보안 분기 설계** - sweepAll 프로토콜 + Kill Switch/세션 Owner 분기
- [ ] **Phase 35: DX + 설계 문서 통합** - CLI 변경 + 14개 설계 문서 v0.8 반영

## Phase Details

### Phase 31: 데이터 모델 + 타입 기반 설계
**Goal**: 모든 후속 설계의 기반이 되는 스키마 변경과 타입 정의가 확정되어, Owner 유무에 따른 조건 분기를 설계할 수 있다
**Depends on**: Nothing (first phase of v0.8)
**Requirements**: OWNER-01, OWNER-07, OWNER-08, WITHDRAW-06
**Success Criteria** (what must be TRUE):
  1. agents 테이블 DDL에서 owner_address가 nullable이고, owner_verified INTEGER 컬럼이 정의되어 있다
  2. OwnerState 타입(NONE/GRACE/LOCKED)이 정의되어 resolveOwnerState() 유틸리티의 입출력이 명세되어 있다
  3. SweepResult 타입과 IChainAdapter.sweepAll 시그니처가 정의되어 있다 (19->20 메서드)
  4. Grace->Locked 전이의 BEGIN IMMEDIATE 트랜잭션 원자화 설계가 명세되어 있다
**Plans**: 2 plans (Wave 1 parallel)

Plans:
- [x] 31-01-PLAN.md -- agents 스키마 v0.8 변경(nullable owner_address, owner_verified) + 마이그레이션 SQL + OwnerState/SweepResult 타입 + PolicyDecision 확장
- [x] 31-02-PLAN.md -- IChainAdapter.sweepAll 시그니처(20번째 메서드) + resolveOwnerState() 유틸리티 + Grace->Locked BEGIN IMMEDIATE 원자화

### Phase 32: Owner 생명주기 설계
**Goal**: Owner 주소의 등록/변경/해제 전체 생명주기가 설계되어, 유예/잠금 2단계에 따른 인증 요건과 제약이 명확하다
**Depends on**: Phase 31
**Requirements**: OWNER-02, OWNER-03, OWNER-04, OWNER-05, OWNER-06
**Success Criteria** (what must be TRUE):
  1. 에이전트 생성 시 --owner 옵션으로 Owner 주소를 선택적으로 등록하는 API/CLI 스펙이 명세되어 있다
  2. set-owner로 사후 등록 시 masterAuth만 요구하고, 서명은 불필요한 인증 요건이 명세되어 있다
  3. 유예 구간(owner_verified=0)에서 masterAuth만으로 변경/해제가 가능한 정책이 명세되어 있다
  4. 잠금 구간(owner_verified=1)에서 ownerAuth+masterAuth로만 변경이 가능하고, 해제가 불가능한 정책이 명세되어 있다
  5. OwnerLifecycleService의 상태 전이 다이어그램과 보안 다운그레이드 방지 메커니즘이 명세되어 있다
**Plans**: 2 plans (Wave 1 -> Wave 2 sequential)

Plans:
- [x] 32-01-PLAN.md -- Owner 생명주기 상태 머신(3-State, 6전이) + OwnerLifecycleService + REST API/CLI 스펙 + 감사 이벤트/에러 코드 (34-owner-wallet-connection.md)
- [x] 32-02-PLAN.md -- ownerAuth Step 8.5 + change_owner action + 인증 맵 갱신 (52-auth-model-redesign.md) + 보안 공격 방어 C-01/C-02/H-02/H-03 (34-owner-wallet-connection.md)

### Phase 33: 정책 다운그레이드 + 알림 설계
**Goal**: Owner 없는 에이전트의 APPROVAL 거래가 차단 없이 DELAY로 다운그레이드되어 실행되고, 알림에 Owner 등록 안내가 포함되는 설계가 완성된다
**Depends on**: Phase 31
**Requirements**: POLICY-01, POLICY-02, POLICY-03, NOTIF-01, NOTIF-02
**Success Criteria** (what must be TRUE):
  1. evaluate() Step 9 이후 APPROVAL->DELAY 다운그레이드 삽입 지점과 로직이 명세되어 있다
  2. PolicyDecision에 downgraded 플래그와 originalTier가 포함되어 알림 분기 조건이 명세되어 있다
  3. Owner 등록 후 동일 금액 거래가 정상 APPROVAL로 처리되는 흐름이 명세되어 있다
  4. 다운그레이드 알림 템플릿에 Owner 등록 CLI 안내 메시지가 포함되어 있다
  5. Owner 있는 에이전트의 APPROVAL 대기 알림에 [승인]/[거부] 버튼이 명세되어 있다
**Plans**: 2 plans (Wave 1 parallel)

Plans:
- [x] 33-01-PLAN.md -- evaluate() Step 9.5 다운그레이드 로직 + evaluateBatch 다운그레이드 + evaluate 시그니처 확장 + TX_DOWNGRADED 감사 로그 + Owner LOCKED 후 정상 APPROVAL 복원 흐름 (33-time-lock-approval-mechanism.md)
- [x] 33-02-PLAN.md -- TX_DOWNGRADED_DELAY 이벤트 추가 + 채널별(Telegram/Discord/ntfy.sh) 다운그레이드 알림 템플릿 + APPROVAL 대기 [승인]/[거부] 버튼 명세 (35-notification-architecture.md)

### Phase 34: 자금 회수 + 보안 분기 설계
**Goal**: Owner 등록된 에이전트의 자금 전량 회수 프로토콜과, Owner 유무별 Kill Switch 복구/세션 갱신 분기가 설계된다
**Depends on**: Phase 31, Phase 32
**Requirements**: WITHDRAW-01, WITHDRAW-02, WITHDRAW-03, WITHDRAW-04, WITHDRAW-05, WITHDRAW-07, WITHDRAW-08, SECURITY-01, SECURITY-02, SECURITY-03, SECURITY-04, NOTIF-03
**Success Criteria** (what must be TRUE):
  1. POST /v1/owner/agents/:agentId/withdraw API 스펙(요청/응답/인증/HTTP 상태)이 명세되어 있다
  2. sweepAll의 Solana 실행 순서(토큰 배치 -> SOL 마지막)와 부분 실패 시 HTTP 207 응답이 명세되어 있다
  3. scope "all"(네이티브+SPL+rent)과 "native" 분기가 명세되어 있다
  4. 유예 구간(owner_verified=0)에서 withdraw가 비활성화되는 보안 정책이 명세되어 있다
  5. Kill Switch 복구 대기 시간(Owner 없음: 24h / Owner 있음: 30min)과 세션 갱신 거부 윈도우 분기가 명세되어 있다
**Plans**: TBD

Plans:
- [ ] 34-01: withdraw API + WithdrawService + sweepAll Solana 구현 설계
- [ ] 34-02: Kill Switch Owner 분기 + 세션 갱신 분기 + 세션 알림 거부 버튼 설계

### Phase 35: DX + 설계 문서 통합
**Goal**: CLI 명령어 변경이 설계되고, 14개 기존 설계 문서에 v0.8 Owner 선택적 모델이 일관되게 반영된다
**Depends on**: Phase 31, Phase 32, Phase 33, Phase 34
**Requirements**: DX-01, DX-02, DX-03, DX-04, DX-05, INTEG-01, INTEG-02
**Success Criteria** (what must be TRUE):
  1. agent create --owner 선택 옵션, set-owner, remove-owner CLI 명령어가 명세되어 있다
  2. --quickstart가 --owner 없이 동작하는 스펙이 명세되어 있다
  3. Owner 미등록 에이전트의 agent info 출력에 등록 안내 메시지가 명세되어 있다
  4. 14개 기존 설계 문서에 [v0.8] 태그로 변경 사항이 반영되어 있다
  5. Owner 상태 분기 매트릭스(API x Owner NONE/GRACE/LOCKED)가 SSoT로 작성되어 문서 간 일관성이 보장된다
**Plans**: TBD

Plans:
- [ ] 35-01: CLI 명령어 변경 + 출력 메시지 + --quickstart 간소화 설계
- [ ] 35-02: Owner 상태 분기 매트릭스 SSoT 작성
- [ ] 35-03: 14개 설계 문서 v0.8 통합 반영 (25, 52, 33, 34, 37, 27, 31, 36, 30, 53, 35, 54, 40, 57/60/61 참조)

## Progress

**Execution Order:**
Phases execute in numeric order: 31 -> 32 -> 33 -> 34 -> 35
Note: Phase 32 and 33 can proceed in parallel (both depend on 31, not on each other).

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 31. 데이터 모델 + 타입 기반 설계 | v0.8 | 2/2 | ✓ Complete | 2026-02-08 |
| 32. Owner 생명주기 설계 | v0.8 | 2/2 | ✓ Complete | 2026-02-09 |
| 33. 정책 다운그레이드 + 알림 설계 | v0.8 | 2/2 | ✓ Complete | 2026-02-09 |
| 34. 자금 회수 + 보안 분기 설계 | v0.8 | 0/2 | Not started | - |
| 35. DX + 설계 문서 통합 | v0.8 | 0/3 | Not started | - |

---
*Created: 2026-02-08*
*Last updated: 2026-02-09 after Phase 33 execution complete*
