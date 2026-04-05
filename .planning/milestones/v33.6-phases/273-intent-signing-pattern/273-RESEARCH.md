# Phase 273: Intent 서명 패턴 설계 - Research

**Researched:** 2026-02-26
**Domain:** Intent-based trading (EIP-712 typed data signing + solver execution), CoW Protocol order pattern
**Confidence:** HIGH

## Summary

Intent 기반 트레이딩은 기존 WAIaaS의 ContractCallRequest 파이프라인(build -> simulate -> sign -> submit)과 근본적으로 다르다. 사용자가 on-chain 트랜잭션을 직접 제출하는 대신, EIP-712 규격의 구조화된 메시지(주문)에 서명하고 이를 off-chain 주문장(orderbook)에 제출하면, 솔버 네트워크가 최적 실행을 수행한다. 이 패턴의 핵심은: (1) 서명 대상이 트랜잭션이 아닌 EIP-712 typed data, (2) 제출 대상이 블록체인이 아닌 off-chain API, (3) 실행 주체가 사용자 월렛이 아닌 솔버, (4) 가스비가 솔버 부담(gasless)이라는 점이다.

WAIaaS 아키텍처에서 이를 수용하려면 IActionProvider의 resolve() 반환 타입을 확장하여 ContractCallRequest와 별도로 SignableOrder를 반환할 수 있게 하고, IChainAdapter에 signTypedData() 메서드를 추가하며, 주문 상태를 AsyncPollingService 인프라를 활용해 추적하는 설계가 필요하다. viem 2.45.3은 로컬 계정에서 signTypedData()를 네이티브 지원하므로 외부 의존성 추가 없이 구현 가능하다.

**Primary recommendation:** IActionProvider.resolve()의 반환 타입을 `ContractCallRequest | SignableOrder`의 discriminatedUnion으로 확장하되, 기존 ContractCallRequest 파이프라인은 변경하지 않고, intent 전용 분기 파이프라인(EIP-712 서명 -> API 제출 -> 상태 폴링)을 설계하라.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INTENT-01 | SignableOrder Zod 타입이 정의된다 | CoW Protocol GPv2Order.Data 12-field 구조 확인, EIP-712 domain 파라미터(name, version, chainId, verifyingContract) 확인. Zod SSoT 패턴으로 SignableOrder 정의 가능 |
| INTENT-02 | ActionProviderRegistry가 intent 타입을 지원하도록 확장 설계된다 | 현재 resolve()는 ContractCallRequest만 반환. discriminatedUnion 확장으로 `ContractCallRequest \| SignableOrder` 반환, executeResolve()에서 type 필드 기반 분기 설계 |
| INTENT-03 | EIP-712 서명 파이프라인(signTypedData)이 설계된다 | viem 2.45.3의 signTypedData() (로컬 계정, privateKey: Hex) 확인. IChainAdapter 확장 또는 독립 함수로 설계 가능. 기존 sign-only 파이프라인과 관계: sign-only는 raw tx 서명, intent는 typed data 서명으로 별개 경로 |
| INTENT-04 | 주문 상태 추적 폴링이 설계된다 | CoW Protocol orderbook API (`GET /api/v1/orders/{UID}`) 확인, 5개 상태(presignaturePending, open, fulfilled, cancelled, expired). 기존 IAsyncStatusTracker + AsyncPollingService 인프라 재사용 가능 |
| INTENT-05 | 기존 ContractCallRequest 파이프라인과의 분기점이 정의된다 | 분기점: ActionProviderRegistry.executeResolve() 반환값의 type 필드. ContractCallRequest -> 기존 6-stage pipeline, SignableOrder -> intent pipeline (sign typed data -> API submit -> poll). actions.ts 라우트에서 분기 |
| INTENT-06 | Intent 보안 설계가 정의된다 | EIP-712 domain separator(chainId + verifyingContract) + nonce + validTo(deadline) 4중 바인딩으로 리플레이/크로스체인 공격 방지. 서버 사이드 deadline 검증(최대 5분 = 300초), verifyingContract 화이트리스트 |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| viem | 2.45.3 | EIP-712 signTypedData(), hashTypedData() | 이미 프로젝트 의존성. privateKeyToAccount().signTypedData() 네이티브 지원. 별도 EIP-712 라이브러리 불필요 |
| zod | 3.25.x | SignableOrder Zod 스키마 정의 (SSoT) | 프로젝트 Zod SSoT 규칙 준수. TransactionRequestSchema과 동일 패턴 |
| @waiaas/core | current | SignableOrder 타입 + IChainAdapter 확장 타입 export | 모든 공유 타입은 core 패키지에서 정의 |
| @waiaas/actions | current | IAsyncStatusTracker 인프라 재사용 (IntentOrderTracker) | AsyncPollingService 패턴은 LI.FI bridge, Lido withdrawal, Jito epoch에서 검증됨 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| abitype | (viem 내장) | TypedData 타입 정의 | viem의 signTypedData 파라미터 타입에 사용 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| viem signTypedData | @metamask/eth-sig-util | viem이 이미 설치되어 있고 타입 안전성이 더 우수. eth-sig-util은 별도 의존성 추가 필요 |
| IAsyncStatusTracker 재사용 | WebSocket 주문 상태 구독 | CoW Protocol은 REST polling만 제공, WebSocket API 없음. 기존 인프라 재사용이 합리적 |
| ActionProviderRegistry 확장 | 별도 IntentRegistry | 기존 패턴 일관성 유지를 위해 Registry 확장이 바람직. 새 레지스트리는 학습 비용 증가 |

**Installation:**
```bash
# 추가 패키지 없음 -- viem 2.45.3, zod 3.25.x 이미 설치
```

## Architecture Patterns

### Recommended Design Structure (m29-00 설계 문서 확장)

이 Phase는 설계 문서 작성이므로 코드 파일 생성 없이 m29-00 설계 문서에 섹션 24-26을 추가한다.

```
m29-00-defi-advanced-protocol-design.md
├── 섹션 24: SignableOrder 타입 + ActionProviderRegistry 확장 설계
│   ├── 24.1: SignableOrder Zod 스키마
│   ├── 24.2: EIP-712 도메인 + 타입 정의
│   ├── 24.3: ActionProviderRegistry 확장 설계
│   └── 24.4: 설계 결정
├── 섹션 25: EIP-712 서명 파이프라인 + 상태 추적 설계
│   ├── 25.1: IChainAdapter signTypedData 확장
│   ├── 25.2: Intent 파이프라인 10-step 설계
│   ├── 25.3: IntentOrderTracker (IAsyncStatusTracker)
│   ├── 25.4: ContractCallRequest 파이프라인 분기점
│   └── 25.5: 설계 결정
└── 섹션 26: Intent 보안 설계
    ├── 26.1: 4중 바인딩 (chainId + verifyingContract + nonce + deadline)
    ├── 26.2: 서버 사이드 검증 규칙
    ├── 26.3: 공격 벡터 분석 + 완화
    └── 26.4: 설계 결정
```

### Pattern 1: SignableOrder discriminatedUnion 확장

**What:** IActionProvider.resolve()가 ContractCallRequest 대신 SignableOrder를 반환하여, EIP-712 서명 경로로 분기하는 패턴
**When to use:** 솔버 기반 intent 프로토콜(CoW Protocol, 1inch Fusion, UniswapX)

```typescript
// SignableOrder Zod 스키마 (Zod SSoT)
const SignableOrderSchema = z.object({
  type: z.literal('INTENT'),   // discriminatedUnion 분기 키
  // EIP-712 domain
  domain: z.object({
    name: z.string(),
    version: z.string(),
    chainId: z.number().int().positive(),
    verifyingContract: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  }),
  // EIP-712 types (protocol-specific)
  types: z.record(z.array(z.object({
    name: z.string(),
    type: z.string(),
  }))),
  primaryType: z.string(),
  // EIP-712 message (the order data)
  message: z.record(z.unknown()),
  // Intent-specific metadata
  intentMetadata: z.object({
    protocol: z.string(),         // 'cow_protocol', '1inch_fusion', etc.
    orderApiUrl: z.string().url(), // API endpoint for order submission
    statusApiUrl: z.string().url(), // API endpoint for status polling
    sellToken: z.string(),
    buyToken: z.string(),
    sellAmount: z.string(),
    buyAmount: z.string(),
    validTo: z.number().int(),     // Unix timestamp (deadline)
    receiver: z.string().optional(),
  }),
});
```

### Pattern 2: Intent Pipeline (sign-only variant)

**What:** 기존 6-stage pipeline과 별도로 동작하는 intent 전용 파이프라인
**When to use:** resolve()가 SignableOrder를 반환한 경우

```
Intent Pipeline (10-step):
1. ActionProviderRegistry.executeResolve() -> SignableOrder 반환
2. SignableOrder Zod 검증 (type='INTENT')
3. 보안 검증 (deadline <= 5분, chainId 일치, verifyingContract 화이트리스트)
4. 정책 평가 (SPENDING_LIMIT: sellAmount, ALLOWED_TOKENS: sellToken/buyToken)
5. UUID v7 생성 + DB INSERT (type='INTENT', status='PENDING')
6. 키 복호화 (LocalKeyStore.decryptPrivateKey)
7. EIP-712 서명 (adapter.signTypedData -> viem signTypedData)
8. 키 해제 (LocalKeyStore.releaseKey)
9. Off-chain API 제출 (orderApiUrl POST)
10. AsyncPollingService 등록 (bridge_status='PENDING', tracker='intent-order')
```

### Pattern 3: IChainAdapter signTypedData 확장

**What:** IChainAdapter에 signTypedData() 메서드를 추가하여 EIP-712 서명 지원
**When to use:** EVM 체인에서 EIP-712 typed data 서명이 필요한 경우

```typescript
// IChainAdapter 확장 (v29 scope: +1 method, total 23)
// chain-adapter.types.ts에 추가
interface TypedDataParams {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: string;
  };
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  message: Record<string, unknown>;
}

interface TypedDataSignature {
  signature: string; // 0x-prefixed hex (r + s + v, 65 bytes)
  signer: string;    // recovered signer address
}

// IChainAdapter에 추가
signTypedData(params: TypedDataParams, privateKey: Uint8Array): Promise<TypedDataSignature>;
// Solana: throw NOT_SUPPORTED (EVM only)
```

### Pattern 4: IntentOrderTracker (AsyncPollingService 재사용)

**What:** CoW Protocol 주문 상태를 IAsyncStatusTracker로 폴링
**When to use:** Intent 주문 제출 후 OPEN -> FULFILLED/EXPIRED 상태 추적

```typescript
// IntentOrderTracker implements IAsyncStatusTracker
// name: 'intent-order'
// pollIntervalMs: 10_000 (10초)
// maxAttempts: 180 (= 30분)
// timeoutTransition: 'TIMEOUT'
//
// checkStatus():
//   1. bridge_metadata에서 statusApiUrl + orderUid 추출
//   2. GET statusApiUrl/{orderUid} 호출
//   3. status 매핑:
//      - 'open' | 'presignaturePending' -> { state: 'PENDING' }
//      - 'fulfilled' -> { state: 'COMPLETED', details: { executedSellAmount, executedBuyAmount } }
//      - 'cancelled' | 'expired' -> { state: 'FAILED', details: { reason: status } }
```

### Anti-Patterns to Avoid

- **Intent를 ContractCallRequest로 변환하려는 시도:** Intent는 on-chain 트랜잭션이 아니다. calldata/value 필드가 없으며, 서명 대상이 다르다. 강제 변환은 보안 검증을 우회할 수 있다.
- **ContractCallRequest 파이프라인에 intent 분기를 삽입:** 기존 6-stage pipeline의 stage5Execute(build -> simulate -> sign -> submit)는 intent와 호환되지 않는다. 별도 파이프라인으로 분리해야 한다.
- **signTypedData를 signExternalTransaction에 통합:** 완전히 다른 서명 대상(raw tx vs typed data)이므로 별도 메서드가 필요하다.
- **deadline 검증 없이 서명:** EIP-712 서명에 deadline이 없거나 무한대이면 리플레이 공격에 취약해진다.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| EIP-712 해싱 | keccak256 + domainSeparator 수동 계산 | viem hashTypedData() | 중첩 구조체 해싱, 배열 타입, 바이트 타입 등 엣지 케이스가 많음 |
| EIP-712 서명 | 수동 secp256k1 서명 | viem signTypedData() | 서명 직렬화(r, s, v) + recovery 처리가 복잡 |
| 주문 상태 폴링 | setInterval + 수동 상태 관리 | AsyncPollingService + IAsyncStatusTracker | 타이밍, maxAttempts, 에러 격리, 타임아웃 전환이 이미 구현됨 |
| UUID v7 생성 | 수동 timestamp + random | generateId() (기존 인프라) | monotonic ordering, 밀리초 정밀도 등 이미 검증됨 |

**Key insight:** EIP-712 서명과 주문 상태 폴링 모두 이미 프로젝트에 존재하는 인프라(viem, AsyncPollingService)로 처리 가능하다. 새로운 외부 의존성 없이 설계 확장만으로 intent 패턴을 수용할 수 있다.

## Common Pitfalls

### Pitfall 1: TransactionType 7-type discriminatedUnion 충돌
**What goes wrong:** 기존 TRANSACTION_TYPES에 'INTENT'를 추가하면 discriminatedUnion 7-type 규칙(TRANSFER/TOKEN_TRANSFER/CONTRACT_CALL/APPROVE/BATCH/SIGN/X402_PAYMENT)과 충돌할 수 있다
**Why it happens:** TransactionRequestSchema(5-type)와 TRANSACTION_TYPES(7-type)는 별개 SSoT이며, TransactionRequestSchema는 API 요청 검증, TRANSACTION_TYPES는 DB type 컬럼용
**How to avoid:** TRANSACTION_TYPES에 'INTENT'를 8번째 값으로 추가하되, TransactionRequestSchema(5-type discriminatedUnion)에는 추가하지 않는다. Intent는 ActionProviderRegistry를 통해서만 진입하므로 외부 API 요청 스키마 변경 불필요
**Warning signs:** TransactionRequestSchema.parse()에서 'INTENT' type이 거부되면 올바른 분리가 된 것

### Pitfall 2: ContractCallRequest 파이프라인 오염
**What goes wrong:** ActionProviderRegistry.executeResolve()가 항상 ContractCallRequest[]를 반환하는데, SignableOrder를 추가하면 기존 호출부가 깨진다
**Why it happens:** 현재 executeResolve()의 반환 타입이 `Promise<ContractCallRequest[]>`로 하드코딩되어 있고, actions.ts 라우트가 이를 전제로 6-stage pipeline에 투입
**How to avoid:** `executeResolve()` 대신 `executeIntentResolve()` 별도 메서드를 추가하거나, 반환 타입을 `Promise<(ContractCallRequest | SignableOrder)[]>`로 확장하고 actions.ts에서 type 필드 기반 분기. 후자가 설계 일관성이 높음
**Warning signs:** 기존 액션(jupiter_swap, zerox_swap 등)의 테스트가 실패하면 반환 타입 변경이 기존 코드에 영향을 준 것

### Pitfall 3: deadline 검증 누락 → 리플레이 공격
**What goes wrong:** EIP-712 서명에 deadline(validTo)이 미래 시간으로 너무 길게 설정되면, 서명이 도난 시 재사용 가능
**Why it happens:** CoW Protocol은 validTo를 사용자가 자유롭게 설정 가능. 보안 검증 없이 서명하면 최악의 경우 수일/수주 후에도 유효한 서명이 생성됨
**How to avoid:** 서버 사이드 deadline 검증: `validTo - now() <= MAX_DEADLINE_SECONDS(300)`. 5분 초과 deadline은 거부
**Warning signs:** Intent 주문의 validTo가 현재 시간 + 300초를 초과하는 경우

### Pitfall 4: signTypedData에서 privateKey 메모리 누출
**What goes wrong:** viem의 signTypedData는 Hex(string) 타입의 privateKey를 요구하는데, Uint8Array -> hex 변환 후 string이 GC까지 메모리에 남음
**Why it happens:** 기존 signExternalTransaction도 동일 패턴(Buffer.from(privateKey).toString('hex'))이므로 새로운 문제는 아니지만, 인식 필요
**How to avoid:** 기존 signExternalTransaction과 동일한 패턴 사용: try/finally에서 keyStore.releaseKey() 보장. 추가 완화는 기존 아키텍처 결정(sodium-native guarded memory)에 의존
**Warning signs:** finally 블록에 releaseKey()가 없는 서명 경로

### Pitfall 5: verifyingContract 검증 누락 → 피싱 서명 유도
**What goes wrong:** 악의적 ActionProvider가 verifyingContract를 피싱 컨트랙트 주소로 설정하면, 월렛이 의도하지 않은 컨트랙트에 대한 서명을 생성
**Why it happens:** EIP-712 domain의 verifyingContract는 서명이 유효한 컨트랙트를 지정. 이를 검증하지 않으면 어떤 컨트랙트든 서명 가능
**How to avoid:** INTENT_VERIFYING_CONTRACT_WHITELIST 정책: 허용된 프로토콜 컨트랙트 주소만 서명 허용. 기존 CONTRACT_WHITELIST와 유사한 default-deny 패턴
**Warning signs:** 알 수 없는 verifyingContract 주소에 대한 서명 요청

## Code Examples

### EIP-712 signTypedData with viem (verified from viem 2.45.3 type definitions)

```typescript
// Source: viem/accounts/utils/signTypedData.d.ts (프로젝트 node_modules 직접 확인)
import { privateKeyToAccount } from 'viem/accounts';
import type { Hex } from 'viem';

// 1. 계정 생성 (기존 EvmAdapter 패턴)
const privateKeyHex = `0x${Buffer.from(privateKey).toString('hex')}` as Hex;
const account = privateKeyToAccount(privateKeyHex);

// 2. EIP-712 서명 (CoW Protocol Order 예시)
const signature = await account.signTypedData({
  domain: {
    name: 'Gnosis Protocol',
    version: 'v2',
    chainId: 1,
    verifyingContract: '0x9008D19f58AAbD9eD0D60971565AA8510560ab41',
  },
  types: {
    Order: [
      { name: 'sellToken', type: 'address' },
      { name: 'buyToken', type: 'address' },
      { name: 'receiver', type: 'address' },
      { name: 'sellAmount', type: 'uint256' },
      { name: 'buyAmount', type: 'uint256' },
      { name: 'validTo', type: 'uint32' },
      { name: 'appData', type: 'bytes32' },
      { name: 'feeAmount', type: 'uint256' },
      { name: 'kind', type: 'string' },
      { name: 'partiallyFillable', type: 'bool' },
      { name: 'sellTokenBalance', type: 'string' },
      { name: 'buyTokenBalance', type: 'string' },
    ],
  },
  primaryType: 'Order',
  message: {
    sellToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
    buyToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',  // WETH
    receiver: '0x0000000000000000000000000000000000000000',
    sellAmount: '1000000000', // 1000 USDC
    buyAmount: '500000000000000000', // ~0.5 WETH
    validTo: Math.floor(Date.now() / 1000) + 300, // 5분 deadline
    appData: '0x0000000000000000000000000000000000000000000000000000000000000000',
    feeAmount: '0',
    kind: 'sell',
    partiallyFillable: false,
    sellTokenBalance: 'erc20',
    buyTokenBalance: 'erc20',
  },
});
// signature: Hex (0x-prefixed, 65 bytes = r[32] + s[32] + v[1])
```

### CoW Protocol Order API (verified from orderbook OpenAPI spec)

```typescript
// Source: https://raw.githubusercontent.com/cowprotocol/services/v2.65.0/crates/orderbook/openapi.yml

// Order submission
const response = await fetch('https://api.cow.fi/mainnet/api/v1/orders', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sellToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    buyToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    receiver: walletAddress,
    sellAmount: '1000000000',
    buyAmount: '500000000000000000',
    validTo: Math.floor(Date.now() / 1000) + 300,
    appData: '0x...',
    feeAmount: '0',
    kind: 'sell',
    partiallyFillable: false,
    sellTokenBalance: 'erc20',
    buyTokenBalance: 'erc20',
    signingScheme: 'eip712',
    signature: signature, // from signTypedData
    from: walletAddress,
  }),
});
const orderUid = await response.text(); // UID string

// Order status polling
const statusResponse = await fetch(
  `https://api.cow.fi/mainnet/api/v1/orders/${orderUid}`
);
const order = await statusResponse.json();
// order.status: 'presignaturePending' | 'open' | 'fulfilled' | 'cancelled' | 'expired'
```

### AsyncPollingService 등록 (기존 패턴 -- LI.FI bridge 참조)

```typescript
// Source: packages/daemon/src/api/routes/actions.ts (staking unstake 패턴)
// Intent 주문 제출 후 AsyncPollingService에 등록

await db
  .update(transactions)
  .set({
    bridgeStatus: 'PENDING',
    bridgeMetadata: JSON.stringify({
      tracker: 'intent-order',               // IntentOrderTracker 이름
      orderUid: orderUid,                     // CoW Protocol UID
      statusApiUrl: 'https://api.cow.fi/mainnet/api/v1/orders',
      protocol: 'cow_protocol',
      notificationEvent: 'INTENT_ORDER_FILLED', // 완료 시 알림
      enrolledAt: Date.now(),
    }),
  })
  .where(eq(transactions.id, txId));
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| AMM 직접 스왑 (Uniswap, Jupiter) | Intent 기반 솔버 실행 (CoW, 1inch Fusion, UniswapX) | 2022-2023 | Gasless 스왑, MEV 보호, 최적 가격 발견 |
| eth_sign (opaque hash) | EIP-712 structured signing | EIP-712 finalized 2017-09, 대중화 2022+ | 사용자가 서명 내용을 확인 가능, 피싱 방지 |
| 프로토콜별 커스텀 서명 | EIP-712 표준화 | 2022+ | CoW, 1inch, UniswapX 모두 EIP-712 사용 |
| 가스비 사용자 부담 | 솔버/릴레이어 가스비 부담 (gasless) | 2022+ | ETH 잔고 없이 ERC-20 스왑 가능 |

**Deprecated/outdated:**
- eth_sign 기반 주문 서명: 구조화되지 않은 해시 서명은 피싱에 취약. CoW Protocol은 EIP-712와 eth_sign 모두 지원하지만, EIP-712 권장

## Open Questions

1. **TRANSACTION_TYPES 확장 시 DB 마이그레이션 필요 여부**
   - What we know: transactions.type 컬럼에 CHECK 제약이 있을 수 있음. 'INTENT' 추가 시 ALTER TABLE 필요
   - What's unclear: 현재 DB 스키마에서 CHECK 제약이 어떻게 정의되어 있는지 (pushSchema 패턴이면 자동 처리될 수 있음)
   - Recommendation: DB 마이그레이션 전략은 구현 마일스톤(m29-14)에서 결정. 설계에서는 타입 확장만 정의

2. **ActionProviderRegistry 반환 타입 확장 vs 별도 메서드**
   - What we know: 현재 executeResolve()는 ContractCallRequest[]만 반환. 타입 변경은 기존 모든 호출부에 영향
   - What's unclear: 확장(union 반환)이 기존 테스트에 미치는 영향 범위
   - Recommendation: 설계에서는 두 옵션(union 확장 vs executeIntentResolve 별도 메서드) 모두 명세하고, 권장안 제시. 구현 시 확정

3. **Solana intent 프로토콜 지원 가능성**
   - What we know: 현재 EIP-712는 EVM 전용. Solana에는 ed25519 기반 임의 메시지 서명이 있음
   - What's unclear: Jupiter Limit Order 등 Solana intent 프로토콜의 서명 패턴
   - Recommendation: Phase 273 설계는 EVM/EIP-712에 집중. Solana intent 확장은 별도 마일스톤으로 남김 (signTypedData는 EVM 전용, Solana adapter에서 NOT_SUPPORTED throw)

## Sources

### Primary (HIGH confidence)
- viem 2.45.3 type definitions (`node_modules/.pnpm/viem@2.45.3.../viem/_types/accounts/utils/signTypedData.d.ts`) - signTypedData 함수 시그니처 직접 확인
- CoW Protocol contracts (`github.com/cowprotocol/contracts/blob/main/src/contracts/libraries/GPv2Order.sol`) - GPv2Order.Data 12-field 구조체 확인
- CoW Protocol orderbook OpenAPI spec (`raw.githubusercontent.com/cowprotocol/services/v2.65.0/crates/orderbook/openapi.yml`) - API 엔드포인트, OrderStatus 5-value enum 확인
- WAIaaS codebase direct inspection - IChainAdapter (22 methods), IActionProvider, ActionProviderRegistry, AsyncPollingService, sign-only pipeline 직접 분석

### Secondary (MEDIUM confidence)
- [CoW Protocol Signing Schemes docs](https://docs.cow.fi/cow-protocol/reference/core/signing-schemes) - EIP-712 domain separator 파라미터, 4개 signing scheme 비교
- [EIP-712 specification](https://eips.ethereum.org/EIPS/eip-712) - 표준 규격 참조
- [viem signTypedData docs](https://viem.sh/docs/accounts/local/signTypedData) - API 사용법 (페이지 렌더링 이슈로 직접 확인 불가, type definition으로 보완)

### Tertiary (LOW confidence)
- [EIP-712 security practices article](https://letsdex.medium.com/eip-712-in-practice-human-readable-signatures-for-dex-lending-and-nfts-9043204d8820) - 보안 패턴 참조 (커뮤니티 글)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - viem 2.45.3 signTypedData type definition 직접 확인, CoW Protocol GPv2Order.sol 소스 확인
- Architecture: HIGH - 기존 WAIaaS 파이프라인(6-stage, sign-only, AsyncPollingService, ActionProviderRegistry) 소스 코드 직접 분석 후 확장 패턴 도출
- Pitfalls: HIGH - EIP-712 보안 모델(domain separator, nonce, deadline)은 공식 표준에서 확인, 프로젝트 기존 코드 분석에서 충돌 지점 식별

**Research date:** 2026-02-26
**Valid until:** 2026-03-26 (안정적 표준 기반, 30일 유효)
