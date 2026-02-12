# Roadmap: WAIaaS v1.4.1

## Overview

EVM 지갑 인프라를 완성하여 EVM 에이전트 생성(secp256k1 키)부터 트랜잭션 실행, Owner 인증(SIWE)까지 풀 라이프사이클이 동작하고, REST API가 5가지 트랜잭션 타입을 수용하며, MCP/SDK가 토큰 전송을 지원하는 상태를 달성한다. v1.4에서 구현한 `@waiaas/adapter-evm`을 데몬에 연결하는 인프라 마일스톤이다.

## Milestones

- ✅ **v1.4.1 EVM 지갑 인프라 + REST API 5-type 통합 + Owner Auth SIWE** - Phases 82-88 (complete)

## Phases

- [x] **Phase 82: Config + NetworkType + EVM 의존성** - EVM RPC 설정, 네트워크 enum 확장, chain-network 교차 검증
- [x] **Phase 83: Keystore 멀티커브** - secp256k1 키 생성 + EIP-55 주소 파생
- [x] **Phase 84: 어댑터 팩토리** - AdapterPool lazy init + 기존 adapter 주입 패턴 전환
- [x] **Phase 85: DB 마이그레이션** - schema_version 2, agents CHECK 확장, managesOwnTransaction
- [x] **Phase 86: REST API 5-type + MCP/SDK 확장** - 5-type 트랜잭션 엔드포인트 + MCP/SDK 토큰 전송
- [x] **Phase 87: Owner Auth SIWE** - EIP-4361 SIWE 검증 + chain별 owner_address 형식 검증
- [x] **Phase 88: 통합 검증** - EVM 풀 라이프사이클 E2E + 회귀 검증

## Phase Details

### Phase 82: Config + NetworkType + EVM 의존성
**Goal**: 데몬이 EVM 체인 설정을 로드하고, 에이전트 생성 시 chain별 기본 네트워크가 적용되며, 무효한 chain-network 조합이 거부되는 상태
**Depends on**: v1.4 완료 (Phase 81)
**Requirements**: CONF-01, CONF-02, CONF-03, CONF-04, CONF-05, CONF-06
**Success Criteria** (what must be TRUE):
  1. config.toml 미설정 시 EVM Tier 1 10개 네트워크의 기본 RPC URL이 존재한다
  2. chain='ethereum'으로 에이전트 생성 시 network 미지정이면 evm_default_network 설정값이 적용된다
  3. chain='ethereum' + network='devnet' 같은 무효 조합이 400 VALIDATION_ERROR로 거부된다
  4. EVM 어댑터가 네트워크별 정확한 네이티브 토큰 심볼을 반환한다 (Polygon=POL, Ethereum=ETH)
  5. EVM_CHAIN_MAP이 10개 네트워크에 대해 viem Chain + chainId + nativeSymbol/nativeName을 제공한다
**Plans**: 3 plans

Plans:
- [x] 82-01-PLAN.md — NetworkType 13값 확장 + EVM_CHAIN_MAP + validateChainNetwork (TDD)
- [x] 82-02-PLAN.md — DaemonConfigSchema EVM RPC 16키 + EvmAdapter nativeSymbol/nativeName
- [x] 82-03-PLAN.md — CreateAgentRequest network optional + chain-network 교차 검증 통합

### Phase 83: Keystore 멀티커브
**Goal**: EVM 에이전트를 생성하면 secp256k1 키가 생성되고 EIP-55 체크섬 주소가 반환되며, 기존 Solana 키스토어가 무변경으로 동작하는 상태
**Depends on**: Phase 82
**Requirements**: KEYS-01, KEYS-02, KEYS-03, KEYS-04
**Success Criteria** (what must be TRUE):
  1. chain='ethereum' 에이전트 생성 시 0x EIP-55 체크섬 주소가 반환된다
  2. 키스토어 파일에 curve 필드('ed25519'|'secp256k1')가 기록되고, 기존 Solana 파일은 curve 없이도 ed25519로 동작한다
  3. secp256k1 비밀키가 AES-256-GCM으로 암호화되고 평문 버퍼가 즉시 제로화된다
  4. 키스토어 파일에 실제 network 값이 기록된다 (하드코딩 'devnet' 제거)
**Plans**: 2 plans

Plans:
- [x] 83-01-PLAN.md — secp256k1 키 생성 + EIP-55 주소 파생 + curve/network 필드 (TDD)
- [x] 83-02-PLAN.md — Agent route generateKeyPair network 파라미터 연결 + 통합 테스트

### Phase 84: 어댑터 팩토리
**Goal**: 데몬이 에이전트의 chain/network 필드에 따라 적절한 어댑터를 자동 선택하고, 동일 네트워크는 인스턴스를 재사용하며, shutdown 시 모든 어댑터가 정리되는 상태
**Depends on**: Phase 83
**Requirements**: POOL-01, POOL-02, POOL-03, POOL-04
**Success Criteria** (what must be TRUE):
  1. Solana 에이전트 트랜잭션 시 SolanaAdapter, EVM 에이전트 시 EvmAdapter가 자동 선택된다
  2. 동일 chain:network 조합의 에이전트들이 하나의 어댑터 인스턴스를 공유한다
  3. 기존 모든 라우트(wallet/transactions/agents)가 adapterPool 패턴으로 동작한다
  4. 데몬 shutdown 시 풀 내 모든 어댑터가 disconnect된다
**Plans**: 2 plans

Plans:
- [x] 84-01-PLAN.md — AdapterPool 클래스 lazy init + 캐싱 + disconnectAll (TDD)
- [x] 84-02-PLAN.md — Daemon/Server/Route adapterPool 패턴 전환 + 테스트 수정

### Phase 85: DB 마이그레이션
**Goal**: schema_version 2 마이그레이션이 agents 테이블의 network CHECK 제약을 EVM 네트워크를 포함하도록 확장하고, 기존 데이터가 100% 보존되며, FK 무결성이 검증되는 상태
**Depends on**: Phase 84
**Requirements**: MIGR-01, MIGR-02, MIGR-03
**Success Criteria** (what must be TRUE):
  1. v1 DB로 데몬 시작 시 schema_version 2로 자동 마이그레이션되고 기존 에이전트 데이터가 유지된다
  2. managesOwnTransaction=true인 마이그레이션이 자체 PRAGMA/트랜잭션을 관리한다
  3. 마이그레이션 후 sqlite.pragma('foreign_key_check') 결과가 빈 배열이다
**Plans**: 1 plan

Plans:
- [x] 85-01-PLAN.md — managesOwnTransaction + v2 마이그레이션 agents network CHECK 확장 (TDD)

### Phase 86: REST API 5-type + MCP/SDK 확장
**Goal**: POST /v1/transactions/send가 5가지 트랜잭션 타입을 수용하고, MCP send_token이 TOKEN_TRANSFER를 지원하며, TS/Python SDK가 5-type 전송을 지원하는 상태
**Depends on**: Phase 85
**Requirements**: API-01, API-02, API-03, API-04, MCPSDK-01, MCPSDK-02, MCPSDK-03, MCPSDK-04
**Success Criteria** (what must be TRUE):
  1. type 필드 없는 레거시 요청({to, amount, memo})이 TRANSFER로 폴백하여 기존 클라이언트가 무변경으로 동작한다
  2. type: 'TOKEN_TRANSFER' 요청이 SPL/ERC-20 토큰 전송 파이프라인을 실행한다
  3. GET /doc OpenAPI 스펙이 oneOf 6-variant(5-type + legacy) 스키마를 정확히 반영한다
  4. MCP send_token에서 TRANSFER + TOKEN_TRANSFER를 실행할 수 있고, CONTRACT_CALL/APPROVE/BATCH는 노출되지 않는다
  5. TS/Python SDK send 메서드가 type/token 파라미터를 지원한다
**Plans**: 2 plans

Plans:
- [x] 86-01-PLAN.md — REST API route schema separation (방안 C) + 5-type OpenAPI components (TDD)
- [x] 86-02-PLAN.md — MCP send_token type/token + TS SDK + Python SDK 5-type extension

### Phase 87: Owner Auth SIWE
**Goal**: EVM 에이전트의 Owner가 SIWE(EIP-4361) 서명으로 인증하고, Owner 주소가 chain별 형식으로 검증되며, 기존 Solana owner-auth가 회귀 없이 동작하는 상태
**Depends on**: Phase 86
**Requirements**: SIWE-01, SIWE-02, SIWE-03, SIWE-04
**Success Criteria** (what must be TRUE):
  1. EVM Owner가 SIWE 메시지에 서명하면 owner-auth 미들웨어를 통과한다
  2. owner-auth 미들웨어가 agent.chain에 따라 solana=Ed25519, ethereum=SIWE로 분기 검증한다
  3. setOwner 시 EVM 주소는 0x + EIP-55 체크섬, Solana 주소는 base58 32B로 검증된다
  4. 기존 Solana owner-auth 테스트가 전수 통과한다 (회귀 없음)
**Plans**: 2 plans

Plans:
- [x] 87-01-PLAN.md — verifySIWE 함수 + validateOwnerAddress 유틸리티 (TDD)
- [x] 87-02-PLAN.md — owner-auth 미들웨어 chain 분기 + setOwner 주소 검증 + 회귀 테스트

### Phase 88: 통합 검증
**Goal**: EVM 에이전트의 풀 라이프사이클(생성 -> 잔액 조회 -> 전송 -> Owner 인증)이 E2E로 동작하고, Solana + EVM 동시 운용이 검증되며, 기존 전체 테스트가 회귀 없이 통과하는 상태
**Depends on**: Phase 87
**Requirements**: Cross-cutting (모든 요구사항의 E2E 통합 검증)
**Success Criteria** (what must be TRUE):
  1. EVM 에이전트 생성 -> 잔액 조회 -> ETH 전송 -> CONFIRMED까지 E2E 파이프라인이 동작한다
  2. Solana + EVM 에이전트를 동시에 운용하고 각각 트랜잭션을 실행할 수 있다
  3. 5-type 트랜잭션(TOKEN_TRANSFER/CONTRACT_CALL/APPROVE/BATCH + 레거시 TRANSFER)이 REST API를 통해 E2E로 동작한다
  4. MCP send_token TOKEN_TRANSFER + SDK 토큰 전송이 E2E로 동작한다
  5. 기존 전체 테스트 스위트(1,126+ tests)가 회귀 없이 통과한다
**Plans**: 3 plans

Plans:
- [x] 88-01-PLAN.md — EVM 풀 라이프사이클 E2E + 듀얼 체인 + SIWE owner-auth 통합 테스트
- [x] 88-02-PLAN.md — 5-type 트랜잭션 파이프라인 E2E + MCP/SDK type/token 통합 검증
- [x] 88-03-PLAN.md — 전체 회귀 테스트 실행 + 검증

## Progress

**Execution Order:** 82 -> 83 -> 84 -> 85 -> 86 -> 87 -> 88

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 82. Config + NetworkType | v1.4.1 | 3/3 | Complete | 2026-02-12 |
| 83. Keystore 멀티커브 | v1.4.1 | 2/2 | Complete | 2026-02-12 |
| 84. 어댑터 팩토리 | v1.4.1 | 2/2 | Complete | 2026-02-12 |
| 85. DB 마이그레이션 | v1.4.1 | 1/1 | Complete | 2026-02-12 |
| 86. REST API 5-type + MCP/SDK | v1.4.1 | 2/2 | Complete | 2026-02-12 |
| 87. Owner Auth SIWE | v1.4.1 | 2/2 | Complete | 2026-02-12 |
| 88. 통합 검증 | v1.4.1 | 3/3 | Complete | 2026-02-12 |
