# 마일스톤 m31-04: Hyperliquid 생태계 통합

- **Status:** PLANNED
- **Milestone:** v31.4

## 목표

HyperEVM 체인 지원과 Hyperliquid DEX(Perp/Spot) 거래, Sub-accounts를 통합하여 WAIaaS에서 Hyperliquid 생태계를 활용할 수 있도록 한다. 기존 EVM 지갑이 HyperEVM 네트워크에서 그대로 동작하며, Hyperliquid L1 DEX 거래는 EIP-712 서명 기반 API로 통합한다.

> **리서치 필수**: Hyperliquid는 일반 EVM DEX와 달리 자체 L1 위의 API 기반 거래 시스템이다. 구현 착수 전에 반드시 Hyperliquid API 사양, EIP-712 서명 구조, Sub-account 모델, Rate Limit 정책, Testnet 환경 등을 충분히 리서치하여 설계 문서에 반영해야 한다. 기존 6-stage 파이프라인과의 통합 방안도 리서치 단계에서 확정한다.

---

## 배경

### Hyperliquid 개요

Hyperliquid는 자체 L1 블록체인 위에 구축된 고성능 Perp/Spot DEX이다. 특징:
- **HyperEVM**: EVM 호환 체인 (Chain ID 999 mainnet / 998 testnet), viem 빌트인 지원
- **L1 DEX**: 온체인 TX가 아닌 EIP-712 서명 + REST API 기반 거래
- **Sub-accounts**: 마스터 계정 아래 여러 서브 계정 운용, 계정 간 자금 이동

### 기존 인프라 활용

- EVM 체인 추가: `EvmNetworkType` enum + `EVM_CHAIN_MAP` 엔트리 추가로 즉시 지원
- Perp 프레임워크: Drift Perp(v29.8)의 `IPerpProvider` 패턴 재활용 가능
- DeFi Action Provider: Jupiter/0x/Aave 등과 동일한 패턴으로 구현

### Hyperliquid API 특성

- 거래 서명: EIP-712 typed data signing (기존 EVM 서명 인프라 활용)
- 주문 타입: Market, Limit, Stop-Limit, Take-Profit, TWAP
- 계정 모델: L1 주소 기반, Sub-account는 별도 API로 관리
- REST API + WebSocket (실시간 포지션/주문 상태)

---

## 범위

### Phase 1: HyperEVM 체인 추가

HyperEVM Mainnet/Testnet을 EVM 지원 체인에 추가한다.

**변경 대상:**
- `packages/core/src/enums/chain.ts`: `NETWORK_TYPES`, `EVM_NETWORK_TYPES`, `ENVIRONMENT_NETWORK_MAP`, `MAINNET_NETWORKS`
- `packages/adapters/evm/src/evm-chain-map.ts`: viem chain import + `EVM_CHAIN_MAP` 엔트리
- 관련 테스트 업데이트

**체인 정보:**

| 네트워크 | viem export | Chain ID | 네이티브 토큰 |
|----------|-------------|----------|---------------|
| HyperEVM Mainnet | `hyperEvm` | 999 | HYPE |
| HyperEVM Testnet | `hyperliquidEvmTestnet` | 998 | HYPE |

### Phase 2: Hyperliquid DEX 리서치 및 설계

Hyperliquid L1 DEX API를 심층 리서치하고 WAIaaS 아키텍처에 통합하는 설계 문서를 작성한다.

**리서치 항목:**
- Hyperliquid Exchange API / Info API / WebSocket API 전체 사양 분석
- EIP-712 서명 구조 상세 (action types, nonce 관리, 체인별 서명 차이)
- Sub-account 생성/관리 API 및 제약 사항
- Rate Limit 정책 및 IP/계정 기반 제한
- Testnet(api.hyperliquid-testnet.xyz) 환경 차이점
- Builder Fee 구조 (WAIaaS 빌더 등록 가능 여부)

**설계 항목:**
- EIP-712 서명 플로우 → WAIaaS 서명 파이프라인 매핑
- `IPerpProvider` 확장 또는 신규 인터페이스 설계
- Spot 거래 인터페이스 설계
- Sub-account ↔ WAIaaS 월렛 모델 매핑
- 기존 6-stage 파이프라인과 API 기반 거래의 차이 해소 방안
- MCP 도구 / SDK 메서드 설계

### Phase 3: Hyperliquid Perp 구현

Hyperliquid Perpetual Futures 거래를 구현한다.

**기능:**
- Market/Limit 주문 (Open/Close)
- Stop-Loss / Take-Profit 주문
- 포지션 조회 (미실현 PnL, 레버리지, 마진)
- 펀딩 레이트 조회
- 주문 취소 / 주문 상태 조회
- 레버리지 설정
- MCP 도구 + SDK 메서드
- Action Provider 패턴 구현

### Phase 4: Hyperliquid Spot 구현

Hyperliquid Spot 마켓 거래를 구현한다.

**기능:**
- Market/Limit 주문
- 잔액 조회 (Spot 계정)
- 주문 취소 / 주문 상태 조회
- 마켓 정보 조회 (가격, 거래량)
- MCP 도구 + SDK 메서드

### Phase 5: Sub-accounts

Hyperliquid Sub-account 기능을 WAIaaS 월렛 모델과 통합한다.

**기능:**
- Sub-account 생성/조회
- Master ↔ Sub-account 간 자금 이동 (internal transfer)
- Sub-account별 포지션/잔액 조회
- WAIaaS 월렛과의 매핑 전략 (1 wallet = 1 sub-account 또는 N:1)

---

## 기술적 고려사항

1. **파이프라인 분기**: Hyperliquid L1 거래는 온체인 TX가 아닌 API 콜이므로 기존 6-stage 파이프라인과 다른 플로우 필요. 별도 `HyperliquidExchangeClient` 또는 Stage 5 분기로 처리.
2. **서명 방식**: EIP-712 typed data signing — 기존 `EvmAdapter.signTypedData` 활용 가능.
3. **WebSocket**: 실시간 주문/포지션 업데이트를 위한 WebSocket 연결 관리 필요.
4. **Rate Limiting**: Hyperliquid API rate limit 준수 (기존 RPC Pool 패턴 참고).
5. **Testnet 지원**: Hyperliquid testnet(api.hyperliquid-testnet.xyz) 환경 분리.

---

## 테스트 항목

- HyperEVM 체인 등록 및 기존 EVM 지갑 호환 테스트
- EIP-712 서명 생성/검증 테스트
- Perp 주문 CRUD (mock API) 테스트
- Spot 주문 CRUD (mock API) 테스트
- Sub-account 생성/이동 테스트
- MCP 도구 + SDK 메서드 통합 테스트
- 에러 핸들링 (API 에러, rate limit, insufficient margin 등)
