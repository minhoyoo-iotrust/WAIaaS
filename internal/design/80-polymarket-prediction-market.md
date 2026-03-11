# 설계 문서 80: Polymarket 예측 시장 통합

> WAIaaS v31.9 -- Polymarket의 Off-chain CLOB 주문과 On-chain CTF 정산 하이브리드 아키텍처를 WAIaaS에 통합한다. Hyperliquid(v31.4)의 ApiDirectResult 패턴을 재사용하되, EIP-712 3개 도메인 직접 서명과 HMAC L2 인증이라는 Polymarket 고유 체계를 구현한다. 신규 npm 의존성 없이 viem + native fetch 기반으로 완료한다.

---

## 1. 개요 및 목표

### 1.1 배경

Polymarket은 Polygon 네트워크 위에 구축된 예측 시장 프로토콜이다. Off-chain CLOB(Central Limit Order Book)에서 주문을 매칭하고, On-chain CTF(Conditional Token Framework) 컨트랙트에서 최종 정산하는 하이브리드 아키텍처를 사용한다.

이 구조는 Hyperliquid(v31.4)의 "Off-chain DEX + On-chain Deposits/Withdrawals" 패턴과 본질적으로 동일하다. WAIaaS는 이미 Hyperliquid 통합에서 검증된 `ApiDirectResult` 분기 패턴을 보유하고 있으므로, 동일한 아키텍처 골격 위에 Polymarket 고유 서명/인증 체계만 교체하여 구현한다.

### 1.2 목표

- Polymarket CLOB 주문(buy/sell/cancel/update)을 ApiDirectResult 패턴으로 실행
- CTF 온체인 오퍼레이션(split/merge/redeem)을 기존 CONTRACT_CALL 파이프라인으로 실행
- EIP-712 3개 도메인(ClobAuth, CTF Exchange, Neg Risk CTF Exchange) 서명 구현
- Gamma API 기반 마켓 탐색/검색/상세 조회
- 포지션 추적, PnL 계산, 마켓 해결 상태 모니터링
- Admin UI, MCP, SDK, 정책 엔진 완전 통합

### 1.3 전달 범위 (5개 Phase)

| Phase | 전달물 | 핵심 결과물 |
|-------|--------|------------|
| **370** | 설계 및 리서치 | 본 설계 문서 (doc 80) |
| **371** | CLOB 주문 구현 | PolymarketSigner, ClobClient, OrderProvider, DB v53-v54 |
| **372** | 마켓 조회 + 포지션/정산 | MarketData, CtfProvider, 포지션 추적, PnL |
| **373** | 인터페이스 통합 | Admin UI/Settings, MCP, SDK, 정책 엔진, Skill 파일 |
| **374** | 테스트 + 검증 | E2E 스모크, Agent UAT 시나리오 |

### 1.4 Hyperliquid v31.4 선례와의 유사성

| 항목 | Hyperliquid (v31.4) | Polymarket (v31.9) |
|------|---------------------|-------------------|
| 실행 모델 | Off-chain DEX + On-chain deposit/withdraw | Off-chain CLOB + On-chain CTF settlement |
| 파이프라인 분기 | ApiDirectResult (Stage 5 skip) | ApiDirectResult (동일) |
| 서명 체계 | EIP-712 phantom agent + user-signed | EIP-712 직접 struct 서명 (더 단순) |
| API 인증 | 불필요 (서명만으로 인증) | L1 EIP-712 + L2 HMAC 2단계 |
| DB 테이블 | hyperliquid_orders, sub_accounts | polymarket_orders, positions, api_keys |
| 프로바이더 수 | 3개 (perp/spot/sub-account) | 2개 (order/ctf) |
| Admin UI | 5탭 구조 | 5탭 구조 (동일 패턴) |

### 1.5 Out of Scope

| 항목 | 사유 |
|------|------|
| Proxy Wallet 생성/관리 | EOA signatureType=0으로 충분. 프로그래밍 API 접근에서는 불필요 |
| WebSocket 실시간 피드 | v2 deferred (ADVT-01). REST polling으로 충분 |
| 다른 예측 시장 프로토콜 | Polymarket 집중, 추후 확장 가능 |
| Smart Account signatureType=2 | v2 deferred (ADVT-02) |
| 마켓 생성/해결 | Polymarket 자체 기능. WAIaaS는 거래자 관점만 |
| @polymarket/clob-client 사용 | ethers v5 의존성 충돌. viem 전용 스택 유지 |

---

## 2. Polymarket 아키텍처 개요

### 2.1 3개 서비스

Polymarket은 3개의 독립 API 서비스로 구성된다.

| 서비스 | Base URL | 인증 | 용도 |
|--------|----------|------|------|
| **CLOB API** | `https://clob.polymarket.com` | L1(EIP-712) + L2(HMAC) | 주문 CRUD, 트레이딩 |
| **Gamma API** | `https://gamma-api.polymarket.com` | 없음 | 마켓 탐색, 이벤트, 메타데이터 |
| **Data API** | `https://data-api.polymarket.com` | 없음 | 포지션, 트레이드 히스토리 |

### 2.2 Polygon 온체인 컨트랙트

| 컨트랙트 | 주소 | 용도 |
|----------|------|------|
| **Conditional Tokens (CTF)** | `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045` | ERC-1155 아웃컴 토큰 |
| **CTF Exchange** | `0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E` | 바이너리 마켓 주문 매칭/정산 |
| **Neg Risk CTF Exchange** | `0xC5d563A36AE78145C45a50134d48A1215220f80a` | 멀티 아웃컴 마켓 주문 매칭/정산 |
| **Neg Risk Adapter** | `0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296` | NO -> YES 토큰 변환 |
| **USDC.e (Collateral)** | `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` | 담보 토큰 (6 decimals) |
| **Proxy Wallet Factory** | `0xaB45c5A4B0c941a2F231C04C3f49182e1A254052` | EIP-1167 proxy 생성 (미사용) |
| **Gnosis Safe Factory** | `0xaacfeea03eb1561c4e67d661e40682bd20e3541b` | Safe proxy (미사용) |
| **UMA Adapter** | `0x6A9D222616C90FcA5754cd1333cFD9b7fb6a4F74` | 오라클 해결 |

### 2.3 데이터 플로우

```
AI Agent
  |
  v
MCP Tool / REST API / SDK
  |
  +---> [CLOB Order Flow] ---> ActionProviderRegistry
  |       |                         |
  |       v                         v
  |     PolymarketOrderProvider.resolve()
  |       |
  |       +---> PolymarketSigner.signOrder() [EIP-712]
  |       +---> PolymarketClobClient.postOrder() [HMAC L2]
  |       +---> return ApiDirectResult { __apiDirect: true }
  |               |
  |               v
  |             Stage 5: skip on-chain, CONFIRMED
  |
  +---> [CTF On-Chain Flow] ---> ActionProviderRegistry
  |       |                         |
  |       v                         v
  |     PolymarketCtfProvider.resolve()
  |       |
  |       +---> return ContractCallRequest (split/merge/redeem)
  |               |
  |               v
  |             Stage 5: build -> simulate -> sign -> submit (Polygon)
  |
  +---> [Market Data Flow] ---> REST Query Routes
          |
          v
        PolymarketMarketData (Gamma API + CLOB API)
          |
          +---> 캐시 (30s TTL, 마켓 목록/상세)
          +---> 실시간 가격/오더북 (CLOB API, 캐시 없음)
```

### 2.4 Operation-to-Pipeline 매핑

#### CLOB 주문 (ApiDirectResult, off-chain)

| 오퍼레이션 | Action 이름 | 파이프라인 | 위험도 | 기본 Tier |
|-----------|------------|-----------|--------|----------|
| 아웃컴 토큰 매수 | `pm_buy` | ApiDirectResult | high | APPROVAL |
| 아웃컴 토큰 매도 | `pm_sell` | ApiDirectResult | medium | DELAY |
| 주문 취소 | `pm_cancel_order` | ApiDirectResult | low | INSTANT |
| 전체 주문 취소 | `pm_cancel_all` | ApiDirectResult | low | INSTANT |
| 주문 수정 | `pm_update_order` | ApiDirectResult | medium | DELAY |

#### CTF 온체인 (CONTRACT_CALL / APPROVE)

| 오퍼레이션 | Action 이름 | 파이프라인 | 위험도 | 기본 Tier |
|-----------|------------|-----------|--------|----------|
| 담보 분할 -> 토큰 | `pm_split_position` | CONTRACT_CALL | medium | DELAY |
| 토큰 병합 -> 담보 | `pm_merge_positions` | CONTRACT_CALL | medium | DELAY |
| 승리 토큰 리딤 | `pm_redeem_positions` | CONTRACT_CALL | low | INSTANT |
| USDC CTF 승인 | `pm_approve_collateral` | APPROVE | low | INSTANT |
| CTF 토큰 Exchange 승인 | `pm_approve_ctf` | APPROVE | low | INSTANT |

---

## 3. CLOB 인증 플로우

### 3.1 L1 인증: API Key 생성 (1회 설정)

Polymarket CLOB API는 2단계 인증 체계를 사용한다. L1(EIP-712)으로 API 자격증명을 취득하고, L2(HMAC)로 요청별 인증을 수행한다.

**L1 플로우:**

```typescript
// Step 1: EIP-712 ClobAuth 서명
const signature = await PolymarketSigner.signClobAuth(
  walletAddress,    // address
  timestamp,        // Unix seconds as string
  0n,               // nonce
  privateKey,       // wallet private key
);

// Step 2: POST /auth/api-key with L1 헤더
const response = await fetch('https://clob.polymarket.com/auth/api-key', {
  method: 'POST',
  headers: {
    'POLY_ADDRESS': walletAddress,
    'POLY_SIGNATURE': signature,
    'POLY_TIMESTAMP': timestamp,
    'POLY_NONCE': '0',
  },
});

// Step 3: 응답 — { apiKey, secret, passphrase }
// polymarket_api_keys 테이블에 암호화 저장
```

**L1 헤더 구조:**

| 헤더 | 값 | 용도 |
|------|---|------|
| `POLY_ADDRESS` | 지갑 주소 | 요청 소유자 식별 |
| `POLY_SIGNATURE` | ClobAuth EIP-712 서명 | 지갑 소유 증명 |
| `POLY_TIMESTAMP` | Unix seconds (string) | 리플레이 방지 |
| `POLY_NONCE` | `0` (고정) | 리플레이 방지 |

### 3.2 L2 인증: HMAC 요청 서명 (요청별)

API Key 취득 후, 모든 트레이딩 요청은 HMAC-SHA256 서명이 필요하다.

```typescript
// HMAC 서명 생성
import { createHmac } from 'node:crypto';

function buildHmacHeaders(
  apiKey: string,
  secret: string,
  passphrase: string,
  method: string,
  path: string,
  body: string,
): Record<string, string> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const message = timestamp + method.toUpperCase() + path + body;
  const signature = createHmac('sha256', Buffer.from(secret, 'base64'))
    .update(message)
    .digest('base64');

  return {
    'POLY_ADDRESS': walletAddress,
    'POLY_SIGNATURE': signature,
    'POLY_TIMESTAMP': timestamp,
    'POLY_API_KEY': apiKey,
    'POLY_PASSPHRASE': passphrase,
  };
}
```

**L2 헤더 구조:**

| 헤더 | 값 | 용도 |
|------|---|------|
| `POLY_ADDRESS` | 지갑 주소 | 요청 소유자 식별 |
| `POLY_SIGNATURE` | HMAC-SHA256 서명 | 요청 무결성 증명 |
| `POLY_TIMESTAMP` | Unix seconds | 리플레이 방지 |
| `POLY_API_KEY` | L1에서 취득한 API Key | 세션 식별 |
| `POLY_PASSPHRASE` | L1에서 취득한 Passphrase | 추가 인증 |

### 3.3 API Key 라이프사이클

- **생성**: 지갑별 1세트. 첫 Polymarket 작업 시 lazy creation (pm_buy/pm_sell 등)
- **저장**: `polymarket_api_keys` 테이블에 `api_secret_encrypted`, `api_passphrase_encrypted` 컬럼으로 master password 기반 암호화 저장
- **갱신**: 기존 키 삭제(DELETE /auth/api-key) 후 재생성
- **삭제**: Admin UI 또는 API로 수동 삭제 가능

### 3.4 CLOB REST 엔드포인트 참조

| Method | Path | 인증 | 용도 |
|--------|------|------|------|
| POST | `/auth/api-key` | L1 | API 자격증명 생성 |
| DELETE | `/auth/api-key` | L1 | API 자격증명 삭제 |
| GET | `/auth/api-keys` | L1 | API 자격증명 목록 |
| POST | `/order` | L2 | 주문 제출 |
| DELETE | `/order/{id}` | L2 | 주문 취소 |
| GET | `/data/order/{hash}` | L2 | 주문 상세 조회 |
| GET | `/data/orders` | L2 | 활성 주문 목록 |
| GET | `/trades` | L2 | 체결 내역 |
| GET | `/book` | 없음 | 오더북 조회 |
| GET | `/price` | 없음 | 현재 가격 |
| GET | `/midpoint` | 없음 | 중간 가격 |
| POST | `/cancel-all` | L2 | 전체 주문 취소 |

---

## 4. EIP-712 서명 아키텍처

> **설계 결정 DS-01**: Polymarket EIP-712 서명은 Hyperliquid와 달리 직접 struct 서명이다. phantom agent 추상화가 불필요하므로 viem의 `signTypedData`를 그대로 사용한다.

### 4.1 3개 EIP-712 도메인

Polymarket은 용도에 따라 3개의 EIP-712 도메인을 사용한다.

#### Domain 1: ClobAuthDomain (API Key 생성용)

```typescript
const CLOB_AUTH_DOMAIN = {
  name: 'ClobAuthDomain',
  version: '1',
  chainId: 137n, // Polygon
} as const;

const CLOB_AUTH_TYPES = {
  ClobAuth: [
    { name: 'address', type: 'address' },
    { name: 'timestamp', type: 'string' },
    { name: 'nonce', type: 'uint256' },
    { name: 'message', type: 'string' },
  ],
} as const;

// message 고정값: "This message attests that I control the given wallet"
```

- **용도**: CLOB API 자격증명(apiKey/secret/passphrase) 생성 시 지갑 소유 증명
- **verifyingContract**: 없음 (CLOB 서버가 직접 검증)
- **사용 빈도**: 지갑당 1회 (API Key lazy creation 시)

#### Domain 2: Polymarket CTF Exchange (바이너리 마켓 주문용)

```typescript
const CTF_EXCHANGE_DOMAIN = {
  name: 'Polymarket CTF Exchange',
  version: '1',
  chainId: 137n, // Polygon
  verifyingContract: '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E' as const, // CTF Exchange
} as const;
```

- **용도**: 바이너리(2 아웃컴) 마켓의 주문 서명
- **verifyingContract**: CTF Exchange 컨트랙트
- **사용 빈도**: 주문당 1회

#### Domain 3: Polymarket CTF Exchange (Neg Risk 마켓 주문용)

```typescript
const NEG_RISK_CTF_EXCHANGE_DOMAIN = {
  name: 'Polymarket CTF Exchange', // 동일한 name
  version: '1',
  chainId: 137n,
  verifyingContract: '0xC5d563A36AE78145C45a50134d48A1215220f80a' as const, // Neg Risk Exchange
} as const;
```

- **용도**: Neg Risk(멀티 아웃컴) 마켓의 주문 서명
- **verifyingContract**: Neg Risk CTF Exchange 컨트랙트
- **사용 빈도**: Neg Risk 주문당 1회
- **핵심 차이**: Domain 2와 name/version/chainId는 동일하나 verifyingContract만 다름

### 4.2 Order Struct (12개 필드)

```typescript
const ORDER_TYPES = {
  Order: [
    { name: 'salt', type: 'uint256' },
    { name: 'maker', type: 'address' },
    { name: 'signer', type: 'address' },
    { name: 'taker', type: 'address' },
    { name: 'tokenId', type: 'uint256' },
    { name: 'makerAmount', type: 'uint256' },
    { name: 'takerAmount', type: 'uint256' },
    { name: 'expiration', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'feeRateBps', type: 'uint256' },
    { name: 'side', type: 'uint8' },
    { name: 'signatureType', type: 'uint8' },
  ],
} as const;
```

**필드 상세:**

| 필드 | 타입 | 설명 | WAIaaS 사용 |
|------|------|------|------------|
| `salt` | uint256 | 주문별 랜덤 엔트로피 | `crypto.randomBytes(32)` |
| `maker` | address | 주문 소유자 | WAIaaS 지갑 주소 |
| `signer` | address | 서명자 | EOA = maker와 동일 |
| `taker` | address | 상대방 (0x0 = 공개) | `0x0000...0000` (public) |
| `tokenId` | uint256 | CTF ERC-1155 토큰 ID | 마켓 아웃컴별 고유 ID |
| `makerAmount` | uint256 | 판매할 토큰 수량 | BUY: USDC 수량, SELL: 아웃컴 토큰 수량 |
| `takerAmount` | uint256 | 수령할 토큰 수량 | BUY: 아웃컴 토큰 수량, SELL: USDC 수량 |
| `expiration` | uint256 | 만료 Unix timestamp | 0 = 무만료, GTD = 지정 시간 |
| `nonce` | uint256 | 온체인 취소용 | 0 (단순 salt 기반 유니크) |
| `feeRateBps` | uint256 | 수수료 (basis points) | CLOB API가 설정 |
| `side` | uint8 | 0=BUY, 1=SELL | 매수/매도 방향 |
| `signatureType` | uint8 | 0=EOA, 1=PROXY, 2=SAFE | 0 (EOA, WAIaaS 기본) |

### 4.3 ClobAuth Struct (4개 필드)

```typescript
const CLOB_AUTH_TYPES = {
  ClobAuth: [
    { name: 'address', type: 'address' },     // 지갑 주소
    { name: 'timestamp', type: 'string' },     // Unix seconds
    { name: 'nonce', type: 'uint256' },        // 0 (고정)
    { name: 'message', type: 'string' },       // 고정 메시지
  ],
} as const;
```

### 4.4 Signature Types

| 값 | 이름 | 설명 | WAIaaS 사용 |
|----|------|------|------------|
| 0 | `EOA` | 직접 EOA 서명 | **기본값** -- WAIaaS 지갑이 직접 서명 |
| 1 | `POLY_PROXY` | EIP-1167 proxy wallet | 미지원 (Out of Scope) |
| 2 | `POLY_GNOSIS_SAFE` | Gnosis Safe 서명 | 미지원 (WAIaaS는 Safe 미사용) |

> **설계 결정 DS-02**: signatureType=0 (EOA)을 기본으로 사용한다. Polymarket CLOB API가 EOA 서명을 거부하는 경우에만 Proxy Wallet(signatureType=1) 지원을 추가한다. 이는 첫 메인넷 스모크 테스트에서 검증한다.

### 4.5 PolymarketSigner 클래스 설계

```typescript
import { privateKeyToAccount } from 'viem/accounts';
import { createHmac } from 'node:crypto';
import type { Hex } from 'viem';

/**
 * PolymarketSigner: 정적 메서드 기반 서명 유틸리티.
 * HyperliquidSigner와 동일한 static-method 패턴이나, 직접 struct 서명으로 훨씬 단순하다.
 *
 * 3가지 서명 책임:
 * 1. signOrder() — CLOB 주문 EIP-712 서명
 * 2. signClobAuth() — API Key 생성용 EIP-712 서명
 * 3. buildHmacHeaders() — L2 HMAC 요청 헤더 생성
 */
export class PolymarketSigner {
  /**
   * EIP-712 Order 서명.
   * Domain 2(CTF Exchange) 또는 Domain 3(Neg Risk)을 isNegRisk에 따라 선택.
   */
  static async signOrder(
    order: PolymarketOrder,
    privateKey: Hex,
    isNegRisk: boolean,
  ): Promise<Hex> {
    const account = privateKeyToAccount(privateKey);
    const verifyingContract = isNegRisk
      ? NEG_RISK_CTF_EXCHANGE_ADDRESS
      : CTF_EXCHANGE_ADDRESS;

    return account.signTypedData({
      domain: {
        name: 'Polymarket CTF Exchange',
        version: '1',
        chainId: 137n,
        verifyingContract,
      },
      types: ORDER_TYPES,
      primaryType: 'Order',
      message: order,
    });
  }

  /**
   * EIP-712 ClobAuth 서명 (API Key 생성용).
   */
  static async signClobAuth(
    address: Hex,
    timestamp: string,
    nonce: bigint,
    privateKey: Hex,
  ): Promise<Hex> {
    const account = privateKeyToAccount(privateKey);
    return account.signTypedData({
      domain: { name: 'ClobAuthDomain', version: '1', chainId: 137n },
      types: CLOB_AUTH_TYPES,
      primaryType: 'ClobAuth',
      message: {
        address,
        timestamp,
        nonce,
        message: 'This message attests that I control the given wallet',
      },
    });
  }

  /**
   * L2 HMAC 요청 헤더 생성.
   */
  static buildHmacHeaders(
    apiKey: string,
    secret: string,
    passphrase: string,
    walletAddress: string,
    method: string,
    path: string,
    body: string = '',
  ): Record<string, string> {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const message = timestamp + method.toUpperCase() + path + body;
    const signature = createHmac('sha256', Buffer.from(secret, 'base64'))
      .update(message)
      .digest('base64');

    return {
      POLY_ADDRESS: walletAddress,
      POLY_SIGNATURE: signature,
      POLY_TIMESTAMP: timestamp,
      POLY_API_KEY: apiKey,
      POLY_PASSPHRASE: passphrase,
    };
  }
}
```

**Hyperliquid Signer와의 비교:**

| 항목 | HyperliquidSigner | PolymarketSigner |
|------|-------------------|-----------------|
| 메서드 수 | 2 (signL1Action, signUserSignedAction) | 3 (signOrder, signClobAuth, buildHmacHeaders) |
| 서명 방식 | msgpack encode -> keccak256 -> phantom agent | 직접 struct signTypedData |
| 복잡도 | 높음 (phantom agent 간접 서명) | 낮음 (viem signTypedData 직접 사용) |
| 출력 | `{ r, s, v }` 분해 | `Hex` (65-byte compact) |
| 추가 책임 | 없음 | HMAC 헤더 생성 |

---

## 5. Hyperliquid EIP-712 비교 분석

> **설계 결정 DS-03**: 코드 레벨 공유 추상화 없음. Polymarket과 Hyperliquid는 패턴 레벨만 재사용한다. 서명, API 클라이언트, nonce 관리가 모두 다르므로 공유 추상 클래스는 오버엔지니어링이다.

### 5.1 비교 매트릭스

| 항목 | Hyperliquid | Polymarket | 공유 가능 |
|------|-------------|------------|----------|
| **EIP-712 도메인 수** | 2 (L1 phantom, User-Signed) | 3 (ClobAuth, CTF, Neg Risk) | X |
| **도메인 name** | `Exchange` / `HyperliquidSignTransaction` | `ClobAuthDomain` / `Polymarket CTF Exchange` | X |
| **chainId** | 1337 (phantom) / 42161 (user) | 137 (Polygon) | X |
| **verifyingContract** | `0x0000...0000` (dummy) | 실제 Exchange 컨트랙트 주소 | X |
| **서명 패턴** | 간접 (action -> msgpack -> keccak256 -> phantom agent -> EIP-712) | 직접 (Order struct -> EIP-712) | X |
| **API 인증** | 서명만으로 인증 (API Key 불필요) | L1(EIP-712) + L2(HMAC) 2단계 | X |
| **Nonce 전략** | 밀리초 timestamp | salt (랜덤 uint256) | X |
| **requiresSigningKey** | true (perp/spot) | true (order) / false (ctf) | O (패턴) |
| **ApiDirectResult** | true (perp/spot) | true (order만) | O (Stage 5 분기) |
| **DB 테이블** | hyperliquid_orders, sub_accounts | polymarket_orders, positions, api_keys | X (구조만 유사) |
| **RateLimiter** | Weight 기반 (1200/min) | Request 기반 (TBD) | O (패턴) |
| **MarketData 서비스** | HyperliquidMarketData (in-memory cache) | PolymarketMarketData (in-memory cache) | O (패턴) |
| **Factory 패턴** | createHyperliquidInfrastructure() | createPolymarketInfrastructure() | O (패턴) |
| **Admin Settings** | 9개 키 | 7개 키 | O (패턴) |
| **connect-info** | hyperliquid capability | polymarket capability | O (패턴) |
| **프로바이더 수** | 3개 (perp/spot/sub) | 2개 (order/ctf) | X |

### 5.2 공유 가능 항목 (패턴 레벨)

다음 항목은 코드를 공유하지 않지만, 동일한 아키텍처 패턴을 따른다.

1. **ApiDirectResult Stage 5 분기**: `ctx.actionResult.__apiDirect === true`이면 on-chain 건너뛰기. 기존 코드 변경 없이 동작
2. **ActionProvider 등록 패턴**: `ActionProviderRegistry.register()`, `mcpExpose: true`, `requiresSigningKey: true/false`
3. **Infrastructure Factory 패턴**: 단일 `createPolymarketInfrastructure()` 함수가 모든 의존성을 생성하고 반환
4. **Admin Settings 패턴**: `actions.polymarket_*` 네임스페이스, SettingsService를 통한 런타임 오버라이드
5. **connect-info 패턴**: capabilities 객체에 `polymarket: true` 추가
6. **Admin UI 5탭 구조**: Overview/Markets(Hyperliquid는 Trading)/Orders/Positions/Settings
7. **RateLimiter 패턴**: 윈도우 기반 요청/가중치 제한, 대기 메커니즘

### 5.3 공유 불가 항목 (코드 레벨)

| 항목 | Hyperliquid | Polymarket | 불가 사유 |
|------|-------------|------------|----------|
| Signer | msgpack + phantom agent | 직접 struct 서명 | 완전히 다른 서명 파이프라인 |
| API Client | POST /exchange + /info (서명 인증) | REST + HMAC 인증 | 다른 인증 체계 |
| Nonce | 밀리초 timestamp | salt (crypto.randomBytes) | 다른 유니크 전략 |
| Order wire format | JSON with canonical field order | EIP-712 Order struct | 다른 직렬화 |
| Response 파싱 | ExchangeResponse { status, response } | CLOB 고유 응답 포맷 | 다른 응답 구조 |

### 5.4 결론

> Polymarket 통합은 Hyperliquid 통합의 **아키텍처 패턴을 복제하되, 코드를 공유하지 않는다**. 공유 추상 클래스(예: `BaseDexSigner`, `BaseClobClient`)를 만들지 않는다. 이는 두 프로토콜의 서명/인증/API 체계가 근본적으로 다르기 때문이며, 강제 추상화는 각 프로토콜의 고유 요구사항을 왜곡할 위험이 있다.
>
> 패턴 재사용 범위: 디렉토리 구조, 파일 명명, Factory 함수, Admin Settings 키 네이밍, connect-info 확장, Admin UI 탭 구조, 테스트 구성.

---

## 6. Neg Risk (멀티 아웃컴 마켓)

### 6.1 Neg Risk 동작 원리

일반적인 예측 시장은 "Yes/No" 2개 아웃컴을 가진 바이너리 마켓이다. 하지만 "2024 미국 대선 후보가 누구인지" 같은 질문은 3개 이상의 아웃컴을 갖는다. Polymarket은 이를 **Neg Risk** 메커니즘으로 처리한다.

**Neg Risk의 핵심 아이디어:**
- 멀티 아웃컴 마켓의 각 아웃컴을 독립적인 바이너리 마켓으로 분해
- 각 바이너리 마켓은 "이 아웃컴이 맞는가 Yes/No"
- NegRiskAdapter가 USDC를 WrappedCollateral로 변환하여 담보 관리
- 해결 시 정확히 1개의 아웃컴만 Yes로 해결됨

**예시: 3-way 마켓 "다음 미국 대통령은?"**
```
Event: "다음 미국 대통령은?"
  ├── Market A: "후보 A가 당선?" (Yes/No)  -- tokenId: 12345/12346
  ├── Market B: "후보 B가 당선?" (Yes/No)  -- tokenId: 12347/12348
  └── Market C: "후보 C가 당선?" (Yes/No)  -- tokenId: 12349/12350
```

### 6.2 라우팅 로직

Polymarket 주문 제출 시, 마켓의 `neg_risk` 플래그에 따라 Exchange 컨트랙트가 분기된다.

```typescript
/**
 * Gamma API neg_risk 플래그 기반 Exchange 컨트랙트 선택.
 * 주문 서명의 EIP-712 도메인 verifyingContract와 USDC approve 대상을 결정한다.
 */
function getExchangeForMarket(market: MarketInfo): {
  exchange: Hex;
  isNegRisk: boolean;
} {
  if (market.negRisk) {
    return {
      exchange: '0xC5d563A36AE78145C45a50134d48A1215220f80a', // Neg Risk CTF Exchange
      isNegRisk: true,
    };
  }
  return {
    exchange: '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E', // CTF Exchange
    isNegRisk: false,
  };
}
```

**라우팅이 영향을 미치는 곳:**

| 항목 | 바이너리 마켓 | Neg Risk 마켓 |
|------|-------------|--------------|
| EIP-712 verifyingContract | CTF Exchange | Neg Risk CTF Exchange |
| USDC approve 대상 | CTF Exchange | Neg Risk CTF Exchange |
| 주문 서명 도메인 | Domain 2 | Domain 3 |
| Redeem 경로 | CTF 직접 | NegRiskAdapter 경유 |
| DB is_neg_risk | 0 | 1 |

### 6.3 USDC Approve 전략

CLOB 주문 제출 전에 USDC.e가 올바른 Exchange 컨트랙트에 approve되어야 한다.

```typescript
// 바이너리 마켓: USDC -> CTF Exchange
await approve(USDC_E_ADDRESS, CTF_EXCHANGE_ADDRESS, amount);

// Neg Risk 마켓: USDC -> Neg Risk CTF Exchange
await approve(USDC_E_ADDRESS, NEG_RISK_CTF_EXCHANGE_ADDRESS, amount);
```

> **설계 결정 DS-04**: `polymarket_auto_approve_ctf` Admin Setting이 true(기본값)이면, 첫 주문 시 자동으로 무한 approve(`type(uint256).max`)를 실행한다. 이는 Hyperliquid가 USDB approve를 자동 처리하는 것과 동일한 DX 패턴이다.

### 6.4 Redeem 경로

마켓 해결 후 승리 토큰을 USDC로 교환하는 redeem 플로우는 마켓 유형에 따라 다르다.

**바이너리 마켓 Redeem:**
```typescript
// Conditional Tokens 컨트랙트 직접 호출
const request: ContractCallRequest = {
  type: 'CONTRACT_CALL',
  to: CONDITIONAL_TOKENS_ADDRESS, // 0x4D97...6045
  data: encodeFunctionData({
    abi: conditionalTokensAbi,
    functionName: 'redeemPositions',
    args: [USDC_E_ADDRESS, PARENT_COLLECTION_ID, conditionId, indexSets],
  }),
  value: '0',
};
```

**Neg Risk 마켓 Redeem:**
```typescript
// NegRiskAdapter 경유
const request: ContractCallRequest = {
  type: 'CONTRACT_CALL',
  to: NEG_RISK_ADAPTER_ADDRESS, // 0xd91E...5296
  data: encodeFunctionData({
    abi: negRiskAdapterAbi,
    functionName: 'redeemPositions',
    args: [conditionId, indexSets],
  }),
  value: '0',
};
```

### 6.5 마켓 유형 감지

Gamma API의 마켓 응답에 `neg_risk` 필드가 포함된다.

```json
{
  "id": "0x1234...abcd",
  "question": "Who will win the 2024 US Presidential Election?",
  "neg_risk": true,
  "tokens": [
    { "token_id": "12345", "outcome": "Candidate A" },
    { "token_id": "12347", "outcome": "Candidate B" },
    { "token_id": "12349", "outcome": "Candidate C" }
  ]
}
```

PolymarketMarketData 서비스가 이 플래그를 캐시하고, PolymarketOrderProvider가 주문 시점에 참조하여 올바른 Exchange 컨트랙트와 EIP-712 도메인을 선택한다.

---

## 7. 듀얼 프로바이더 아키텍처

> **설계 결정 DS-05**: 단일 프로바이더가 아닌 듀얼 프로바이더(Order + CTF)를 사용한다. CLOB 주문은 `requiresSigningKey: true` + ApiDirectResult를 반환하고, CTF 온체인 오퍼레이션은 `requiresSigningKey: false` + ContractCallRequest를 반환한다. 하나의 프로바이더에서 두 가지 반환 타입을 혼합하면 requiresSigningKey 의미론이 모호해진다.

### 7.1 Provider 1: PolymarketOrderProvider (CLOB, off-chain)

**Phase 371에서 구현.**

```typescript
export class PolymarketOrderProvider implements IActionProvider {
  readonly metadata: ActionProviderMetadata = {
    name: 'polymarket_order',
    description: 'Polymarket prediction market CLOB trading',
    version: '1.0.0',
    chains: ['ethereum'], // Polygon is ethereum-type
    mcpExpose: true,
    requiresApiKey: false,
    requiredApis: [],
    requiresSigningKey: true, // EIP-712 Order 서명에 private key 필요
  };

  readonly actions: readonly ActionDefinition[] = [
    {
      name: 'pm_buy',
      description: 'Buy outcome tokens on Polymarket',
      riskLevel: 'high',
      defaultTier: 'APPROVAL',
      inputSchema: PmBuySchema,
    },
    {
      name: 'pm_sell',
      description: 'Sell outcome tokens on Polymarket',
      riskLevel: 'medium',
      defaultTier: 'DELAY',
      inputSchema: PmSellSchema,
    },
    {
      name: 'pm_cancel_order',
      description: 'Cancel an active Polymarket order',
      riskLevel: 'low',
      defaultTier: 'INSTANT',
      inputSchema: PmCancelOrderSchema,
    },
    {
      name: 'pm_cancel_all',
      description: 'Cancel all active Polymarket orders',
      riskLevel: 'low',
      defaultTier: 'INSTANT',
      inputSchema: PmCancelAllSchema,
    },
    {
      name: 'pm_update_order',
      description: 'Update price/size of an active order',
      riskLevel: 'medium',
      defaultTier: 'DELAY',
      inputSchema: PmUpdateOrderSchema,
    },
  ];

  constructor(
    private readonly clobClient: PolymarketClobClient,
    private readonly marketData: PolymarketMarketData,
    private readonly db: DB,
  ) {}

  async resolve(
    actionName: string,
    params: unknown,
    context: ActionContext,
  ): Promise<ApiDirectResult> {
    // 1. MarketData에서 neg_risk 플래그 조회
    // 2. ensureApiKeys() — lazy creation
    // 3. OrderBuilder로 Order struct 생성
    // 4. PolymarketSigner.signOrder() — EIP-712
    // 5. ClobClient.postOrder() — HMAC L2 인증
    // 6. DB INSERT polymarket_orders
    // 7. return { __apiDirect: true, externalId, status, provider }
  }

  async getSpendingAmount(
    actionName: string,
    params: unknown,
  ): Promise<{ amount: bigint; asset: string }> {
    switch (actionName) {
      case 'pm_buy':
        // size * price, USDC.e 6 decimals
        return { amount: calculateBuyAmount(params), asset: USDC_E_ADDRESS };
      case 'pm_sell':
      case 'pm_cancel_order':
      case 'pm_cancel_all':
        return { amount: 0n, asset: USDC_E_ADDRESS };
      case 'pm_update_order':
        // delta(size * price) if increasing
        return { amount: calculateUpdateDelta(params), asset: USDC_E_ADDRESS };
      default:
        return { amount: 0n, asset: USDC_E_ADDRESS };
    }
  }
}
```

**Zod 입력 스키마 설계:**

```typescript
// pm_buy
const PmBuySchema = z.object({
  tokenId: z.string().describe('CTF ERC-1155 token ID'),
  price: z.string().describe('Limit price (0-1 range, e.g., "0.65")'),
  size: z.string().describe('Number of outcome tokens to buy'),
  orderType: z.enum(['GTC', 'GTD', 'FOK', 'IOC']).default('GTC'),
  expiration: z.number().optional().describe('Unix timestamp for GTD orders'),
});

// pm_sell
const PmSellSchema = z.object({
  tokenId: z.string(),
  price: z.string(),
  size: z.string(),
  orderType: z.enum(['GTC', 'GTD', 'FOK', 'IOC']).default('GTC'),
  expiration: z.number().optional(),
});

// pm_cancel_order
const PmCancelOrderSchema = z.object({
  orderId: z.string().describe('CLOB-assigned order ID'),
});

// pm_cancel_all
const PmCancelAllSchema = z.object({
  conditionId: z.string().optional().describe('Filter by market (optional)'),
});

// pm_update_order
const PmUpdateOrderSchema = z.object({
  orderId: z.string(),
  price: z.string().optional(),
  size: z.string().optional(),
});
```

### 7.2 Provider 2: PolymarketCtfProvider (CTF, on-chain)

**Phase 372에서 구현.**

```typescript
export class PolymarketCtfProvider implements IActionProvider {
  readonly metadata: ActionProviderMetadata = {
    name: 'polymarket_ctf',
    description: 'Polymarket CTF on-chain operations',
    version: '1.0.0',
    chains: ['ethereum'],
    mcpExpose: true,
    requiresApiKey: false,
    requiredApis: [],
    requiresSigningKey: false, // 표준 온체인 트랜잭션
  };

  readonly actions: readonly ActionDefinition[] = [
    {
      name: 'pm_split_position',
      description: 'Split USDC collateral into outcome tokens',
      riskLevel: 'medium',
      defaultTier: 'DELAY',
      inputSchema: PmSplitSchema,
    },
    {
      name: 'pm_merge_positions',
      description: 'Merge outcome tokens back to USDC collateral',
      riskLevel: 'medium',
      defaultTier: 'DELAY',
      inputSchema: PmMergeSchema,
    },
    {
      name: 'pm_redeem_positions',
      description: 'Redeem winning tokens after market resolution',
      riskLevel: 'low',
      defaultTier: 'INSTANT',
      inputSchema: PmRedeemSchema,
    },
    {
      name: 'pm_approve_collateral',
      description: 'Approve USDC.e spending for CTF Exchange',
      riskLevel: 'low',
      defaultTier: 'INSTANT',
      inputSchema: PmApproveCollateralSchema,
    },
    {
      name: 'pm_approve_ctf',
      description: 'Approve CTF tokens for Exchange contract',
      riskLevel: 'low',
      defaultTier: 'INSTANT',
      inputSchema: PmApproveCtfSchema,
    },
  ];

  async resolve(
    actionName: string,
    params: unknown,
    context: ActionContext,
  ): Promise<ContractCallRequest | ContractCallRequest[]> {
    // 각 action별 ABI 인코딩 -> ContractCallRequest 반환
    // 표준 6-stage 파이프라인에서 Polygon에 제출
  }
}
```

**CTF ABI 최소 정의:**

```typescript
const CONDITIONAL_TOKENS_ABI = [
  'function balanceOf(address owner, uint256 id) view returns (uint256)',
  'function balanceOfBatch(address[] owners, uint256[] ids) view returns (uint256[])',
  'function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets)',
  'function splitPosition(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] partition, uint256 amount)',
  'function mergePositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] partition, uint256 amount)',
] as const;
```

### 7.3 Infrastructure Factory

```typescript
/**
 * createPolymarketInfrastructure: Hyperliquid의 createHyperliquidInfrastructure 패턴.
 * 모든 Polymarket 의존성을 단일 팩토리에서 생성.
 *
 * Phase 371에서 구현.
 */
export function createPolymarketInfrastructure(config: PolymarketConfig, db: DB) {
  const rateLimiter = new PolymarketRateLimiter(config.rateLimit);
  const clobClient = new PolymarketClobClient(config.clobApiUrl, rateLimiter);
  const gammaClient = new PolymarketGammaClient(config.gammaApiUrl);
  const marketData = new PolymarketMarketData(gammaClient, clobClient);

  const orderProvider = new PolymarketOrderProvider(clobClient, marketData, db);
  const ctfProvider = new PolymarketCtfProvider(config.contracts);

  return {
    clobClient,
    gammaClient,
    marketData,
    orderProvider,
    ctfProvider,
    rateLimiter,
  };
}
```

### 7.4 레지스트리 등록

```typescript
// daemon startup, 기존 Hyperliquid 등록과 동일 패턴
if (settings.get('actions.polymarket_enabled')) {
  const pm = createPolymarketInfrastructure(polymarketConfig, db);
  registry.register(pm.orderProvider);
  registry.register(pm.ctfProvider);
}
```

---

## 8. DB 마이그레이션 (v53-v54)

> **설계 결정 DS-06**: hyperliquid_orders 테이블 구조를 기반으로 polymarket_orders를 설계한다. 추가적으로 Polymarket 고유의 condition_id, token_id, outcome, is_neg_risk 컬럼을 포함한다.

**Phase 371에서 구현.**

### 8.1 v53: polymarket_orders 테이블 (Table 27)

```sql
CREATE TABLE polymarket_orders (
  id TEXT PRIMARY KEY,                              -- UUID v7
  wallet_id TEXT NOT NULL REFERENCES wallets(id),
  transaction_id TEXT REFERENCES transactions(id),  -- 6-stage pipeline TX (nullable for CLOB-only)
  -- Market identification
  condition_id TEXT NOT NULL,                       -- Gnosis condition ID (bytes32 hex)
  token_id TEXT NOT NULL,                           -- CTF ERC-1155 token ID (uint256)
  market_slug TEXT,                                 -- Human-readable slug
  outcome TEXT NOT NULL,                            -- 'YES' | 'NO' (or named outcome)
  -- Order details
  order_id TEXT,                                    -- CLOB-assigned order ID
  side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
  order_type TEXT NOT NULL CHECK (order_type IN ('GTC', 'GTD', 'FOK', 'IOC')),
  price TEXT NOT NULL,                              -- Decimal 0-1 range
  size TEXT NOT NULL,                               -- Number of shares
  -- Execution state
  status TEXT NOT NULL CHECK (status IN (
    'PENDING', 'LIVE', 'MATCHED', 'PARTIALLY_FILLED', 'CANCELLED', 'EXPIRED'
  )),
  filled_size TEXT,                                 -- Cumulative filled
  avg_fill_price TEXT,                              -- Average fill price
  -- Signing metadata
  salt TEXT,                                        -- EIP-712 order salt
  maker_amount TEXT,                                -- Raw uint256
  taker_amount TEXT,                                -- Raw uint256
  signature_type INTEGER NOT NULL DEFAULT 0,        -- 0=EOA, 1=POLY_PROXY
  fee_rate_bps INTEGER,                             -- Basis points
  expiration INTEGER,                               -- Unix timestamp (0=no expiry)
  nonce TEXT,                                       -- Order nonce
  -- Market metadata
  is_neg_risk INTEGER NOT NULL DEFAULT 0,
  -- Raw response
  response_data TEXT,                               -- JSON blob from CLOB API
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Indexes
CREATE INDEX idx_pm_orders_wallet ON polymarket_orders(wallet_id);
CREATE INDEX idx_pm_orders_order_id ON polymarket_orders(order_id);
CREATE INDEX idx_pm_orders_condition ON polymarket_orders(condition_id);
CREATE INDEX idx_pm_orders_status ON polymarket_orders(status);
CREATE INDEX idx_pm_orders_created ON polymarket_orders(created_at);
```

### 8.2 v54: polymarket_positions + polymarket_api_keys 테이블 (Tables 28-29)

**polymarket_positions (Table 28):**

```sql
CREATE TABLE polymarket_positions (
  id TEXT PRIMARY KEY,                              -- UUID v7
  wallet_id TEXT NOT NULL REFERENCES wallets(id),
  -- Market identification
  condition_id TEXT NOT NULL,
  token_id TEXT NOT NULL,
  market_slug TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('YES', 'NO')),
  -- Position data
  size TEXT NOT NULL DEFAULT '0',                   -- Current token balance
  avg_price TEXT,                                   -- Average entry price
  realized_pnl TEXT DEFAULT '0',                    -- Closed position P&L
  -- Market state
  market_resolved INTEGER NOT NULL DEFAULT 0,
  winning_outcome TEXT,                             -- Set after resolution
  -- Metadata
  is_neg_risk INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(wallet_id, token_id)
);

CREATE INDEX idx_pm_positions_wallet ON polymarket_positions(wallet_id);
CREATE INDEX idx_pm_positions_condition ON polymarket_positions(condition_id);
CREATE INDEX idx_pm_positions_resolved ON polymarket_positions(market_resolved);
```

**polymarket_api_keys (Table 29):**

```sql
CREATE TABLE polymarket_api_keys (
  id TEXT PRIMARY KEY,                              -- UUID v7
  wallet_id TEXT NOT NULL REFERENCES wallets(id),
  api_key TEXT NOT NULL,                            -- CLOB API Key (plaintext, non-secret)
  api_secret_encrypted TEXT NOT NULL,               -- Encrypted with master password
  api_passphrase_encrypted TEXT NOT NULL,            -- Encrypted with master password
  signature_type INTEGER NOT NULL DEFAULT 0,        -- 0=EOA, 1=POLY_PROXY
  proxy_address TEXT,                               -- Proxy wallet address (if type 1)
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(wallet_id)
);
```

### 8.3 Drizzle 스키마 위치

```
packages/daemon/src/db/schema/
  ├── polymarket-orders.ts    -- polymarket_orders 테이블
  ├── polymarket-positions.ts -- polymarket_positions 테이블
  └── polymarket-api-keys.ts  -- polymarket_api_keys 테이블
```

### 8.4 schema_version 업데이트

```sql
-- v53
INSERT INTO schema_version (version, description, applied_at)
VALUES (53, 'Add polymarket_orders table', unixepoch());

-- v54
INSERT INTO schema_version (version, description, applied_at)
VALUES (54, 'Add polymarket_positions and polymarket_api_keys tables', unixepoch());
```

---

## 9. REST API + MCP + SDK

**Phase 373에서 구현.**

### 9.1 REST 쿼리 라우트 (9개)

| Method | Path | 인증 | 용도 |
|--------|------|------|------|
| GET | `/v1/wallets/:walletId/polymarket/positions` | sessionAuth | 현재 포지션 |
| GET | `/v1/wallets/:walletId/polymarket/orders` | sessionAuth | 활성/최근 주문 |
| GET | `/v1/wallets/:walletId/polymarket/orders/:orderId` | sessionAuth | 주문 상세 |
| GET | `/v1/polymarket/markets` | sessionAuth | 마켓 목록 (필터/페이징) |
| GET | `/v1/polymarket/markets/:conditionId` | sessionAuth | 마켓 상세 + 가격 |
| GET | `/v1/polymarket/events` | sessionAuth | 이벤트 카테고리 |
| GET | `/v1/wallets/:walletId/polymarket/balance` | sessionAuth | USDC.e + 토큰 잔액 |
| GET | `/v1/wallets/:walletId/polymarket/pnl` | sessionAuth | P&L 요약 |
| POST | `/v1/wallets/:walletId/polymarket/setup` | sessionAuth | API Key 생성 + 선택적 approve |

Action 엔드포인트는 기존 패턴으로 자동 등록:
- `/v1/actions/polymarket_order/:action` (pm_buy, pm_sell, pm_cancel_order, pm_cancel_all, pm_update_order)
- `/v1/actions/polymarket_ctf/:action` (pm_split_position, pm_merge_positions, pm_redeem_positions, pm_approve_collateral, pm_approve_ctf)

### 9.2 MCP 도구 (18개)

**Auto-registered action tools (10개, `mcpExpose: true`):**

| 도구 이름 | Action | Provider |
|-----------|--------|----------|
| `waiaas_pm_buy` | pm_buy | polymarket_order |
| `waiaas_pm_sell` | pm_sell | polymarket_order |
| `waiaas_pm_cancel_order` | pm_cancel_order | polymarket_order |
| `waiaas_pm_cancel_all` | pm_cancel_all | polymarket_order |
| `waiaas_pm_update_order` | pm_update_order | polymarket_order |
| `waiaas_pm_split_position` | pm_split_position | polymarket_ctf |
| `waiaas_pm_merge_positions` | pm_merge_positions | polymarket_ctf |
| `waiaas_pm_redeem_positions` | pm_redeem_positions | polymarket_ctf |
| `waiaas_pm_approve_collateral` | pm_approve_collateral | polymarket_ctf |
| `waiaas_pm_approve_ctf` | pm_approve_ctf | polymarket_ctf |

**Manually registered query tools (8개):**

| 도구 이름 | REST Route | 설명 |
|-----------|-----------|------|
| `waiaas_pm_get_positions` | GET /wallets/:id/polymarket/positions | 현재 포지션 |
| `waiaas_pm_get_orders` | GET /wallets/:id/polymarket/orders | 활성 주문 |
| `waiaas_pm_get_markets` | GET /polymarket/markets | 마켓 탐색 |
| `waiaas_pm_get_market_detail` | GET /polymarket/markets/:id | 마켓 상세 |
| `waiaas_pm_get_events` | GET /polymarket/events | 이벤트 카테고리 |
| `waiaas_pm_get_balance` | GET /wallets/:id/polymarket/balance | 잔액 |
| `waiaas_pm_get_pnl` | GET /wallets/:id/polymarket/pnl | P&L |
| `waiaas_pm_setup` | POST /wallets/:id/polymarket/setup | API Key 설정 |

### 9.3 SDK: PolymarketClient

**TypeScript SDK (Phase 373):**

```typescript
class PolymarketClient {
  // CLOB 주문
  async buy(walletId: string, params: PmBuyParams): Promise<ActionResult>;
  async sell(walletId: string, params: PmSellParams): Promise<ActionResult>;
  async cancelOrder(walletId: string, orderId: string): Promise<ActionResult>;
  async cancelAll(walletId: string, conditionId?: string): Promise<ActionResult>;
  async updateOrder(walletId: string, params: PmUpdateParams): Promise<ActionResult>;

  // CTF 온체인
  async splitPosition(walletId: string, params: PmSplitParams): Promise<ActionResult>;
  async mergePositions(walletId: string, params: PmMergeParams): Promise<ActionResult>;
  async redeemPositions(walletId: string, params: PmRedeemParams): Promise<ActionResult>;

  // 조회
  async getPositions(walletId: string): Promise<PolymarketPosition[]>;
  async getOrders(walletId: string): Promise<PolymarketOrder[]>;
  async getMarkets(params?: MarketFilter): Promise<PolymarketMarket[]>;
  async getMarketDetail(conditionId: string): Promise<PolymarketMarketDetail>;
  async getBalance(walletId: string): Promise<PolymarketBalance>;
  async getPnl(walletId: string): Promise<PolymarketPnl>;

  // 설정
  async setup(walletId: string): Promise<SetupResult>;
}
```

**Python SDK (Phase 373):** 동일한 메서드를 `polymarket` 네임스페이스로 노출.

### 9.4 connect-info 확장

```typescript
// connect-info response에 polymarket capability 추가
{
  capabilities: {
    // ... 기존 capabilities
    polymarket: settings.get('actions.polymarket_enabled') ?? false,
  }
}
```

---

## 10. Admin UI + Admin Settings

**Phase 373에서 구현.**

### 10.1 Admin Settings (7개 키)

| 키 | 타입 | 기본값 | 설명 |
|----|------|--------|------|
| `actions.polymarket_enabled` | boolean | false | Polymarket 통합 활성화 |
| `actions.polymarket_default_fee_bps` | number | 0 | 기본 수수료 (basis points) |
| `actions.polymarket_order_expiry_seconds` | number | 86400 | 기본 주문 TTL (24시간) |
| `actions.polymarket_max_position_usdc` | number | 1000 | 최대 포지션 크기 (USDC) |
| `actions.polymarket_proxy_wallet` | boolean | false | Proxy wallet 사용 여부 |
| `actions.polymarket_neg_risk_enabled` | boolean | true | 멀티 아웃컴 마켓 허용 |
| `actions.polymarket_auto_approve_ctf` | boolean | true | 자동 USDC approve 실행 |

### 10.2 Admin UI Polymarket 페이지

경로: `/polymarket` (Hyperliquid `/hyperliquid` 페이지와 동일 수준)

**5탭 구조:**

| 탭 | 내용 | 데이터 소스 |
|----|------|------------|
| **Overview** | 활성 포지션 수, 총 P&L, USDC.e 잔액, 최근 주문 | positions + pnl + balance API |
| **Markets** | 마켓 탐색/검색, 가격, 거래량, 카테고리 필터 | Gamma API via REST |
| **Orders** | 활성 주문, 주문 내역, 취소 버튼 | polymarket_orders DB |
| **Positions** | 아웃컴 토큰 보유, 미실현 P&L, Redeem 버튼 | polymarket_positions DB |
| **Settings** | API Key 상태, Polymarket 설정 7개 | Admin Settings API |

**UI 기술 스택:** Preact 10.x + @preact/signals + Vite 6.x (기존 Admin UI와 동일)

**컴포넌트 구조:**
```
packages/admin/src/pages/polymarket/
  ├── PolymarketPage.tsx        -- 5탭 라우터
  ├── PolymarketOverview.tsx    -- Overview 탭
  ├── PolymarketMarkets.tsx     -- Markets 탭
  ├── PolymarketOrders.tsx      -- Orders 탭
  ├── PolymarketPositions.tsx   -- Positions 탭
  └── PolymarketSettings.tsx    -- Settings 탭
```

---

## 11. 정책 엔진 연동

**Phase 373에서 구현.**

### 11.1 Action별 정책 평가 매핑

| Action | Spending Amount | Asset | 평가 범위 | 기본 Tier |
|--------|----------------|-------|----------|----------|
| `pm_buy` | `size * price` (USDC.e 6d) | USDC.e | Full: tier + spending limit | APPROVAL |
| `pm_sell` | `0` | USDC.e | Tier only | DELAY |
| `pm_cancel_order` | `0` | USDC.e | Tier only | INSTANT |
| `pm_cancel_all` | `0` | USDC.e | Tier only | INSTANT |
| `pm_update_order` | `delta(size * price)` if 증가 | USDC.e | Full if 증가, Tier if 감소 | DELAY |
| `pm_split_position` | `amount` | USDC.e | Full: locks collateral | DELAY |
| `pm_merge_positions` | `0` | USDC.e | Tier only | DELAY |
| `pm_redeem_positions` | `0` | USDC.e | Tier only | INSTANT |
| `pm_approve_collateral` | `0` | USDC.e | Tier only | INSTANT |
| `pm_approve_ctf` | `0` | USDC.e | Tier only | INSTANT |

### 11.2 네트워크 검증

Polymarket은 Polygon 전용이다. 정책 엔진의 `ALLOWED_NETWORKS` 검증에서:

```typescript
// Polymarket action 실행 시 wallet의 네트워크가 polygon-mainnet인지 검증
// PolymarketOrderProvider.resolve() 내부에서:
if (context.wallet.networkId !== 'polygon-mainnet') {
  throw new ChainError('INVALID_NETWORK', 'POLYMARKET', {
    message: 'Polymarket requires Polygon mainnet',
  });
}
```

### 11.3 지출 한도 적용

- `pm_buy`: `size * price`를 USDC.e 6 decimals로 변환하여 SPENDING_LIMIT에 적용
- `pm_split_position`: `amount`를 USDC.e 6 decimals로 SPENDING_LIMIT에 적용
- `pm_update_order`: 기존 주문 대비 증가분만 SPENDING_LIMIT에 적용

---

## 12. 테스트 전략 + 알려진 위험

**Phase 374에서 구현 (테스트 시나리오). 단위/통합 테스트는 Phase 371-373에서 함께 작성.**

### 12.1 단위 테스트

| 대상 | 테스트 항목 | Phase |
|------|-----------|-------|
| **PolymarketSigner** | EIP-712 Order 서명 검증 (3개 도메인별) | 371 |
| **PolymarketSigner** | ClobAuth 서명 검증 | 371 |
| **PolymarketSigner** | HMAC 헤더 생성 + 검증 | 371 |
| **OrderBuilder** | 가격/수량 -> makerAmount/takerAmount 변환 | 371 |
| **OrderBuilder** | salt 생성 (유니크, 랜덤) | 371 |
| **PolymarketRateLimiter** | 윈도우 기반 제한 + 대기 | 371 |
| **getExchangeForMarket** | neg_risk 플래그 기반 라우팅 | 371 |
| **PolymarketMarketData** | 캐시 TTL 만료 + 갱신 | 372 |
| **PnL 계산** | 실현/미실현 P&L 정확도 | 372 |

### 12.2 통합 테스트

| 대상 | 테스트 항목 | Phase |
|------|-----------|-------|
| **CLOB 주문 라이프사이클** | mock CLOB API: 주문 생성 -> 체결 -> DB 업데이트 | 371 |
| **CTF CONTRACT_CALL** | splitPosition/mergePositions/redeemPositions 파이프라인 | 372 |
| **API Key 라이프사이클** | lazy creation, 암호화 저장, 조회, 삭제 | 371 |
| **Neg Risk 라우팅** | 바이너리 vs Neg Risk 자동 분기 | 371 |
| **정책 엔진 연동** | SPENDING_LIMIT 적용, Tier 검증 | 373 |

### 12.3 E2E 스모크 (Phase 374)

- 오프체인 CLOB mock 기반 시나리오 (`@waiaas/e2e-tests`)
- CI에 등록하여 자동 실행
- 시나리오: API Key 생성 -> 주문 제출 -> 주문 조회 -> 취소 -> 포지션 확인

### 12.4 Agent UAT (Phase 374)

- 6-section 포맷, DeFi 카테고리
- 메인넷 $1-5 규모 시나리오
- 시나리오: 마켓 검색 -> 매수 -> 매도 -> P&L 확인 -> 리딤

### 12.5 알려진 위험

| 위험 | 영향 | 완화 전략 |
|------|------|----------|
| **Polymarket 공개 테스트넷 CLOB 없음** | CLOB 주문 통합 테스트를 실제 API로 실행 불가 | mock CLOB API 기반 테스트. 메인넷 UAT에서 $1-5 규모로 검증 |
| **EOA signatureType=0 CLOB 수락 여부** | EOA 서명이 거부되면 Proxy Wallet 구현 필요 | 첫 메인넷 스모크 테스트에서 검증. 거부 시 signatureType=1 구현 |
| **CLOB rate limit 공식 문서 미공개** | 과도한 요청 시 IP 차단 가능 | 보수적 기본값(10 req/s) + Admin Settings 조정 가능 |
| **Gamma API 가용성** | 마켓 데이터 조회 실패 시 주문 불가 (neg_risk 판단 불가) | 캐시(30s TTL), 실패 시 최근 캐시 반환, 에러 메시지 명확화 |
| **USDC.e vs USDC** | Polygon의 USDC.e(bridged)와 USDC(native) 혼동 | Polymarket은 USDC.e(`0x2791...84174`) 전용. 코드에 주소 하드코딩 |

---

## 부록 A: 컨트랙트 주소 요약

```typescript
// packages/actions/src/providers/polymarket/config.ts

export const PM_CONTRACTS = {
  /** Gnosis Conditional Tokens (ERC-1155) */
  CONDITIONAL_TOKENS: '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045',
  /** CTF Exchange (binary markets) */
  CTF_EXCHANGE: '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E',
  /** Neg Risk CTF Exchange (multi-outcome markets) */
  NEG_RISK_CTF_EXCHANGE: '0xC5d563A36AE78145C45a50134d48A1215220f80a',
  /** Neg Risk Adapter */
  NEG_RISK_ADAPTER: '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296',
  /** USDC.e Collateral (6 decimals) */
  USDC_E: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  /** UMA Oracle Adapter */
  UMA_ADAPTER: '0x6A9D222616C90FcA5754cd1333cFD9b7fb6a4F74',
} as const;

export const PM_API_URLS = {
  CLOB: 'https://clob.polymarket.com',
  GAMMA: 'https://gamma-api.polymarket.com',
  DATA: 'https://data-api.polymarket.com',
} as const;
```

## 부록 B: 설계 결정 요약

| ID | 결정 | 근거 |
|----|------|------|
| DS-01 | 직접 struct 서명 (phantom agent 불필요) | Polymarket은 Order struct를 직접 서명. Hyperliquid와 다름 |
| DS-02 | signatureType=0 (EOA) 기본 | 프로그래밍 API 접근에서 Proxy Wallet 불필요 |
| DS-03 | 코드 레벨 공유 추상화 없음 | 서명/인증/API 체계가 근본적으로 다름 |
| DS-04 | 자동 USDC approve (type(uint256).max) | DX 우선. Admin Setting으로 비활성화 가능 |
| DS-05 | 듀얼 프로바이더 (Order + CTF) | requiresSigningKey 의미론 분리 |
| DS-06 | hyperliquid_orders 기반 DB 스키마 | 검증된 패턴 재사용 + Polymarket 고유 컬럼 추가 |

## 부록 C: Phase 매핑 요약

| 절 | 내용 | 구현 Phase |
|----|------|-----------|
| 1-6 | 아키텍처, CLOB, EIP-712, Hyperliquid 비교, Neg Risk | Phase 370 (본 문서) |
| 7 | 듀얼 프로바이더 | Phase 371-372 |
| 8 | DB 마이그레이션 | Phase 371 |
| 9 | REST API, MCP, SDK | Phase 373 |
| 10 | Admin UI, Admin Settings | Phase 373 |
| 11 | 정책 엔진 | Phase 373 |
| 12 | 테스트 전략 | Phase 371-374 |

---

*설계 문서 80 작성: 2026-03-11*
*기반 리서치: m32-polymarket-ARCHITECTURE.md, m31-09-polymarket-STACK.md*
*선례: doc 78 (Hyperliquid), doc 79 (Across Protocol)*
