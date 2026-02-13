# Roadmap: WAIaaS v1.4.5 멀티체인 월렛 모델 설계

## Overview

"1 월렛 = 1 체인 + 1 네트워크" 모델을 "1 월렛 = 1 체인 + 1 환경(testnet/mainnet)" 모델로 전환하는 아키텍처를 설계한다. 4개 페이즈로 데이터 모델 기반을 먼저 확정하고, 그 위에 파이프라인/정책/인터페이스 설계를 쌓는다. 모든 산출물은 설계 문서이며, 코드 구현은 v1.4.6에서 수행한다.

## Milestones

- 🚧 **v1.4.5 멀티체인 월렛 모델 설계** - Phases 105-108 (in progress)

## Phases

- [ ] **Phase 105: Environment 데이터 모델 + DB 마이그레이션 설계** - EnvironmentType 정의, wallets/transactions 스키마 전환, 키스토어 영향 분석
- [ ] **Phase 106: 파이프라인 + 네트워크 리졸브 설계** - NetworkResolver 추상화, PipelineContext 확장, 환경-네트워크 교차 검증, AdapterPool 호출 변경
- [ ] **Phase 107: 정책 엔진 네트워크 확장 설계** - ALLOWED_NETWORKS 11번째 PolicyType, 네트워크 스코프 정책, policies 테이블 확장
- [ ] **Phase 108: API/인터페이스 + DX 설계** - REST API network 파라미터, MCP/SDK 확장, 하위호환 전략, Quickstart 워크플로우

## Phase Details

### Phase 105: Environment 데이터 모델 + DB 마이그레이션 설계
**Goal**: 환경 모델의 데이터 기반이 확정되어, 후속 페이즈(파이프라인/정책/API)가 참조할 스키마와 타입이 명확하다
**Depends on**: Nothing (첫 번째 페이즈)
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, DATA-05
**Success Criteria** (what must be TRUE):
  1. EnvironmentType enum(testnet/mainnet)과 환경-네트워크 매핑 테이블이 Zod SSoT 파생 체인(Zod -> TypeScript -> DB CHECK -> Drizzle)으로 정의되어 있다
  2. wallets.network -> wallets.environment + wallets.default_network 전환의 DB 마이그레이션 v6 전략이 12-step 재생성 순서, 데이터 변환 SQL, PRAGMA foreign_key_check 검증 쿼리까지 설계되어 있다
  3. transactions.network 컬럼 추가 및 기존 레코드 역참조(UPDATE SET network = wallet.network) 전략이 마이그레이션 순서 의존성과 함께 명시되어 있다
  4. 키스토어 경로/메타데이터의 환경 모델 영향이 분석되어 변경 필요 여부가 확정되어 있다
**Plans**: 2 plans

Plans:
- [ ] 105-01-PLAN.md — EnvironmentType SSoT 정의 + 환경-네트워크 매핑 함수 설계 + WalletSchema 변경 + 키스토어 영향 분석 (docs/68)
- [ ] 105-02-PLAN.md — DB 마이그레이션 v6a(transactions.network) + v6b(wallets 12-step 재생성) 전략 설계 (docs/69)

### Phase 106: 파이프라인 + 네트워크 리졸브 설계
**Goal**: 트랜잭션 요청에서 실제 네트워크가 리졸브되고 환경 격리가 검증되는 데이터 흐름이 설계되어, 구현자가 Stage 1부터 AdapterPool 호출까지 코드를 작성할 수 있다
**Depends on**: Phase 105
**Requirements**: PIPE-01, PIPE-02, PIPE-03, PIPE-04
**Success Criteria** (what must be TRUE):
  1. NetworkResolver의 인터페이스, 우선순위(request.network > wallet.defaultNetwork > environment 기본값), 에러 분기가 의사코드로 정의되어 있다
  2. PipelineContext에서 wallet.environment + resolvedNetwork가 전파되는 Stage 1~6 데이터 흐름도가 존재한다
  3. 환경-네트워크 교차 검증 로직(mainnet 월렛 + testnet 네트워크 차단)의 검증 시점, 에러 코드, 에러 메시지가 명시되어 있다
  4. AdapterPool.resolve() 호출부의 변경 방안(리졸브된 network 전달)이 기존 캐시 키 구조와 호환됨이 확인되어 있다
**Plans**: TBD

Plans:
- [ ] 106-01: NetworkResolver + PipelineContext + 환경 교차 검증 + AdapterPool 호출 변경

### Phase 107: 정책 엔진 네트워크 확장 설계
**Goal**: 정책 엔진이 네트워크 단위로 트랜잭션을 제어할 수 있는 확장이 설계되어, ALLOWED_NETWORKS 평가와 네트워크별 차등 정책의 스키마/로직/우선순위가 확정되어 있다
**Depends on**: Phase 106
**Requirements**: PLCY-01, PLCY-02, PLCY-03
**Success Criteria** (what must be TRUE):
  1. ALLOWED_NETWORKS PolicyType의 Zod 스키마(ruleConfig), 평가 로직(허용/거부 판정), 미설정 시 기본 동작(환경 내 전체 허용)이 의사코드로 정의되어 있다
  2. 기존 정책(SPENDING_LIMIT 등)의 network 필드 추가 스키마와, 네트워크 매칭 시 4단계 override 우선순위(네트워크 특정 > 월렛 전체 > 글로벌 네트워크 > 글로벌 전체)가 명시되어 있다
  3. policies 테이블의 network 컬럼 추가 마이그레이션이 Phase 105의 DB 전략과 통합되어 설계되어 있다
**Plans**: TBD

Plans:
- [ ] 107-01: ALLOWED_NETWORKS + 네트워크 스코프 정책 + policies 테이블 확장

### Phase 108: API/인터페이스 + DX 설계
**Goal**: REST API, MCP, SDK의 network 파라미터 추가와 하위호환 전략이 설계되고, Quickstart 워크플로우가 환경 모델에 맞게 재설계되어, 구현자가 모든 인터페이스를 일관되게 변경할 수 있다
**Depends on**: Phase 105, Phase 106
**Requirements**: API-01, API-02, API-03, API-04, API-05, DX-01, DX-02
**Success Criteria** (what must be TRUE):
  1. POST /v1/transactions/send의 network 선택 파라미터, POST /v1/wallets의 environment 파라미터, GET /v1/wallets/:id/assets의 멀티네트워크 잔액 집계(Promise.allSettled) 인터페이스가 Zod 스키마 수준으로 정의되어 있다
  2. MCP 도구(send_transaction 등)와 TS/Python SDK 메서드의 network 파라미터 추가가 기존 인터페이스와의 하위호환을 포함하여 설계되어 있다
  3. 기존 클라이언트 하위호환 전략(default_network fallback, network 미지정 시 기존 동작 유지)이 SDK/MCP/REST 3개 인터페이스에 대해 일관되게 정의되어 있다
  4. quickstart --mode testnet/mainnet 워크플로우(Solana+EVM 2월렛 일괄 생성, MCP 토큰 자동 생성, MCP 클라이언트 설정 스니펫 출력)의 단계별 흐름이 설계되어 있다
**Plans**: TBD

Plans:
- [ ] 108-01: REST API network 파라미터 + 월렛 생성 + 잔액 조회 설계
- [ ] 108-02: MCP/SDK 확장 + 하위호환 전략 + Quickstart 워크플로우

## Progress

**Execution Order:**
Phases execute in numeric order: 105 -> 106 -> 107 -> 108

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 105. Environment 데이터 모델 + DB 마이그레이션 설계 | 0/2 | Not started | - |
| 106. 파이프라인 + 네트워크 리졸브 설계 | 0/1 | Not started | - |
| 107. 정책 엔진 네트워크 확장 설계 | 0/1 | Not started | - |
| 108. API/인터페이스 + DX 설계 | 0/2 | Not started | - |
