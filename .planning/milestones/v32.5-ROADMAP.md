# Roadmap: WAIaaS v32.5

## Overview

멀티체인 DeFi 포지션 조회와 테스트넷 토글을 구현한다. IPositionProvider 인터페이스를 PositionQueryContext 기반으로 확장하고, EVM 프로바이더(Lido/Aave/Pendle)의 멀티체인 컨트랙트 매핑을 추가한 뒤, Admin 대시보드에서 테스트넷 포지션을 토글할 수 있게 한다.

## Phases

- [x] **Phase 432: Interface Extension** - IPositionProvider 시그니처를 PositionQueryContext 기반으로 확장하고 8개 프로바이더를 마이그레이션
- [x] **Phase 433: Multichain Positions** - EVM 프로바이더별 멀티체인 컨트랙트 매핑 및 병렬 조회 (completed 2026-03-16)
- [x] **Phase 434: Testnet Toggle** - DB environment 컬럼 추가, API 필터링, Admin 대시보드 테스트넷 토글 (completed 2026-03-16)

## Phase Details

### Phase 432: Interface Extension
**Goal**: 모든 포지션 프로바이더가 PositionQueryContext를 통해 지갑의 체인/네트워크/환경 정보를 수신하고, 미지원 체인에서 안전하게 빈 배열을 반환한다
**Depends on**: Nothing (first phase)
**Requirements**: INTF-01, INTF-02, INTF-03, INTF-04, INTF-05, INTF-06, INTF-07, INTF-08, INTF-09, INTF-10, INTF-11, INTF-12
**Success Criteria** (what must be TRUE):
  1. PositionQueryContext 타입이 walletId, chain, networks, environment, rpcUrls를 포함하며 모든 프로바이더에서 사용된다
  2. PositionTracker.syncCategory()가 지갑 메타데이터로부터 컨텍스트를 자동 구성하여 프로바이더에 전달한다
  3. 8개 프로바이더(Lido, Jito, Aave, Kamino, Pendle, Drift, Hyperliquid Perp/Spot)가 새 시그니처로 동작한다
  4. Solana 지갑으로 Lido 포지션 조회 시 빈 배열이 반환되고 에러가 발생하지 않는다
**Plans:** 2/2 plans complete

Plans:
- [x] 432-01-PLAN.md — PositionQueryContext 타입 정의 + IPositionProvider 시그니처 확장 + PositionTracker 컨텍스트 구성
- [x] 432-02-PLAN.md — 8개 프로바이더 마이그레이션 + 체인 가드 추가

### Phase 433: Multichain Positions
**Goal**: EVM DeFi 프로바이더가 지갑에 연결된 모든 네트워크에서 포지션을 병렬 조회하고, 단일 네트워크 실패가 전체 결과에 영향을 주지 않는다
**Depends on**: Phase 432
**Requirements**: MCHN-01, MCHN-02, MCHN-03, MCHN-04, MCHN-05, MCHN-06, MCHN-07, MCHN-08, MCHN-09, MCHN-10
**Success Criteria** (what must be TRUE):
  1. Lido가 5개 네트워크(Scroll 제외 — WAIaaS NetworkType 미지원), Aave V3가 5개 네트워크, Pendle이 2개 네트워크에서 포지션을 조회하여 통합 결과를 반환한다
  2. 각 포지션의 CAIP-19 assetId가 해당 네트워크의 chainId에 맞게 생성된다 (예: eip155:8453/erc20:0x... for Base)
  3. 하나의 네트워크 RPC가 실패해도 나머지 네트워크의 포지션 결과가 정상 반환된다
  4. 테스트넷 환경 지갑이 테스트넷 컨트랙트 주소(Holesky stETH/wstETH)로 포지션을 조회한다
  5. Solana 프로바이더(Jito/Kamino/Drift)가 context.networks에서 네트워크를 추출하고 하드코딩을 사용하지 않는다
**Plans:** 4/4 plans complete

Plans:
- [x] 433-01-PLAN.md — Lido 멀티체인 컨트랙트 매핑 + 5 네트워크 병렬 포지션 조회
- [x] 433-02-PLAN.md — Aave V3 멀티네트워크 getPositions + Promise.allSettled
- [x] 433-03-PLAN.md — Pendle 멀티네트워크 getPositions (Ethereum + Arbitrum)
- [x] 433-04-PLAN.md — Solana 프로바이더 네트워크 동적 추출 + Hyperliquid 가드 확인

### Phase 434: Testnet Toggle
**Goal**: Admin 대시보드에서 테스트넷 포지션을 포함/제외할 수 있고, DB에 환경 정보가 영구 저장된다
**Depends on**: Phase 433
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04, TEST-05, TEST-06, TEST-07, TEST-08
**Success Criteria** (what must be TRUE):
  1. defi_positions 테이블에 environment 컬럼이 존재하고, 기존 행이 모두 'mainnet'으로 채워져 있다
  2. GET /v1/admin/defi/positions가 기본적으로 메인넷 포지션만 반환하고, includeTestnets=true 시 전체를 반환한다
  3. Admin DeFi Positions 대시보드에 "Include testnets" 토글이 표시되고, 상태가 localStorage에 저장되어 새로고침 후에도 유지된다
  4. 기존 메인넷 포지션이 인터페이스 변경 전후로 동일하게 표시된다 (회귀 없음)
**Plans:** 2/2 plans complete

Plans:
- [ ] 434-01-PLAN.md — DB migration v59 + PositionWriteQueue environment + Admin API includeTestnets filter
- [ ] 434-02-PLAN.md — Admin DeFi Positions 대시보드 "Include testnets" 토글 + localStorage 저장

## Progress

**Execution Order:**
Phases execute in numeric order: 432 → 433 → 434

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 432. Interface Extension | 2/2 | Complete    | 2026-03-16 |
| 433. Multichain Positions | 4/4 | Complete    | 2026-03-16 |
| 434. Testnet Toggle | 2/2 | Complete    | 2026-03-16 |
