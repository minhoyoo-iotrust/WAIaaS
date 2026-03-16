# Requirements: WAIaaS v32.5

**Defined:** 2026-03-16
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인이 자금 통제권을 유지하면서.

## v1 Requirements

Requirements for milestone v32.5. Each maps to roadmap phases.

### Interface (인터페이스 확장)

- [x] **INTF-01**: PositionQueryContext 타입이 walletId, chain, networks[], environment, rpcUrls 매핑을 포함한다
- [x] **INTF-02**: IPositionProvider.getPositions 시그니처가 PositionQueryContext를 수용한다
- [x] **INTF-03**: PositionTracker.syncCategory()가 지갑의 chain/environment/networks를 조회하여 컨텍스트를 구성한다
- [x] **INTF-04**: Lido 프로바이더가 PositionQueryContext 시그니처를 수용한다
- [x] **INTF-05**: Jito 프로바이더가 PositionQueryContext 시그니처를 수용한다
- [x] **INTF-06**: Aave V3 프로바이더가 PositionQueryContext 시그니처를 수용한다
- [x] **INTF-07**: Kamino 프로바이더가 PositionQueryContext 시그니처를 수용한다
- [x] **INTF-08**: Pendle 프로바이더가 PositionQueryContext 시그니처를 수용한다
- [x] **INTF-09**: Drift 프로바이더가 PositionQueryContext 시그니처를 수용한다
- [x] **INTF-10**: Hyperliquid Perp 프로바이더가 PositionQueryContext 시그니처를 수용한다
- [x] **INTF-11**: Hyperliquid Spot 프로바이더가 PositionQueryContext 시그니처를 수용한다
- [x] **INTF-12**: 미지원 체인 프로바이더가 빈 배열을 반환한다 (Solana 지갑 → Lido = [])

### Multichain (멀티체인 포지션)

- [x] **MCHN-01**: Lido가 Ethereum/Base/Arbitrum/Optimism/Polygon 5개 네트워크에서 stETH/wstETH 포지션을 조회한다 (Scroll 제외 -- WAIaaS NetworkType 미지원)
- [x] **MCHN-02**: Aave V3가 Ethereum/Base/Arbitrum/Optimism/Polygon 5개 네트워크에서 supply/borrow 포지션을 조회한다
- [x] **MCHN-03**: Pendle가 Ethereum/Arbitrum 2개 네트워크에서 PT/YT 포지션을 조회한다
- [x] **MCHN-04**: 프로바이더별 멀티체인 컨트랙트 주소가 프로바이더 내부 상수로 정의된다
- [x] **MCHN-05**: 각 네트워크의 CAIP-19 assetId가 해당 네트워크의 chainId에 맞게 생성된다
- [x] **MCHN-06**: 멀티네트워크 조회가 Promise.allSettled로 병렬 실행된다
- [x] **MCHN-07**: 단일 네트워크 RPC 실패 시 나머지 네트워크 결과가 정상 반환된다
- [x] **MCHN-08**: Solana 프로바이더(Jito/Kamino/Drift)가 하드코딩 대신 context.networks에서 네트워크를 추출한다
- [x] **MCHN-09**: Hyperliquid Perp/Spot이 해당 체인이 아니면 빈 배열을 반환한다
- [x] **MCHN-10**: 테스트넷 환경 지갑이 테스트넷 컨트랙트 주소(Holesky stETH/wstETH)로 포지션을 조회한다

### Testnet (테스트넷 토글)

- [x] **TEST-01**: defi_positions 테이블에 environment TEXT DEFAULT 'mainnet' 컬럼이 추가된다
- [x] **TEST-02**: 기존 defi_positions 행의 environment가 'mainnet'으로 기본 채워진다
- [x] **TEST-03**: PositionUpdate 저장 시 지갑의 environment 정보가 함께 저장된다
- [x] **TEST-04**: GET /v1/admin/defi/positions가 ?includeTestnets=false(기본)일 때 메인넷 포지션만 반환한다
- [x] **TEST-05**: GET /v1/admin/defi/positions가 ?includeTestnets=true일 때 전체 포지션을 반환한다
- [x] **TEST-06**: Admin DeFi Positions 대시보드에 "Include testnets" 토글이 표시된다
- [x] **TEST-07**: 토글 상태가 localStorage에 저장되어 새로고침 후에도 유지된다
- [x] **TEST-08**: 기존 메인넷 포지션이 인터페이스 변경 후에도 동일하게 표시된다

## v2 Requirements

None — all scoped features included in v1.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Polymarket 포지션 멀티체인 | 자체 polymarket_positions 테이블로 별도 관리, IPositionProvider 대상 아님 |
| DCent Swap / Across Bridge 포지션 | 포지션 프로바이더가 아님 |
| 테스트넷 포지션 자동 새로고침 주기 변경 | 기존 PositionTracker sync 주기로 충분 |
| Admin Settings에서 테스트넷 토글 기본값 변경 | localStorage 개인 설정으로 충분 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| INTF-01 | Phase 432 | Complete |
| INTF-02 | Phase 432 | Complete |
| INTF-03 | Phase 432 | Complete |
| INTF-04 | Phase 432 | Complete |
| INTF-05 | Phase 432 | Complete |
| INTF-06 | Phase 432 | Complete |
| INTF-07 | Phase 432 | Complete |
| INTF-08 | Phase 432 | Complete |
| INTF-09 | Phase 432 | Complete |
| INTF-10 | Phase 432 | Complete |
| INTF-11 | Phase 432 | Complete |
| INTF-12 | Phase 432 | Complete |
| MCHN-01 | Phase 433 | Complete |
| MCHN-02 | Phase 433 | Complete |
| MCHN-03 | Phase 433 | Complete |
| MCHN-04 | Phase 433 | Complete |
| MCHN-05 | Phase 433 | Complete |
| MCHN-06 | Phase 433 | Complete |
| MCHN-07 | Phase 433 | Complete |
| MCHN-08 | Phase 433 | Complete |
| MCHN-09 | Phase 433 | Complete |
| MCHN-10 | Phase 433 | Complete |
| TEST-01 | Phase 434 | Complete |
| TEST-02 | Phase 434 | Complete |
| TEST-03 | Phase 434 | Complete |
| TEST-04 | Phase 434 | Complete |
| TEST-05 | Phase 434 | Complete |
| TEST-06 | Phase 434 | Complete |
| TEST-07 | Phase 434 | Complete |
| TEST-08 | Phase 434 | Complete |

**Coverage:**
- v1 requirements: 30 total
- Mapped to phases: 30
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-16*
*Last updated: 2026-03-16 after initial definition*
