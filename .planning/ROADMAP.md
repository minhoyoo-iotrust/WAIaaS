# Roadmap: WAIaaS v0.6 블록체인 기능 확장 설계

## 개요

네이티브 토큰(SOL/ETH) 전송에 한정된 IChainAdapter와 트랜잭션 파이프라인을 4단계에 걸쳐 확장 설계한다. Phase 22에서 SPL/ERC-20 토큰 전송과 자산 조회의 기초를 놓고, Phase 23에서 임의 컨트랙트 호출/Approve/배치 트랜잭션 타입을 확장하며, Phase 24에서 가격 오라클과 Action Provider 추상화 레이어를 설계하고, Phase 25에서 전체 확장 기능의 테스트 전략을 통합하고 기존 설계 문서 8개에 v0.6 변경을 반영한다. 모든 산출물은 설계 문서이며 코드 구현은 포함하지 않는다.

## 마일스톤

- v0.1 Research & Design (shipped 2026-02-05) -- Phases 1-5
- v0.2 Self-Hosted Secure Wallet Design (shipped 2026-02-05) -- Phases 6-9
- v0.3 설계 논리 일관성 확보 (shipped 2026-02-06) -- Phases 10-13
- v0.4 테스트 전략 및 계획 수립 (shipped 2026-02-07) -- Phases 14-18
- v0.5 인증 모델 재설계 + DX 개선 (shipped 2026-02-07) -- Phases 19-21
- **v0.6 블록체인 기능 확장 설계 (in progress)** -- Phases 22-25

## 페이즈

**페이즈 번호 체계:**
- 정수 페이즈 (22, 23, 24, 25): 계획된 마일스톤 작업
- 소수 페이즈 (22.1, 22.2): 긴급 삽입 (INSERTED 표기)

소수 페이즈는 해당 정수 사이에서 번호 순서대로 실행된다.

- [ ] **Phase 22: 토큰 확장 설계** - SPL/ERC-20 토큰 전송, 자산 조회, 수수료 추정, 토큰 정책
- [ ] **Phase 23: 트랜잭션 타입 확장 설계** - 임의 컨트랙트 호출, Approve 관리, 배치 트랜잭션
- [ ] **Phase 24: 상위 추상화 레이어 설계** - 가격 오라클, Action Provider 아키텍처, Swap Action
- [ ] **Phase 25: 테스트 전략 통합 + 기존 문서 반영** - 확장 기능 테스트 전략, 기존 문서 8개 v0.6 통합

## 페이즈 상세

### Phase 22: 토큰 확장 설계

**목표**: 에이전트가 네이티브 토큰뿐 아니라 SPL/ERC-20 토큰을 전송하고, 보유 자산을 조회하며, 에이전트별 허용 토큰 정책이 적용되는 상태를 설계한다
**의존**: 없음 (v0.6 첫 번째 페이즈)
**요구사항**: TOKEN-01, TOKEN-02, TOKEN-03, TOKEN-04, TOKEN-05
**산출물**:
- CHAIN-EXT-01: 토큰 전송 확장 스펙 (TransferRequest.token, SPL/ERC-20 빌드 로직, ALLOWED_TOKENS 정책)
- CHAIN-EXT-02: 자산 조회 스펙 (getAssets() 인터페이스 + RPC 구현 + REST API 응답 스키마)

**성공 기준** (완료 시 참이어야 하는 것):
  1. TransferRequest에 token 필드가 정의되어 있고, undefined일 때 네이티브 전송으로 하위 호환된다
  2. SolanaAdapter와 EvmAdapter에서 SPL/ERC-20 토큰 전송 트랜잭션 빌드 로직이 바이트 수준까지 명세되어 있다
  3. getAssets()가 에이전트 보유 토큰 목록(민트/잔액/소수점)을 반환하는 인터페이스와 RPC 구현이 설계되어 있다
  4. ALLOWED_TOKENS 정책 규칙이 에이전트별 토큰 화이트리스트를 검증하고, 미등록 토큰 전송을 거부하는 로직이 명세되어 있다
  5. SPL ATA 생성 비용과 ERC-20 gas 추정을 포함한 토큰 전송 수수료 추정 로직이 설계되어 있다
**플랜**: 2 plans in 1 wave (parallel)

Plans:
- [ ] 22-01-PLAN.md — TransferRequest.token 확장, SPL/ERC-20 빌드 로직, ALLOWED_TOKENS 정책, 파이프라인 통합 (CHAIN-EXT-01)
- [ ] 22-02-PLAN.md — getAssets() 인터페이스, 수수료 추정 확장, 테스트 시나리오 (CHAIN-EXT-02)

### Phase 23: 트랜잭션 타입 확장 설계

**목표**: 에이전트가 임의 스마트 컨트랙트를 호출하고, 토큰 Approve를 독립 정책으로 관리하며, 복수 인스트럭션을 원자적 배치로 실행하는 트랜잭션 타입을 설계한다
**의존**: Phase 22 (TransferRequest.token 확장, Enum 확장 기반)
**요구사항**: CONTRACT-01, CONTRACT-02, CONTRACT-03, CONTRACT-04, CONTRACT-05, APPROVE-01, APPROVE-02, APPROVE-03, BATCH-01, BATCH-02, BATCH-03
**산출물**:
- CHAIN-EXT-03: 컨트랙트 호출 스펙 (ContractCallRequest, 화이트리스트 정책, 보안 가이드라인)
- CHAIN-EXT-04: Approve 관리 스펙 (ApproveRequest, 정책 규칙, 감사 로그 확장)
- CHAIN-EXT-05: 배치 트랜잭션 스펙 (BatchRequest, Solana 원자적 배치, 정책 합산 평가)

**성공 기준** (완료 시 참이어야 하는 것):
  1. ContractCallRequest로 EVM calldata와 Solana programId+instructionData+accounts를 표현할 수 있고, CONTRACT_WHITELIST/METHOD_WHITELIST 정책이 기본 전면 거부(opt-in)로 동작한다
  2. ApproveRequest가 ContractCall과 독립된 타입으로 존재하고, APPROVED_SPENDERS/APPROVE_AMOUNT_LIMIT/APPROVE_TIER_OVERRIDE 정책이 무제한 approve를 차단한다
  3. BatchRequest로 Solana 원자적 배치를 표현할 수 있고, EVM 미지원 시 명확한 에러를 반환하며, 정책 평가에서 금액 합산과 All-or-Nothing 위반 처리가 명세되어 있다
  4. 파이프라인 Stage 1의 type 분기(TRANSFER/CONTRACT_CALL/APPROVE/BATCH)와 Stage 2의 세션 제약(allowedContracts) 확장이 설계되어 있다
  5. transactions 테이블의 TransactionType Enum 확장(CONTRACT_CALL, APPROVE, BATCH)과 감사 컬럼(contract_address, method_signature)이 명세되어 있다
**플랜**: TBD

Plans:
- [ ] 23-01: 컨트랙트 호출 스펙 (CHAIN-EXT-03)
- [ ] 23-02: Approve 관리 스펙 (CHAIN-EXT-04)
- [ ] 23-03: 배치 트랜잭션 스펙 (CHAIN-EXT-05)

### Phase 24: 상위 추상화 레이어 설계

**목표**: 토큰 종류 무관하게 USD 금액 기준으로 정책을 평가하는 가격 오라클을 설계하고, DeFi 프로토콜 지식을 어댑터에서 분리하여 resolve-then-execute 패턴의 Action Provider 아키텍처와 첫 번째 구현체(Jupiter Swap)를 설계한다
**의존**: Phase 23 (ContractCallRequest 타입, 파이프라인 확장 기반)
**요구사항**: ORACLE-01, ORACLE-02, ORACLE-03, ORACLE-04, ACTION-01, ACTION-02, ACTION-03, ACTION-04, ACTION-05
**산출물**:
- CHAIN-EXT-06: 가격 오라클 스펙 (IPriceOracle, 캐싱, USD 기준 정책, fallback)
- CHAIN-EXT-07: Action Provider 아키텍처 (IActionProvider, resolve-then-execute 패턴, MCP 도구 변환, 플러그인 로드)
- CHAIN-EXT-08: Swap Action 상세 설계 (Jupiter/0x 연동, 슬리피지, 보안)

**성공 기준** (완료 시 참이어야 하는 것):
  1. IPriceOracle 인터페이스가 CoinGecko/Pyth/Chainlink 구현 옵션과 함께 정의되어 있고, 5분 TTL 캐싱 + stale 허용/거부 fallback 전략이 명세되어 있다
  2. 기존 네이티브 금액 기준 정책 평가가 USD 금액 기준으로 확장되어 있고, 토큰 종류 무관하게 동일한 티어 분류가 적용된다
  3. IActionProvider 인터페이스와 ActionDefinition Zod 스키마가 정의되어 있고, resolve()가 ContractCallRequest를 반환하여 기존 파이프라인 정책 평가를 거치는 패턴이 명세되어 있다
  4. ActionDefinition에서 MCP Tool로의 자동 변환(name/description/inputSchema 매핑)과 ~/.waiaas/actions/ 디렉토리 기반 플러그인 로드 메커니즘이 설계되어 있다
  5. Jupiter Swap Action Provider가 quote API 호출부터 ContractCallRequest 변환, 슬리피지 보호, MEV 보호까지 상세 설계되어 있다
**플랜**: TBD

Plans:
- [ ] 24-01: 가격 오라클 스펙 (CHAIN-EXT-06)
- [ ] 24-02: Action Provider 아키텍처 + Swap Action 설계 (CHAIN-EXT-07, CHAIN-EXT-08)

### Phase 25: 테스트 전략 통합 + 기존 문서 반영

**목표**: Phase 22-24에서 설계한 모든 확장 기능의 테스트 전략을 v0.4 프레임워크에 통합하고, 기존 설계 문서 8개에 v0.6 변경사항을 반영하여 문서 간 일관성을 확보한다
**의존**: Phase 24 (전체 확장 기능 설계 완료 후)
**요구사항**: TEST-01, TEST-02, TEST-03, INTEG-01, INTEG-02
**산출물**:
- CHAIN-EXT-09: 확장 기능 테스트 전략 (전체 기능의 테스트 레벨/Mock/보안 시나리오 통합)
- 기존 설계 문서 8개 v0.6 반영 (27, 25, 31, 33, 32, 37, 38, 45)

**성공 기준** (완료 시 참이어야 하는 것):
  1. v0.4 테스트 프레임워크에 신규 Mock 경계 5개(Aggregator, 가격 API, 온체인 오라클, IPriceOracle, IActionProvider)가 추가되어 있다
  2. EVM 로컬 테스트 환경(Hardhat/Anvil)이 ERC-20 배포 + Uniswap fork 시나리오를 포함하여 설계에 반영되어 있다
  3. @waiaas/actions 등 확장 패키지를 포함한 커버리지 기준이 재설정되어 있다
  4. 기존 설계 문서 8개(27-chain-adapter, 25-sqlite-schema, 31-solana-adapter, 33-time-lock, 32-transaction-pipeline, 37-rest-api, 38-sdk-mcp, 45-enum)에 v0.6 확장이 반영되어 있다
  5. TransactionType, PolicyType 등 Enum 확장이 v0.3 SSoT 체계(45-enum-unified-mapping)에 통합되어 있다
**플랜**: TBD

Plans:
- [ ] 25-01: 확장 기능 테스트 전략 (CHAIN-EXT-09)
- [ ] 25-02: 기존 설계 문서 8개 v0.6 통합

## 요구사항 커버리지

| 요구사항 | 페이즈 | 카테고리 |
|----------|--------|---------|
| TOKEN-01 | Phase 22 | 토큰 확장 |
| TOKEN-02 | Phase 22 | 토큰 확장 |
| TOKEN-03 | Phase 22 | 토큰 확장 |
| TOKEN-04 | Phase 22 | 토큰 확장 |
| TOKEN-05 | Phase 22 | 토큰 확장 |
| CONTRACT-01 | Phase 23 | 컨트랙트 호출 |
| CONTRACT-02 | Phase 23 | 컨트랙트 호출 |
| CONTRACT-03 | Phase 23 | 컨트랙트 호출 |
| CONTRACT-04 | Phase 23 | 컨트랙트 호출 |
| CONTRACT-05 | Phase 23 | 컨트랙트 호출 |
| APPROVE-01 | Phase 23 | 토큰 승인 |
| APPROVE-02 | Phase 23 | 토큰 승인 |
| APPROVE-03 | Phase 23 | 토큰 승인 |
| BATCH-01 | Phase 23 | 배치 트랜잭션 |
| BATCH-02 | Phase 23 | 배치 트랜잭션 |
| BATCH-03 | Phase 23 | 배치 트랜잭션 |
| ORACLE-01 | Phase 24 | 가격 오라클 |
| ORACLE-02 | Phase 24 | 가격 오라클 |
| ORACLE-03 | Phase 24 | 가격 오라클 |
| ORACLE-04 | Phase 24 | 가격 오라클 |
| ACTION-01 | Phase 24 | Action Provider |
| ACTION-02 | Phase 24 | Action Provider |
| ACTION-03 | Phase 24 | Action Provider |
| ACTION-04 | Phase 24 | Action Provider |
| ACTION-05 | Phase 24 | Action Provider |
| TEST-01 | Phase 25 | 테스트 전략 |
| TEST-02 | Phase 25 | 테스트 전략 |
| TEST-03 | Phase 25 | 테스트 전략 |
| INTEG-01 | Phase 25 | 문서 통합 |
| INTEG-02 | Phase 25 | 문서 통합 |

**매핑: 30/30 -- 미매핑 요구사항 없음**

## 진행 상황

**실행 순서:** 22 -> 23 -> 24 -> 25

| 페이즈 | 플랜 완료 | 상태 | 완료일 |
|--------|-----------|------|--------|
| 22. 토큰 확장 설계 | 0/2 | Not started | - |
| 23. 트랜잭션 타입 확장 설계 | 0/3 | Not started | - |
| 24. 상위 추상화 레이어 설계 | 0/2 | Not started | - |
| 25. 테스트 전략 통합 + 문서 반영 | 0/2 | Not started | - |
