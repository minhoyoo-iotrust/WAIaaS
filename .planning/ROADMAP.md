# Milestone v0.10: 구현 전 설계 완결성 확보

**Status:** In progress
**Phases:** 41-44
**Total Plans:** 2 (Phase 41) + 2 (Phase 42) + TBD (Phases 43-44)

## Overview

v0.2~v0.9에서 작성한 30개 설계 문서의 교차 지점에서 구현자가 추측해야 하는 BLOCKING 4건 + HIGH 8건 = 12건의 미비점을 해소한다. 정책 엔진, 에러 처리, 동시성/실행, 운영 로직 4개 영역을 순차적으로 완결하여, 설계 문서만으로 코드를 작성할 수 있는 상태를 만든다. 모든 Phase는 설계 문서 수정이며, 코드 구현은 범위 외이다.

## Phases

**Phase Numbering:**
- v0.9까지 Phase 40 완료. v0.10은 Phase 41부터 시작.
- Integer phases (41, 42, ...): 계획된 마일스톤 작업
- Decimal phases (41.1, 41.2): 긴급 삽입 (INSERTED 표기)

- [x] **Phase 41: 정책 엔진 완결** - PolicyRuleSchema 교차 참조 정리, Owner 상태 전이 확정, APPROVAL 타임아웃 우선순위 명시 ✓ (2026-02-09)
- [ ] **Phase 42: 에러 처리 체계 완결** - 64개 에러 코드 통합 매트릭스, ChainError 3-카테고리 분류, PolicyType enum 동기화
- [ ] **Phase 43: 동시성 + 실행 로직 완결** - Stage 5 완전 의사코드, 세션 갱신 낙관적 잠금, Kill Switch ACID 전이
- [ ] **Phase 44: 운영 로직 완결** - 데몬 6단계 타임아웃, Batch 부모-자식 DB 전략, Oracle 다중 소스 충돌 해결

## Phase Details

### Phase 41: 정책 엔진 완결

**Goal**: 구현자가 정책 엔진(PolicyRuleSchema, Owner 상태 전이, APPROVAL 타임아웃)을 추측 없이 구현할 수 있다
**Depends on**: Nothing (v0.10 첫 Phase)
**Requirements**: PLCY-01, PLCY-02, PLCY-03
**Plans**: 2 plans

**대상 설계 문서:** 25-sqlite-schema.md, 33-time-lock-approval-mechanism.md, 34-owner-wallet-connection.md

**Success Criteria** (Phase 완료 시 참이어야 하는 것):
1. 25-sqlite §4.4 `rules` 컬럼 설명에서 "LOCK-MECH Phase에서 확정" 이연 표기가 제거되고, "SSoT: 33-time-lock §2.2 PolicyRuleSchema" 참조가 명시되어 있다
2. 34-owner §10에 GRACE 기간이 무기한(시간 제한 없음)이고, GRACE->LOCKED 전이 트리거가 ownerAuth 미들웨어 Step 8.5 markOwnerVerified() 단일임이 명시되어 있다
3. 33-time-lock §11.6 다운그레이드와 34-owner §10 상태 전이 간 우선순위(33-time-lock §11.6 Step 9.5가 SSoT)가 명확히 정의되어 있다
4. 33-time-lock §4 evaluate() 내에 APPROVAL 타임아웃 결정 순서(정책별 approvalTimeout > 글로벌 config > 하드코딩 3600초)가 명시되어 있다

Plans:
- [x] 41-01-PLAN.md -- PolicyRuleSchema SSoT 교차 참조 + APPROVAL 타임아웃 3단계 우선순위 (PLCY-01, PLCY-03)
- [x] 41-02-PLAN.md -- GRACE 기간 정책 + Owner 상태 전이 SSoT 우선순위 양방향 확정 (PLCY-02)

### Phase 42: 에러 처리 체계 완결

**Goal**: 구현자가 에러 응답 처리(HTTP 매핑, 체인 에러 복구, 정책 타입 검증)를 추측 없이 구현할 수 있다
**Depends on**: Phase 41 (PLCY-01의 PolicyRuleSchema SSoT 정리가 ERRH-03 rules 검증 분기에 필요)
**Requirements**: ERRH-01, ERRH-02, ERRH-03
**Plans**: 2 plans

**대상 설계 문서:** 37-rest-api-complete-spec.md, 27-chain-adapter-interface.md

**Success Criteria** (Phase 완료 시 참이어야 하는 것):
1. 37-rest-api SS10.12에 66개 에러 코드 전수에 대한 HTTP status + retryable + backoff 매핑 통합 매트릭스가 존재하고, 429 응답 포맷(Retry-After 헤더 + 본문 retryAfter)이 확정되어 있다
2. 27-chain-adapter SS4에 모든 ChainError가 PERMANENT/TRANSIENT/STALE 3개 카테고리로 분류되어 있고, 카테고리별 복구 전략(재시도 횟수, 백오프 방식)이 테이블로 정의되어 있다
3. 37-rest-api SS8.9의 PolicyType enum이 10개로 확장되어 있고, type별 rules JSON 검증 분기(.superRefine() 로직)가 명시되어 있다

Plans:
- [ ] 42-01-PLAN.md -- ChainError 3-카테고리 분류 + 복구 전략 테이블 (ERRH-02)
- [ ] 42-02-PLAN.md -- 에러 코드 통합 매트릭스 + PolicyType 10개 확장 + superRefine (ERRH-01, ERRH-03)

### Phase 43: 동시성 + 실행 로직 완결

**Goal**: 구현자가 트랜잭션 실행(Stage 5), 세션 갱신 동시성, Kill Switch 상태 전이를 추측 없이 구현할 수 있다
**Depends on**: Phase 42 (ERRH-02의 ChainError category가 CONC-01 Stage 5 에러 분기에 필요)
**Requirements**: CONC-01, CONC-02, CONC-03
**Plans**: TBD

**대상 설계 문서:** 32-transaction-pipeline-api.md, 53-session-renewal-protocol.md, 36-killswitch-autostop-evm.md

**Success Criteria** (Phase 완료 시 참이어야 하는 것):
1. 32-pipeline §5에 Stage 5 완전 의사코드(build->simulate->sign->submit + 에러 분기 + STALE/TRANSIENT 재시도 로직)가 존재하고, 티어별 타임아웃(INSTANT/NOTIFY=30초, DELAY/APPROVAL=60초)이 명시되어 있다
2. 53-session-renewal §5에 `token_hash = :currentTokenHash` 낙관적 잠금 패턴과 RENEWAL_CONFLICT(409) 에러 반환 로직이 SQL 수준으로 정의되어 있다
3. 36-killswitch §3.1의 모든 상태 전이(NORMAL->ACTIVATED, ACTIVATED->RECOVERING, RECOVERING->NORMAL)에 `WHERE value = :expectedState` 조건이 포함된 ACID 패턴이 정의되어 있다

Plans:
- [ ] 43-01-PLAN.md: (TBD)

### Phase 44: 운영 로직 완결

**Goal**: 구현자가 데몬 시작 절차, Batch 트랜잭션 저장, Price Oracle 충돌 해결을 추측 없이 구현할 수 있다
**Depends on**: Phase 41 (PLCY-01의 25-sqlite 수정이 OPER-02 parent_id/batch_index 컬럼 추가와 동일 문서)
**Requirements**: OPER-01, OPER-02, OPER-03
**Plans**: TBD

**대상 설계 문서:** 28-daemon-lifecycle-cli.md, 60-batch-transaction-spec.md, 25-sqlite-schema.md, 61-price-oracle-spec.md

**Success Criteria** (Phase 완료 시 참이어야 하는 것):
1. 28-daemon §2에 6단계 시작 절차 각각의 타임아웃(5~30초)과 fail-fast/soft 정책이 테이블로 정의되어 있고, 전체 90초 상한이 명시되어 있다
2. 60-batch-tx §4에 부모-자식 2계층 DB 저장 전략(부모 type=BATCH, 자식 parent_id + batch_index)이 정의되어 있고, PARTIAL_FAILURE 상태 전이(EVM 부분 실패 시)가 명시되어 있다
3. 25-sqlite에 transactions 테이블의 parent_id TEXT REFERENCES transactions(id) + batch_index INTEGER 컬럼이 추가되어 있다
4. 61-price-oracle §3.6에 다중 소스 10% 괴리 시 보수적 선택(높은 가격 채택) 로직이 정의되어 있고, stale(>30분) 가격 시 USD 평가 스킵 -> 네이티브 금액 전용 평가 정책이 명시되어 있다

## Progress

**Execution Order:**
Phase 41 -> Phase 42 -> Phase 43 -> Phase 44

**Dependencies:**
```
Phase 41 (정책 엔진) ---> Phase 42 (에러 처리) ---> Phase 43 (동시성/실행)
    |                                                      |
    +-------> Phase 44 (운영 로직) <-----------------------+
```

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 41. 정책 엔진 완결 | 2/2 | Complete ✓ | 2026-02-09 |
| 42. 에러 처리 체계 완결 | 0/TBD | Not started | - |
| 43. 동시성 + 실행 로직 완결 | 0/TBD | Not started | - |
| 44. 운영 로직 완결 | 0/TBD | Not started | - |

---

*Created: 2026-02-09*
*Milestone: v0.10 구현 전 설계 완결성 확보*
*Requirements: 12 (PLCY 3 + ERRH 3 + CONC 3 + OPER 3)*
*Coverage: 12/12 mapped*
