# Technology Stack: Hyperliquid 생태계 통합

**Project:** WAIaaS v31.4 Hyperliquid Ecosystem
**Researched:** 2026-03-08

## Recommended Stack

### HyperEVM Chain (viem 빌트인)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| viem `hyperEvm` | ^2.21.0 (기존) | HyperEVM Mainnet (Chain ID 999) | viem 빌트인 chain export. `import { hyperEvm } from 'viem/chains'`로 즉시 사용. `hyperliquid` alias도 export됨 |
| viem `hyperliquidEvmTestnet` | ^2.21.0 (기존) | HyperEVM Testnet (Chain ID 998) | viem 빌트인 chain export. `import { hyperliquidEvmTestnet } from 'viem/chains'` |

**Confidence: HIGH** — viem GitHub `src/chains/index.ts`에서 `hyperEvm` (alias `hyperliquid`)과 `hyperliquidEvmTestnet` export 확인됨. `defineChain` fallback 불필요.

**EVM_CHAIN_MAP 추가만으로 완료:**
```typescript
import { hyperEvm, hyperliquidEvmTestnet } from 'viem/chains';

// EVM_CHAIN_MAP에 추가
'hyperevm-mainnet': { chain: hyperEvm, nativeToken: 'HYPE' },
'hyperevm-testnet': { chain: hyperliquidEvmTestnet, nativeToken: 'HYPE' },
```

### Hyperliquid L1 DEX Client — 자체 구현 권장 (외부 SDK 미사용)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| 자체 `HyperliquidExchangeClient` | N/A | Exchange/Info/WebSocket API 래퍼 | 외부 SDK 의존성 추가 불필요. Hyperliquid REST API는 단순한 POST 요청 + EIP-712 서명이며, 기존 패턴(DcentSwapApiClient, 0xSwapClient 등)과 동일한 구조로 구현 가능 |
| `@msgpack/msgpack` | ^3.0.0 | L1 action hash 계산 | phantom agent 서명에 필수. action을 msgpack으로 직렬화 -> nonce append -> keccak256 해시 -> connectionId 생성. 공식 msgpack 패키지, TypeScript 지원, 0 dependencies |
| viem `keccak256` | ^2.21.0 (기존) | action hash 계산 | msgpack 직렬화 결과의 keccak256 해시 계산. viem 내장 유틸리티 사용 |
| viem `signTypedData` | ^2.21.0 (기존) | EIP-712 서명 | 기존 EvmAdapter.signTypedData 활용. L1 action과 user-signed action 모두 EIP-712 |

**외부 SDK를 사용하지 않는 이유:**

| SDK | Version | Weekly Downloads | 미사용 이유 |
|-----|---------|-----------------|-------------|
| `hyperliquid` (nomeida) | 1.7.7 | ~4,200 | ethers.js 의존성 (WAIaaS는 viem 전용), Node 22+ 필수(native WebSocket), 커뮤니티 유지보수 |
| `@nktkas/hyperliquid` | 0.30.2 | ~500 | valibot 스키마 도입(v0.25+)으로 viem과 별도 validation 레이어 추가, 0.x 버전 불안정, API 표면이 너무 넓음 |
| `@hyper-d3x/hyperliquid-ts-sdk` | N/A | ~62 | 매우 낮은 사용량, 유지보수 불확실 |

**자체 구현이 적합한 이유:**
1. Hyperliquid REST API는 단 2개 엔드포인트(Exchange POST, Info POST)로 구성 — 복잡도 낮음
2. 기존 `DcentSwapApiClient`, `ZeroExSwapClient`, `LiFiBridgeClient` 등과 동일한 HTTP client 패턴
3. EIP-712 서명은 viem `signTypedData` 그대로 사용 — 외부 SDK의 서명 래퍼 불필요
4. WAIaaS의 에러 핸들링/재시도/Admin Settings 패턴과 직접 통합 가능
5. 공식 TypeScript SDK 부재 (공식은 Python SDK만 제공) — 커뮤니티 SDK 의존성 리스크

### EIP-712 서명 구성

| 구분 | Domain Name | Version | Chain ID | Verifying Contract |
|------|-------------|---------|----------|-------------------|
| L1 Action (거래) | `"Exchange"` | `"1"` | `1337` (고정) | `0x0000...0000` |
| User-Signed Action (계정) | `"HyperliquidSignTransaction"` | `"1"` | `42161` (mainnet) / `421614` (testnet) | `0x0000...0000` |

**Confidence: HIGH** — 공식 Python SDK signing.py, Chainstack 문서, 다수 구현체에서 일관되게 확인됨.

**L1 Action Phantom Agent 서명 플로우:**
```typescript
// 1. action을 msgpack으로 직렬화 (필드 순서 중요!)
const packed = msgpack.encode(action);

// 2. nonce(8 bytes LE) + vaultAddress(20 bytes, 없으면 0x00) append
const data = Buffer.concat([packed, nonceBytes, vaultBytes]);

// 3. keccak256 해시 -> connectionId
const connectionId = keccak256(data);

// 4. phantom agent 구조로 EIP-712 서명
const types = {
  Agent: [
    { name: 'source', type: 'string' },      // "a" mainnet, "b" testnet
    { name: 'connectionId', type: 'bytes32' }  // keccak256 해시
  ]
};
const domain = {
  name: 'Exchange',
  version: '1',
  chainId: 1337,
  verifyingContract: '0x0000000000000000000000000000000000000000'
};
```

**User-Signed Action 타입 구조:**
```typescript
// UsdSend
{ 'HyperliquidTransaction:UsdSend': [
  { name: 'hyperliquidChain', type: 'string' },  // "Mainnet" or "Testnet"
  { name: 'destination', type: 'string' },
  { name: 'amount', type: 'string' },
  { name: 'time', type: 'uint64' }
]}

// SpotSend
{ 'HyperliquidTransaction:SpotSend': [
  { name: 'hyperliquidChain', type: 'string' },
  { name: 'destination', type: 'string' },
  { name: 'token', type: 'string' },
  { name: 'amount', type: 'string' },
  { name: 'time', type: 'uint64' }
]}

// ApproveAgent
{ 'HyperliquidTransaction:ApproveAgent': [
  { name: 'hyperliquidChain', type: 'string' },
  { name: 'agentAddress', type: 'address' },
  { name: 'agentName', type: 'string' },
  { name: 'nonce', type: 'uint64' }
]}
```

### WebSocket — Node.js 내장 WebSocket 사용

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Node.js native WebSocket | Node 22+ | 실시간 주문/포지션 업데이트 | Node 22+ 빌트인 WebSocket API 사용. 추가 라이브러리 불필요. WAIaaS는 이미 Node 22 타겟 |

**WebSocket 엔드포인트:**
- Mainnet: `wss://api.hyperliquid.xyz/ws`
- Testnet: `wss://api.hyperliquid-testnet.xyz/ws`
- 구독 제한: IP당 1,000 WebSocket 구독

**구독 채널:** allMids, l2Book, trades, orderUpdates, userEvents, candle 등

### Rate Limiting — 기존 패턴 충분

| 항목 | 제한 | 비고 |
|------|------|------|
| REST 총 가중치 | 1,200/분 | Info + Exchange 합산 |
| Info 엔드포인트 (기본) | 가중치 20 | l2Book, clearinghouseState 등은 가중치 2 |
| Exchange 엔드포인트 | 가중치 1 | 주문/취소 등 |
| 누적 거래량 기반 | 1 req / 1 USDC 거래량 | 초기 10,000 req 버퍼 |
| 추가 용량 구매 | `reserveRequestWeight` action | 런타임 확장 가능 |

**기존 RPC Pool 패턴으로 충분한 이유:**
- Hyperliquid는 단일 API 서버(로테이션 불필요) -> 단순 rate limiter로 충분
- 가중치 기반 -> 엔드포인트별 가중치를 추적하는 간단한 슬라이딩 윈도우 카운터
- 새 라이브러리 불필요 — `HyperliquidExchangeClient` 내부에 rate limit 카운터 구현

### Supporting Libraries (신규 추가 1개만)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@msgpack/msgpack` | ^3.0.0 | L1 action hash의 msgpack 직렬화 | L1 action 서명 시 phantom agent connectionId 계산에 필수 |

**추가하지 않는 것:**
- WebSocket 라이브러리 (Node 22 내장)
- Hyperliquid SDK (자체 client 구현)
- Rate limiting 라이브러리 (자체 구현)
- EIP-712 라이브러리 (viem 내장)
- keccak256 라이브러리 (viem 내장)

## API 엔드포인트 정리

| 네트워크 | Exchange API | Info API | WebSocket |
|----------|-------------|----------|-----------|
| Mainnet | `https://api.hyperliquid.xyz/exchange` | `https://api.hyperliquid.xyz/info` | `wss://api.hyperliquid.xyz/ws` |
| Testnet | `https://api.hyperliquid-testnet.xyz/exchange` | `https://api.hyperliquid-testnet.xyz/info` | `wss://api.hyperliquid-testnet.xyz/ws` |

## Exchange Action Types (구현 대상)

### Perp 거래 (Phase 3)
| Action | Purpose |
|--------|---------|
| `order` | Market/Limit/Trigger 주문 |
| `cancel` / `cancelByCloid` | 주문 취소 |
| `modify` / `batchModify` | 주문 수정 |
| `updateLeverage` | 레버리지 설정 |
| `updateIsolatedMargin` | 격리 마진 조정 |
| `twapOrder` / `twapCancel` | TWAP 주문 |

### Spot 거래 (Phase 4)
| Action | Purpose |
|--------|---------|
| `order` (spot market) | Spot 주문 (같은 order action, asset ID로 구분) |
| `cancel` / `cancelByCloid` | Spot 주문 취소 |
| `usdClassTransfer` | Perp <-> Spot 자금 이동 |

### Sub-account (Phase 5)
| Action | Purpose |
|--------|---------|
| `createSubAccount` | Sub-account 생성 (Private key 없음) |
| `subAccountTransfer` / `sendAsset` | Master <-> Sub 간 자금 이동 |
| `vaultAddress` 필드 | Sub-account 대리 거래 시 master가 서명 |

### 계정 관리
| Action | Purpose |
|--------|---------|
| `usdSend` | USDC 전송 (user-signed) |
| `spotSend` | Spot 자산 전송 (user-signed) |
| `withdraw3` | Bridge 출금 (user-signed) |
| `approveAgent` | API 지갑 승인 (user-signed) |

## Sub-account 핵심 특성

- Sub-account는 **Private key가 없음** — master 계정이 서명하고 `vaultAddress` 필드에 sub-account 주소를 지정
- WAIaaS 매핑: 1 WAIaaS wallet = 1 master account, sub-account는 wallet 내부 개념으로 관리
- Sub-account 주소는 42자 hex 형식 (`subAccountUser` 필드)
- Master <-> Sub 간 자금 이동은 L1 action (`sendAsset`)으로 처리

## Signing 주의 사항 (공식 문서 기반)

1. **두 가지 서명 스키마 구분 필수**: L1 action (phantom agent, chainId 1337) vs user-signed action (HyperliquidSignTransaction, chainId 42161/421614)
2. **msgpack 필드 순서 중요**: action 객체의 필드 순서가 msgpack 직렬화에 영향. 공식 Python SDK의 필드 순서를 따라야 함
3. **숫자 trailing zeros 제거**: price/size 필드에서 불필요한 trailing zeros 제거 후 직렬화
4. **주소 소문자화**: 서명 전 모든 주소를 lowercase로 변환 (네트워크가 bytes 파싱 시 자동 소문자화)
5. **서명 검증 함정**: 로컬에서 signer 복구가 정상이어도 payload가 올바르다는 보장 없음 — 테스트넷 검증 필수

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Hyperliquid Client | 자체 `HyperliquidExchangeClient` | `hyperliquid` npm (nomeida) | ethers.js 의존성, WAIaaS는 viem 전용. 서명 로직 래퍼가 불필요한 추상화 추가 |
| Hyperliquid Client | 자체 구현 | `@nktkas/hyperliquid` npm | 0.x 불안정, valibot 의존성 추가, API 표면 과잉 |
| msgpack | `@msgpack/msgpack` | `msgpackr` | 공식 msgpack org 패키지, TypeScript d.ts 번들, 0 dependencies, 더 넓은 커뮤니티 |
| WebSocket | Node 22 native | `ws` npm | Node 22에서 native WebSocket 충분, 추가 의존성 불필요 |
| Rate Limiter | 자체 슬라이딩 윈도우 | `bottleneck` npm | Hyperliquid는 단일 서버, 가중치 기반 -> 50줄 내외 자체 구현으로 충분 |

## Installation

```bash
# 신규 의존성 (1개만)
cd packages/actions
pnpm add @msgpack/msgpack

# 기존 의존성 활용 (추가 설치 불필요)
# - viem (hyperEvm, hyperliquidEvmTestnet chain exports)
# - viem (keccak256, signTypedData)
# - Node 22 (native WebSocket)
```

## 기존 인프라 재활용 정리

| 기존 컴포넌트 | Hyperliquid 활용 |
|---------------|-----------------|
| `EvmAdapter.signTypedData` | EIP-712 서명 (L1 action phantom agent + user-signed action) |
| `EVM_CHAIN_MAP` | hyperEvm / hyperliquidEvmTestnet 체인 등록 |
| `IPerpProvider` (Drift 패턴) | Hyperliquid Perp 구현 인터페이스 |
| `IActionProvider` | HyperliquidPerpActionProvider, HyperliquidSpotActionProvider |
| `ActionProviderRegistry` | 액션 프로바이더 등록/노출 |
| Admin Settings 패턴 | API endpoint, testnet 전환, rate limit 설정 |
| 6-stage pipeline SIGN type | L1 action을 SIGN type으로 매핑 (EIP-712 서명만 수행, 온체인 TX 없음) |
| RPC Pool rate limit 패턴 | 가중치 기반 rate limiter 구현 참고 |

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| viem chain exports | HIGH | GitHub src/chains/index.ts에서 `hyperEvm`, `hyperliquidEvmTestnet` 확인 |
| EIP-712 서명 구조 | HIGH | 공식 Python SDK, Chainstack docs, 다수 구현체에서 일관된 정보 |
| Rate limiting | HIGH | 공식 Hyperliquid docs에서 상세 가중치 시스템 문서화 |
| WebSocket | MEDIUM | 공식 docs 확인, 단 Node 22 native WebSocket의 reconnect 안정성은 검증 필요 |
| Sub-account API | MEDIUM | 공식 docs + ccxt 이슈에서 확인, 단 세부 필드 구조는 구현 시 검증 필요 |
| 외부 SDK 미사용 결정 | HIGH | API가 단순(2 엔드포인트), 기존 client 패턴과 동일, 공식 TS SDK 부재 |

## Sources

- [viem chains index.ts](https://github.com/wevm/viem/blob/main/src/chains/index.ts) — hyperEvm, hyperliquidEvmTestnet export 확인
- [Hyperliquid Exchange Endpoint Docs](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint) — 전체 action type 목록
- [Hyperliquid Rate Limits Docs](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits) — 가중치 기반 rate limit 상세
- [Hyperliquid Signing Docs](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/signing) — 서명 가이드
- [Hyperliquid Python SDK signing.py](https://github.com/hyperliquid-dex/hyperliquid-python-sdk/blob/master/hyperliquid/utils/signing.py) — 공식 참조 구현
- [Chainstack Hyperliquid Auth Guide](https://docs.chainstack.com/docs/hyperliquid-authentication-guide) — EIP-712 domain 상세
- [DeepWiki nomeida/hyperliquid Auth](https://deepwiki.com/nomeida/hyperliquid/6.1-authentication-and-signing) — phantom agent 구조 분석
- [@nktkas/hyperliquid npm](https://www.npmjs.com/package/@nktkas/hyperliquid) — 커뮤니티 SDK 비교
- [hyperliquid npm (nomeida)](https://www.npmjs.com/package/hyperliquid) — 커뮤니티 SDK 비교
- [@msgpack/msgpack npm](https://www.npmjs.com/package/@msgpack/msgpack) — msgpack 패키지
- [Hyperliquid WebSocket Docs](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/websocket) — WebSocket API 사양
- [Turnkey x Hyperliquid EIP-712](https://www.turnkey.com/blog/hyperliquid-secure-eip-712-signing) — EIP-712 구현 사례
- [Hyperliquid Sub-accounts Info](https://docs.chainstack.com/reference/hyperliquid-info-subaccounts) — Sub-account API
- [Hyperliquid Nonces and API Wallets](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/nonces-and-api-wallets) — Nonce 관리
