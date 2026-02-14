# Roadmap: WAIaaS v1.4.6

## Overview

v1.4.5에서 설계한 멀티체인 월렛 모델(1 월렛 = 1 체인 + 1 환경)을 6개 페이즈에 걸쳐 구현한다. DB 마이그레이션과 환경 모델 SSoT를 기반으로, 파이프라인/정책/API/MCP/SDK/Admin UI/CLI를 순차적으로 확장하여, 하나의 EVM 월렛이 5개 네트워크에서 트랜잭션을 실행할 수 있는 상태를 달성한다.

## Milestones

- ✅ **v1.4.5 멀티체인 월렛 모델 설계** - Phases 105-108 (shipped 2026-02-14)
- **v1.4.6 멀티체인 월렛 구현** - Phases 109-114 (in progress)

## Phases

- [x] **Phase 109: DB 마이그레이션 + 환경 모델 SSoT** - 데이터 레이어 전환 + EnvironmentType 파생 체인 ✅ 2026-02-14
- [x] **Phase 110: 스키마 전환 + 정책 엔진** - Wallet/Transaction/Policy 스키마 environment 전환 + ALLOWED_NETWORKS 평가 ✅ 2026-02-14
- [x] **Phase 111: 파이프라인 네트워크 해결** - resolveNetwork() + PipelineContext 확장 + Stage 1/3/5 네트워크 흐름 ✅ 2026-02-14
- [x] **Phase 112: REST API 네트워크 확장** - 7개 엔드포인트 network/environment 파라미터 + 신규 2개 ✅ 2026-02-14
- [ ] **Phase 113: MCP + SDK + Admin UI** - MCP 6개 도구 + TS/Python SDK + Admin UI 환경 모델 전환
- [ ] **Phase 114: CLI Quickstart + DX 통합** - quickstart --mode + 스킬 파일 동기화 + 하위호환 검증

## Phase Details

### Phase 109: DB 마이그레이션 + 환경 모델 SSoT
**Goal**: 데이터 레이어가 환경 모델로 완전히 전환되고, EnvironmentType SSoT가 코드베이스 전체에서 사용 가능한 상태
**Depends on**: Nothing (first phase)
**Requirements**: MIGR-01, MIGR-02, MIGR-03, MIGR-04, SCHEMA-01, SCHEMA-02
**Success Criteria** (what must be TRUE):
  1. v6a 마이그레이션 실행 후 transactions 테이블에 network 컬럼이 존재하고 기존 레코드가 wallets.network 역참조로 채워져 있다
  2. v6b 마이그레이션 실행 후 wallets 테이블이 environment + default_network 컬럼을 가지며 기존 network 값이 정확히 변환되어 있다
  3. v8 마이그레이션 실행 후 policies 테이블에 network 컬럼이 존재한다
  4. EnvironmentType Zod SSoT에서 타입/OpenAPI/Drizzle CHECK가 파생되고, getNetworksForEnvironment/getDefaultNetwork/deriveEnvironment/validateNetworkEnvironment 4개 함수가 동작한다
  5. 마이그레이션 전후 데이터 무결성이 보존된다 (기존 월렛/트랜잭션/정책 데이터 손실 없음)
**Plans**: 2 plans

Plans:
- [x] 109-01-PLAN.md -- EnvironmentType Zod SSoT + 환경-네트워크 매핑 함수 4개 (TDD, Wave 1)
- [x] 109-02-PLAN.md -- DB 마이그레이션 v6a/v6b/v8 + pushSchema DDL 동기화 + Drizzle 스키마 + 테스트 (Wave 2, depends on 109-01)

### Phase 110: 스키마 전환 + 정책 엔진
**Goal**: Wallet/Transaction/Policy Zod 스키마가 환경 모델을 반영하고, ALLOWED_NETWORKS 정책이 네트워크 스코프로 평가되는 상태
**Depends on**: Phase 109
**Requirements**: SCHEMA-03, SCHEMA-04, SCHEMA-05, PLCY-01, PLCY-02, PLCY-03
**Success Criteria** (what must be TRUE):
  1. CreateWalletRequest에 environment 파라미터를 지정하여 testnet/mainnet 월렛을 생성할 수 있다
  2. SendTransactionRequest 5-type 모두 network 선택 파라미터를 수용한다
  3. ALLOWED_NETWORKS 정책을 생성하면 지정되지 않은 네트워크에서의 트랜잭션이 POLICY_VIOLATION으로 거부된다
  4. 네트워크 스코프 정책이 4단계 override 우선순위(wallet+network > wallet+null > global+network > global+null)로 평가된다
**Plans**: 2 plans

Plans:
- [x] 110-01-PLAN.md -- Zod 스키마 환경 모델 전환 + ALLOWED_NETWORKS PolicyType SSoT + Route 레이어 적용 (Wave 1)
- [x] 110-02-PLAN.md -- ALLOWED_NETWORKS 평가 로직 + 4단계 override resolveOverrides + evaluateAndReserve network SQL (TDD, Wave 2, depends on 110-01)

### Phase 111: 파이프라인 네트워크 해결
**Goal**: 트랜잭션 파이프라인이 네트워크를 자동 해결하고, 해결된 네트워크로 빌드/실행/확인하는 상태
**Depends on**: Phase 110
**Requirements**: PIPE-01, PIPE-02, PIPE-03, PIPE-04, PIPE-05
**Success Criteria** (what must be TRUE):
  1. 트랜잭션 요청에 network를 지정하면 해당 네트워크에서 실행되고, 미지정 시 wallet.defaultNetwork가 사용된다
  2. 환경과 불일치하는 네트워크 지정 시 ENVIRONMENT_NETWORK_MISMATCH 에러가 반환된다
  3. transactions 테이블에 실행 네트워크가 정확히 기록된다
  4. 네트워크 스코프 정책이 Stage 3에서 트랜잭션의 해결된 네트워크와 매칭되어 평가된다
**Plans**: 2 plans

Plans:
- [x] 111-01-PLAN.md -- resolveNetwork() TDD (순수 함수 + ENVIRONMENT_NETWORK_MISMATCH 에러 코드 + PipelineContext 확장, Wave 1)
- [x] 111-02-PLAN.md -- Route/Daemon/Pipeline 네트워크 해결 통합 + 통합 테스트 (Wave 2, depends on 111-01)

### Phase 112: REST API 네트워크 확장
**Goal**: REST API가 환경/네트워크 파라미터를 수용하고, 월렛별 네트워크 관리 엔드포인트가 동작하는 상태
**Depends on**: Phase 111
**Requirements**: API-01, API-02, API-03, API-04, API-05, API-06
**Success Criteria** (what must be TRUE):
  1. POST /v1/wallets에 environment 파라미터로 testnet/mainnet 월렛을 생성할 수 있고, 미지정 시 testnet 기본값이 적용된다
  2. POST /v1/transactions/send에 network 파라미터로 특정 네트워크를 지정하여 트랜잭션을 실행할 수 있다
  3. GET /v1/wallets/:id/balance?network=polygon-mainnet으로 특정 네트워크 잔액을 조회할 수 있다
  4. PUT /v1/wallets/:id/default-network로 기본 네트워크를 변경할 수 있고, GET /v1/wallets/:id/networks로 사용 가능 네트워크 목록을 조회할 수 있다
  5. ALLOWED_NETWORKS 정책을 REST API로 CRUD 할 수 있다
**Plans**: 2 plans

Plans:
- [x] 112-01-PLAN.md -- GET balance/assets network 쿼리 파라미터 + 트랜잭션/월렛 응답 network/environment 보강 + api-agents 테스트 수정 (Wave 1)
- [x] 112-02-PLAN.md -- PUT /wallets/:id/default-network + GET /wallets/:id/networks 신규 엔드포인트 + ALLOWED_NETWORKS CRUD 검증 + 통합 테스트 (Wave 2, depends on 112-01)

### Phase 113: MCP + SDK + Admin UI
**Goal**: MCP 도구, TS/Python SDK, Admin UI가 멀티체인 환경 모델을 지원하여 모든 인터페이스에서 네트워크를 선택할 수 있는 상태
**Depends on**: Phase 112
**Requirements**: INTEG-01, INTEG-02, INTEG-03, INTEG-04, ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04
**Success Criteria** (what must be TRUE):
  1. MCP send_transaction/send_token/get_balance/get_assets/call_contract/approve_token 도구에 network 파라미터를 지정하여 특정 네트워크에서 실행할 수 있다
  2. TS SDK의 sendTransaction({network: 'polygon-mainnet'})와 Python SDK의 send_transaction(network='polygon-mainnet')이 동작한다
  3. Admin UI 월렛 생성 시 environment 라디오버튼(testnet/mainnet)으로 선택하고, 월렛 상세에서 사용 가능 네트워크 목록과 기본 네트워크 변경 UI가 동작한다
  4. Admin UI 트랜잭션 목록에 network 컬럼이 표시되고, 정책 생성에서 ALLOWED_NETWORKS 타입과 네트워크 스코프를 선택할 수 있다
**Plans**: 3 plans

Plans:
- [ ] 113-01-PLAN.md -- MCP 6개 도구 network 파라미터 + get_wallet_info 신규 도구 + 테스트 (Wave 1)
- [ ] 113-02-PLAN.md -- TS SDK + Python SDK network 파라미터 확장 + 테스트 (Wave 1)
- [ ] 113-03-PLAN.md -- Admin UI 환경 모델 전환 + ALLOWED_NETWORKS 정책 UI + 테스트 (Wave 1)

### Phase 114: CLI Quickstart + DX 통합
**Goal**: quickstart 명령으로 테스트넷/메인넷 월렛을 원스톱 생성할 수 있고, 모든 변경이 하위호환되며 스킬 파일이 최신 상태인 상태
**Depends on**: Phase 113
**Requirements**: CLI-01, CLI-02, DX-01, DX-02
**Success Criteria** (what must be TRUE):
  1. waiaas quickstart --mode testnet 실행 시 Solana + EVM 2개 월렛이 생성되고 체인별 네트워크/주소 목록 + MCP 설정 스니펫이 출력된다
  2. waiaas quickstart --mode mainnet 실행 시 메인넷 환경의 동일한 결과가 출력된다
  3. 기존 월렛/API/MCP/정책이 network 미지정 시 기존과 동일하게 동작한다 (하위호환)
  4. quickstart/wallet/transactions/policies 4개 스킬 파일이 environment/network 파라미터를 반영하여 동기화되어 있다
**Plans**: TBD

Plans:
- [ ] 114-01: CLI quickstart --mode testnet/mainnet 구현
- [ ] 114-02: 스킬 파일 4개 동기화 + 하위호환 검증 테스트

## Progress

**Execution Order:**
Phases execute in numeric order: 109 -> 110 -> 111 -> 112 -> 113 -> 114

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 109. DB 마이그레이션 + 환경 모델 SSoT | 2/2 | ✅ Complete | 2026-02-14 |
| 110. 스키마 전환 + 정책 엔진 | 2/2 | ✅ Complete | 2026-02-14 |
| 111. 파이프라인 네트워크 해결 | 2/2 | ✅ Complete | 2026-02-14 |
| 112. REST API 네트워크 확장 | 2/2 | ✅ Complete | 2026-02-14 |
| 113. MCP + SDK + Admin UI | 0/3 | Not started | - |
| 114. CLI Quickstart + DX 통합 | 0/2 | Not started | - |
