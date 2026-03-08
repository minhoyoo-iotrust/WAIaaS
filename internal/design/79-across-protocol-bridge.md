# 설계 문서 79: Across Protocol 크로스체인 브릿지

> WAIaaS v31.6 -- Across Protocol의 Intent 기반 고속 크로스체인 EVM 브릿지를 WAIaaS에 통합한다. SpokePool depositV3를 기존 CONTRACT_CALL 파이프라인으로 실행하고, LI.FI(v28.3) 선례 패턴을 따르며 신규 npm 의존성과 DB 마이그레이션 없이 완료한다.

---

## 1. 개요 및 목표

### 1.1 배경

Across Protocol은 UMA의 Optimistic Oracle 위에 구축된 Intent 기반 크로스체인 브릿지이다. 사용자가 출발 체인의 SpokePool에 자금을 예치하면 Relayer가 목적지 체인에서 즉시(2-10초) 자금을 제공한다. 기존 lock-and-mint 브릿지 대비 빠른 완결성과 단순한 수수료 구조가 특징이다.

### 1.2 목표

- Across Protocol을 독립 Action Provider(`AcrossBridgeActionProvider`)로 통합
- ERC-20 토큰 및 네이티브 ETH 크로스체인 브릿지 지원
- 기존 6-stage 파이프라인의 CONTRACT_CALL/BATCH type 그대로 활용
- LI.FI(v28.3) 선례의 IAsyncStatusTracker 2-phase polling 패턴 재사용
- **DB 마이그레이션 불필요** (bridge_status/bridge_metadata 기존 컬럼 재사용)
- **신규 npm 의존성 불필요** (viem + Zod + ActionApiClient 기존 스택)

### 1.3 LI.FI와의 공존

| 항목 | LI.FI (v28.3) | Across (v31.6) |
|------|---------------|----------------|
| 유형 | 브릿지 애그리게이터 (100+ 브릿지) | 단일 프로토콜 직접 통합 |
| 속도 | 브릿지별 상이 (수분~수시간) | Intent 기반 2-10초 완결 |
| 수수료 | 애그리게이터 + 브릿지 수수료 | LP fee + relayer fee (단순) |
| TX data 생성 | LI.FI API가 calldata 반환 | Across API + SpokePool ABI 인코딩 |

Across는 별도 Action Provider로 구현하여 LI.FI와 독립적으로 동작한다. 자동 라우팅(견적 비교)은 범위 외이며, 사용자가 명시적으로 프로토콜을 선택한다.

---

## 2. Across API 엔드포인트 분석

> **설계 결정 DS-03**: `/suggested-fees`와 `/swap/approval`은 캐싱 금지 (Across 공식 정책). `/available-routes`만 5분 캐시 허용.

Base URL: `https://app.across.to/api` (Admin Settings 오버라이드 가능)

### 2.1 GET /suggested-fees

**용도**: 브릿지 견적 조회 (수수료, 한도, fillDeadline, exclusiveRelayer 등 전부 반환)

**요청 파라미터**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `inputToken` | address | Yes | 출발 체인 토큰 주소 |
| `outputToken` | address | Yes | 목적지 체인 토큰 주소 |
| `originChainId` | number | Yes | 출발 체인 ID |
| `destinationChainId` | number | Yes | 목적지 체인 ID |
| `amount` | string | Yes | 입금 금액 (최소 단위, wei) |
| `recipient` | address | No | 수령인 주소 (기본: depositor) |
| `message` | bytes | No | 수령인 컨트랙트 메시지 (기본: 0x) |

**응답 예시**:
```json
{
  "totalRelayFee": {
    "pct": "3456789012345678",
    "total": "345678901234567800"
  },
  "relayerCapitalFee": {
    "pct": "1234567890123456",
    "total": "123456789012345600"
  },
  "relayerGasFee": {
    "pct": "1111111111111111",
    "total": "111111111111111100"
  },
  "lpFee": {
    "pct": "1111111111111111",
    "total": "111111111111111100"
  },
  "timestamp": 1700000000,
  "isAmountTooLow": false,
  "quoteBlock": "18500000",
  "exclusiveRelayer": "0x0000000000000000000000000000000000000000",
  "exclusivityDeadline": 0,
  "expectedFillTimeSec": 3,
  "limits": {
    "minDeposit": "100000000000000",
    "maxDeposit": "1000000000000000000000",
    "maxDepositInstant": "500000000000000000000",
    "maxDepositShortDelay": "800000000000000000000"
  }
}
```

> **경고 (Pitfall 7)**: 이 엔드포인트 응답을 절대 캐싱하지 말 것. 수수료는 실시간 유동성, 가스 가격, relayer 상태에 따라 변동한다.

### 2.2 GET /limits

**용도**: 라우트별 최소/최대 전송 한도 조회

**요청 파라미터**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `inputToken` | address | Yes | 출발 체인 토큰 주소 |
| `outputToken` | address | Yes | 목적지 체인 토큰 주소 |
| `originChainId` | number | Yes | 출발 체인 ID |
| `destinationChainId` | number | Yes | 목적지 체인 ID |

**응답 예시**:
```json
{
  "minDeposit": "100000000000000",
  "maxDeposit": "1000000000000000000000",
  "maxDepositInstant": "500000000000000000000",
  "maxDepositShortDelay": "800000000000000000000"
}
```

- `maxDepositInstant`: Relayer가 즉시(2-10초) fill 가능한 최대 금액
- `maxDepositShortDelay`: 약간의 지연(10-60초)으로 fill 가능한 최대 금액
- `maxDeposit`: fill 가능한 절대 최대 금액 (slow fill 포함)

> **참고**: `/suggested-fees` 응답의 `limits` 필드에도 동일 정보가 포함되므로, quote 조회 시 별도 `/limits` 호출이 불필요할 수 있다. 별도 조회는 라우트 사전 검증 용도.

### 2.3 GET /available-routes

**용도**: 지원 브릿지 라우트(체인/토큰 조합) 목록 조회

**요청 파라미터**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `originChainId` | number | No | 출발 체인 ID 필터 |
| `destinationChainId` | number | No | 목적지 체인 ID 필터 |
| `originToken` | address | No | 출발 토큰 주소 필터 |
| `destinationToken` | address | No | 목적지 토큰 주소 필터 |

**응답 예시**:
```json
[
  {
    "originChainId": 1,
    "destinationChainId": 42161,
    "originToken": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    "destinationToken": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    "originTokenSymbol": "USDC",
    "destinationTokenSymbol": "USDC",
    "isNative": false
  }
]
```

> **설계 결정 DS-03(routes 부분)**: `/available-routes` 응답은 5분 TTL로 캐시 가능. 라우트는 자주 변경되지 않으며, 캐싱으로 API 호출을 줄인다.

### 2.4 GET /deposit/status

**용도**: 브릿지 deposit 상태 추적

**요청 파라미터**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `depositTxnRef` | string | Yes | deposit 트랜잭션 해시 |
| `originChainId` | number | No | 출발 체인 ID (조회 속도 향상) |

**응답 예시**:
```json
{
  "status": "filled",
  "fillTx": "0xabc...def",
  "destinationChainId": 42161,
  "depositId": 12345,
  "depositTxHash": "0x123...456",
  "fillTxHash": "0xabc...def",
  "updatedAt": "2026-03-08T12:00:00.000Z"
}
```

**상태 값**:
| status | 의미 | WAIaaS 매핑 |
|--------|------|------------|
| `filled` | Relayer가 fill 완료 | `COMPLETED` |
| `pending` | 아직 fill 대기 중 | `PENDING` |
| `expired` | fillDeadline 초과, 환불 대기 | `FAILED` |
| `refunded` | 환불 완료 | `COMPLETED` (refunded: true) |

> **경고 (Pitfall 8)**: Across indexer는 10초 주기로 이벤트를 폴링하므로, deposit 직후 1-15초간 상태가 'pending' 또는 찾을 수 없다. 이는 정상이며 에러로 처리하지 않는다.

### 2.5 GET /swap/approval

**용도**: 통합 API -- approval TX와 bridge TX calldata를 한 번에 반환

**요청 파라미터**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tokenAddr` | address | Yes | 출발 토큰 주소 (또는 `0x0000000000000000000000000000000000000000` for native) |
| `originChainId` | number | Yes | 출발 체인 ID |
| `destinationChainId` | number | Yes | 목적지 체인 ID |
| `amount` | string | Yes | 입금 금액 (최소 단위) |
| `depositor` | address | Yes | 예금자 주소 |
| `recipient` | address | No | 수령인 주소 (기본: depositor) |
| `inputToken` | address | No | 출발 토큰 (tokenAddr과 동일하거나, 크로스체인 스왑 시 원본) |
| `outputToken` | address | No | 목적지 토큰 |

**응답 예시**:
```json
{
  "approvalTxns": [
    {
      "to": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "data": "0x095ea7b3...",
      "value": "0"
    }
  ],
  "swapTx": {
    "to": "0x5c7BCd6E7De5423a257D81B442095A1a6ced35C5",
    "data": "0xe7a7ed02...",
    "value": "0",
    "gasLimit": "200000"
  },
  "inputAmount": "1000000000000000000",
  "expectedOutputAmount": "996543210987654322",
  "minOutputAmount": "986577777777777778",
  "expectedFillTimeSec": 3
}
```

> **설계 결정 DS-01**: REST API 직접 호출 (Across SDK @across-protocol/sdk 사용 않음). Across SDK는 ethers.js에 의존하고 app-sdk는 frontend 중심이므로, REST API + viem 조합이 WAIaaS 아키텍처에 적합하다.

### 2.6 에러 응답 형식

Across API는 HTTP 4xx/5xx 상태 코드와 함께 JSON 에러를 반환한다:

```json
{
  "code": "INVALID_INPUT",
  "message": "Amount too low for this route"
}
```

주요 에러 코드:
| HTTP Status | code | 의미 | WAIaaS ChainError |
|-------------|------|------|-------------------|
| 400 | `INVALID_INPUT` | 잘못된 파라미터 | `INVALID_PARAMS` |
| 400 | `AMOUNT_TOO_LOW` | 최소 금액 미달 | `AMOUNT_TOO_LOW` |
| 404 | `ROUTE_NOT_FOUND` | 지원하지 않는 라우트 | `UNSUPPORTED_ROUTE` |
| 429 | Rate limited | API 요청 제한 초과 | `RATE_LIMITED` |
| 503 | Service unavailable | API 서버 오류 | `SERVICE_UNAVAILABLE` |

---

## 3. Zod 스키마 설계

> 기존 LI.FI schemas.ts 패턴 참조. 모든 스키마에 `.passthrough()` 사용하여 확장 필드 허용.

### 3.1 AcrossSuggestedFeesResponseSchema

```typescript
import { z } from 'zod';

const AcrossFeeComponentSchema = z.object({
  pct: z.string(),     // fee percentage in 18-decimal wei format (e.g., "3456789012345678")
  total: z.string(),   // absolute fee in input token smallest units
}).passthrough();

export const AcrossSuggestedFeesResponseSchema = z.object({
  totalRelayFee: AcrossFeeComponentSchema,
  relayerCapitalFee: AcrossFeeComponentSchema,
  relayerGasFee: AcrossFeeComponentSchema,
  lpFee: AcrossFeeComponentSchema,
  timestamp: z.number(),                  // quoteTimestamp (uint32 seconds)
  isAmountTooLow: z.boolean(),
  quoteBlock: z.string().optional(),
  exclusiveRelayer: z.string(),           // address, 0x0 if open
  exclusivityDeadline: z.number(),        // uint32 seconds, 0 if no exclusivity
  expectedFillTimeSec: z.number().optional(),
  limits: z.object({
    minDeposit: z.string(),
    maxDeposit: z.string(),
    maxDepositInstant: z.string(),
    maxDepositShortDelay: z.string(),
  }).passthrough(),
}).passthrough();

export type AcrossSuggestedFeesResponse = z.infer<typeof AcrossSuggestedFeesResponseSchema>;
```

### 3.2 AcrossLimitsResponseSchema

```typescript
export const AcrossLimitsResponseSchema = z.object({
  minDeposit: z.string(),
  maxDeposit: z.string(),
  maxDepositInstant: z.string(),
  maxDepositShortDelay: z.string(),
}).passthrough();

export type AcrossLimitsResponse = z.infer<typeof AcrossLimitsResponseSchema>;
```

### 3.3 AcrossAvailableRoutesResponseSchema

```typescript
const AcrossRouteSchema = z.object({
  originChainId: z.number(),
  destinationChainId: z.number(),
  originToken: z.string(),
  destinationToken: z.string(),
  originTokenSymbol: z.string().optional(),
  destinationTokenSymbol: z.string().optional(),
  isNative: z.boolean().optional(),
}).passthrough();

export const AcrossAvailableRoutesResponseSchema = z.array(AcrossRouteSchema);

export type AcrossRoute = z.infer<typeof AcrossRouteSchema>;
export type AcrossAvailableRoutesResponse = z.infer<typeof AcrossAvailableRoutesResponseSchema>;
```

### 3.4 AcrossDepositStatusResponseSchema

```typescript
export const AcrossDepositStatusResponseSchema = z.object({
  status: z.enum(['filled', 'pending', 'expired', 'refunded']),
  fillTx: z.string().optional(),
  fillTxHash: z.string().optional(),
  depositTxHash: z.string().optional(),
  depositId: z.number().optional(),
  destinationChainId: z.number().optional(),
  updatedAt: z.string().optional(),
}).passthrough();

export type AcrossDepositStatusResponse = z.infer<typeof AcrossDepositStatusResponseSchema>;
```

### 3.5 AcrossSwapApprovalResponseSchema

```typescript
const AcrossTransactionSchema = z.object({
  to: z.string(),
  data: z.string(),
  value: z.string().optional(),
  gasLimit: z.string().optional(),
}).passthrough();

export const AcrossSwapApprovalResponseSchema = z.object({
  approvalTxns: z.array(AcrossTransactionSchema).optional().default([]),
  swapTx: AcrossTransactionSchema,
  inputAmount: z.string().optional(),
  expectedOutputAmount: z.string().optional(),
  minOutputAmount: z.string().optional(),
  expectedFillTimeSec: z.number().optional(),
}).passthrough();

export type AcrossSwapApprovalResponse = z.infer<typeof AcrossSwapApprovalResponseSchema>;
```

---

## 4. SpokePool depositV3 컨트랙트 인터페이스

### 4.1 Solidity Function Signature

```solidity
function depositV3(
    address depositor,           // 예금자 주소 (= walletAddress)
    address recipient,           // 수령인 주소 (기본 = walletAddress, self-bridge)
    address inputToken,          // 출발 체인 토큰 (ERC-20 주소, 네이티브는 WETH)
    address outputToken,         // 목적지 체인 토큰
    uint256 inputAmount,         // 입금 금액 (최소 단위)
    uint256 outputAmount,        // 수령 금액 (= inputAmount - fees)
    uint256 destinationChainId,  // 목적지 체인 ID
    address exclusiveRelayer,    // 독점 릴레이어 (0x0 = 오픈 경쟁)
    uint32 quoteTimestamp,       // /suggested-fees 응답의 timestamp
    uint32 fillDeadline,         // fill 마감 시간 (UNIX 초)
    uint32 exclusivityDeadline,  // 독점 릴레이 마감 시간 (UNIX 초, 0=없음)
    bytes message                // 수령인 컨트랙트 메시지 (0x = 빈)
) external payable;
```

### 4.2 12개 파라미터 상세 설명

| # | Parameter | Type | Source | 주의사항 |
|---|-----------|------|--------|---------|
| 1 | `depositor` | address | `context.walletAddress` | 반드시 TX 발신자와 동일 |
| 2 | `recipient` | address | 사용자 입력 또는 `context.walletAddress` | EOA는 native ETH, 컨트랙트는 WETH 수신 (Pitfall 5) |
| 3 | `inputToken` | address | 사용자 입력 | 네이티브 ETH 브릿지 시 WETH 주소 사용 |
| 4 | `outputToken` | address | 사용자 입력 또는 `/suggested-fees` | 출발/도착 동일 토큰의 목적지 체인 주소 |
| 5 | `inputAmount` | uint256 | 사용자 입력 | 최소 단위 (wei). limits 범위 내여야 함 |
| 6 | `outputAmount` | uint256 | 계산: `inputAmount - totalRelayFee.total` | (Pitfall 1) 반드시 API 반환 수수료 사용 |
| 7 | `destinationChainId` | uint256 | 사용자 입력 | WAIaaS 체인명 -> EVM chain ID 변환 |
| 8 | `exclusiveRelayer` | address | `/suggested-fees` 응답 | 0x0이면 오픈 경쟁 |
| 9 | `quoteTimestamp` | uint32 | `/suggested-fees` 응답의 `timestamp` | (Pitfall 2) 초 단위. 만료 시 revert |
| 10 | `fillDeadline` | uint32 | `/suggested-fees` 응답 또는 계산 | (Pitfall 3) 초 단위. 과거 시간 금지 |
| 11 | `exclusivityDeadline` | uint32 | `/suggested-fees` 응답 | exclusiveRelayer=0x0이면 0 (Pitfall 6) |
| 12 | `message` | bytes | 고정 `0x` | (Pitfall 15) 빈 바이트 고정. 고급 기능은 범위 외 |

### 4.3 viem ABI Fragment

```typescript
const SPOKE_POOL_DEPOSIT_V3_ABI = [
  {
    type: 'function',
    name: 'depositV3',
    inputs: [
      { name: 'depositor', type: 'address' },
      { name: 'recipient', type: 'address' },
      { name: 'inputToken', type: 'address' },
      { name: 'outputToken', type: 'address' },
      { name: 'inputAmount', type: 'uint256' },
      { name: 'outputAmount', type: 'uint256' },
      { name: 'destinationChainId', type: 'uint256' },
      { name: 'exclusiveRelayer', type: 'address' },
      { name: 'quoteTimestamp', type: 'uint32' },
      { name: 'fillDeadline', type: 'uint32' },
      { name: 'exclusivityDeadline', type: 'uint32' },
      { name: 'message', type: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
] as const;
```

### 4.4 V3FundsDeposited 이벤트 ABI

depositV3 호출 시 발생하는 이벤트. depositId 추출에 사용.

```typescript
const V3_FUNDS_DEPOSITED_EVENT_ABI = [
  {
    type: 'event',
    name: 'V3FundsDeposited',
    inputs: [
      { name: 'inputToken', type: 'address', indexed: false },
      { name: 'outputToken', type: 'address', indexed: false },
      { name: 'inputAmount', type: 'uint256', indexed: false },
      { name: 'outputAmount', type: 'uint256', indexed: false },
      { name: 'destinationChainId', type: 'uint256', indexed: true },
      { name: 'depositId', type: 'uint32', indexed: true },
      { name: 'quoteTimestamp', type: 'uint32', indexed: false },
      { name: 'fillDeadline', type: 'uint32', indexed: false },
      { name: 'exclusivityDeadline', type: 'uint32', indexed: false },
      { name: 'depositor', type: 'address', indexed: true },
      { name: 'recipient', type: 'address', indexed: false },
      { name: 'exclusiveRelayer', type: 'address', indexed: false },
      { name: 'message', type: 'bytes', indexed: false },
    ],
  },
] as const;
```

> **참고 (Pitfall 12)**: 이벤트 파싱 실패 시 depositTxHash 기반 fallback 조회 (`/deposit/status?depositTxnRef=txHash`). bridge_metadata에 depositId와 depositTxHash 모두 저장한다.

### 4.5 체인별 SpokePool 주소 테이블

| Chain | Chain ID | SpokePool Address (Proxy) |
|-------|----------|---------------------------|
| Ethereum | 1 | `0x5c7BCd6E7De5423a257D81B442095A1a6ced35C5` |
| Arbitrum | 42161 | `0xe35e9842fceaCA96570B734083f4a58e8F7C5f2A` |
| Optimism | 10 | `0x6f26Bf09B1C792e3228e5467807a900A503c0281` |
| Base | 8453 | `0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64` |
| Polygon | 137 | `0x9295ee1d8C5b022Be115A2AD3c30C72E34e7F096` |
| Linea | 59144 | `0x7E63A5f1a8F0B4d0934B2f2327DaED3F6bb2ee75` |

> **경고 (Pitfall 9)**: SpokePool은 UUPS Proxy로 주소는 고정이지만, 새 체인 추가 시 업데이트 필요. Admin Settings `actions.across_spokepool_overrides`로 런타임 주소 추가/변경 가능.
>
> **대안**: `/swap/approval` API 사용 시 swapTx.to 필드에서 SpokePool 주소를 동적으로 획득하므로 하드코딩 의존도 감소.

### 4.6 체인별 WETH 주소 테이블

네이티브 토큰 브릿지 시 inputToken으로 사용할 WETH(Wrapped Native Token) 주소:

| Chain | Chain ID | WETH Address |
|-------|----------|-------------|
| Ethereum | 1 | `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2` |
| Arbitrum | 42161 | `0x82aF49447D8a07e3bd95BD0d56f35241523fBab1` |
| Optimism | 10 | `0x4200000000000000000000000000000000000006` |
| Base | 8453 | `0x4200000000000000000000000000000000000006` |
| Polygon | 137 | `0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270` (WMATIC) |
| Linea | 59144 | `0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f` |

> **경고 (Pitfall 4)**: 네이티브 ETH 브릿지 시 inputToken = WETH 주소, msg.value = inputAmount. ERC-20 브릿지 시 msg.value = 0. 불일치 시 revert.

### 4.7 네이티브 토큰 처리

SpokePool의 `depositV3()`는 `payable` 함수로:
- `inputToken == wrappedNativeToken && msg.value > 0` -> SpokePool이 내부적으로 ETH를 WETH로 래핑
- `msg.value == inputAmount` 검증 (불일치 시 revert)
- ERC-20 브릿지 시 `msg.value`는 반드시 0

**목적지 체인 수신 토큰 (Pitfall 5)**:
- EOA recipient -> 네이티브 ETH 수신
- Contract recipient (Smart Account 포함) -> WETH 수신
- 견적 응답에 `receivedAsWeth` 플래그로 명시

---

## 5. 수수료 모델 및 outputAmount 계산

### 5.1 수수료 구조

```
totalRelayFee = lpFee + relayerCapitalFee + relayerGasFee
```

| 항목 | 설명 |
|------|------|
| `lpFee` | Liquidity Provider 수수료. Utilization 기반 이자율 모델 (AAVE와 유사). 체인별 R0/R1/R2 파라미터 |
| `relayerCapitalFee` | Relayer의 자본 기회비용 + 리스크 프리미엄 |
| `relayerGasFee` | 목적지 체인에서 fill TX의 가스 비용 |

### 5.2 outputAmount 계산 공식 확정

> **설계 결정 DS-07**: outputAmount은 `/suggested-fees` API의 `totalRelayFee.total`을 사용하여 계산한다. 절대 LP/relayer fee를 개별 조합하지 않는다.

```typescript
// outputAmount calculation (confirmed formula)
const outputAmount = BigInt(inputAmount) - BigInt(suggestedFees.totalRelayFee.total);
```

**pct 값 형식**: `totalRelayFee.pct`는 18자리 소수 형식의 문자열이다 (1e18 = 100%). 예를 들어 `"3456789012345678"`은 약 0.35%의 수수료를 의미한다. 그러나 WAIaaS에서는 `pct` 값을 직접 계산에 사용하지 않고 `total` 값만 사용한다.

```typescript
// DO NOT use pct for calculation — use total directly
// BAD:  outputAmount = inputAmount * (1n - pct / 1_000_000_000_000_000_000n)
// GOOD: outputAmount = inputAmount - BigInt(totalRelayFee.total)
```

### 5.3 사전 검증

```typescript
// Pre-validation checks before depositV3
function validateBridgeParams(inputAmount: bigint, outputAmount: bigint, fees: AcrossSuggestedFeesResponse): void {
  // 1. isAmountTooLow check (Pitfall 1 prevention)
  if (fees.isAmountTooLow) {
    throw new ChainError('AMOUNT_TOO_LOW', 'Deposit amount is below minimum for this route');
  }

  // 2. outputAmount <= inputAmount (Zod refine equivalent)
  if (outputAmount > inputAmount) {
    throw new ChainError('INVALID_OUTPUT', 'outputAmount cannot exceed inputAmount');
  }

  // 3. outputAmount > 0
  if (outputAmount <= 0n) {
    throw new ChainError('ZERO_OUTPUT', 'outputAmount would be zero after fees');
  }

  // 4. Within limits range
  const limits = fees.limits;
  if (inputAmount < BigInt(limits.minDeposit)) {
    throw new ChainError('BELOW_MIN_DEPOSIT', `Amount below minimum: ${limits.minDeposit}`);
  }
  if (inputAmount > BigInt(limits.maxDeposit)) {
    throw new ChainError('ABOVE_MAX_DEPOSIT', `Amount above maximum: ${limits.maxDeposit}`);
  }
}
```

---

## 6. 브릿지 상태 추적 방식

> **설계 결정 DS-02**: bridge_status/bridge_metadata 기존 컬럼 재사용. DB 마이그레이션 불필요.

### 6.1 기존 컬럼 재사용 확정

기존 `transactions` 테이블의 `bridge_status` TEXT 컬럼과 `bridge_metadata` TEXT(JSON) 컬럼은 LI.FI 브릿지(v28.3)에서 범용 브릿지 추적용으로 설계되었다. Across 통합도 동일 컬럼을 사용한다.

**재사용 근거**:
- `bridge_status` 값: `PENDING | BRIDGE_MONITORING | COMPLETED | FAILED | TIMEOUT | REFUNDED` -- Across의 4-state가 이 값들로 완전히 매핑됨
- `bridge_metadata` JSON에 Across 전용 필드를 추가하면 됨 (스키마 변경 불필요)
- LI.FI 선례가 이미 이 패턴을 검증함
- AsyncPollingService가 `bridge_status` 컬럼을 기반으로 자동 폴링

### 6.2 bridge_metadata JSON 구조

```typescript
interface AcrossBridgeMetadata {
  tracker: 'across-bridge';                // IAsyncStatusTracker name
  txHash: string;                          // origin chain deposit TX hash
  originChainId: number;                   // origin EVM chain ID
  destChainId: number;                     // destination EVM chain ID
  inputToken: string;                      // origin token address
  outputToken: string;                     // destination token address
  inputAmount: string;                     // input amount (wei)
  outputAmount: string;                    // expected output amount (wei)
  depositId?: number;                      // from V3FundsDeposited event (may be null initially)
  fillTxHash?: string;                     // destination chain fill TX hash (updated on fill)
  notificationEvent: 'BRIDGE_COMPLETED';   // notification event to fire on completion
  enrolledAt: number;                      // enrollment timestamp (ms)
}
```

### 6.3 2-phase Polling 패턴 (LI.FI 선례 응용)

> **설계 결정 DS-08**: Phase 1 폴링 간격을 15초로 설정 (LI.FI 30초 대비 단축). Across fills는 보통 2-10초 내 완료되므로 빠른 감지 필요.

| Phase | Tracker Name | 간격 | 최대 시도 | 총 시간 | timeout 전이 |
|-------|-------------|------|----------|---------|-------------|
| Phase 1 (Active) | `across-bridge` | 15초 | 480회 | 2시간 | `ACROSS_BRIDGE_MONITORING` |
| Phase 2 (Reduced) | `across-bridge-monitoring` | 5분 | 264회 | 22시간 | `TIMEOUT` |

**전체 모니터링**: 2시간 active + 22시간 reduced = 24시간 최대

### 6.4 상태 값 매핑

```typescript
function mapAcrossStatus(response: AcrossDepositStatusResponse): AsyncTrackingResult {
  switch (response.status) {
    case 'filled':
      return {
        state: 'COMPLETED',
        details: {
          fillTxHash: response.fillTxHash ?? response.fillTx ?? null,
          destinationChainId: response.destinationChainId ?? null,
          depositId: response.depositId ?? null,
        },
      };
    case 'expired':
      return {
        state: 'FAILED',
        details: { reason: 'Deposit expired (fillDeadline passed). Refund in ~90 minutes.' },
      };
    case 'refunded':
      return {
        state: 'COMPLETED',
        details: { refunded: true },
      };
    case 'pending':
    default:
      return { state: 'PENDING' };
  }
}
```

---

## 7. fillDeadline / exclusivityDeadline 기본값 전략

> **설계 결정 DS-05**: `/suggested-fees` API 반환 fillDeadline 우선 사용. API 미반환 시 `quoteTimestamp + Admin Settings 기본값(21600초)`.

### 7.1 fillDeadline 결정 로직

```typescript
function calculateFillDeadline(
  suggestedFees: AcrossSuggestedFeesResponse,
  adminSettings: { fillDeadlineBufferSec: number },
): number {
  // Priority 1: Use API-suggested fillDeadline if available
  if ('fillDeadline' in suggestedFees && typeof suggestedFees.fillDeadline === 'number') {
    return suggestedFees.fillDeadline;
  }

  // Priority 2: quoteTimestamp + admin configurable buffer
  return suggestedFees.timestamp + adminSettings.fillDeadlineBufferSec;
}
```

> **경고 (Pitfall 3)**: fillDeadline은 uint32 초 단위. 밀리초 혼동 금지. SpokePool은 `[currentTime, currentTime + fillDeadlineBuffer]` 범위만 허용. 과거 시간 시 revert. depositV3 calldata 인코딩 직전에 `fillDeadline > Math.floor(Date.now() / 1000)` 검증 필수.

### 7.2 exclusivityDeadline 결정 로직

```typescript
function resolveExclusivity(suggestedFees: AcrossSuggestedFeesResponse): {
  exclusiveRelayer: string;
  exclusivityDeadline: number;
} {
  const exclusiveRelayer = suggestedFees.exclusiveRelayer;
  const isOpenCompetition = exclusiveRelayer === '0x0000000000000000000000000000000000000000';

  return {
    exclusiveRelayer: isOpenCompetition ? '0x0000000000000000000000000000000000000000' : exclusiveRelayer,
    exclusivityDeadline: isOpenCompetition ? 0 : (suggestedFees.exclusivityDeadline ?? 0),
  };
}
```

> **경고 (Pitfall 6)**: exclusiveRelayer=0x0이면 exclusivityDeadline은 반드시 0. 불일치 시 Relayer 동작이 예측 불가능해진다.

### 7.3 quoteTimestamp 만료 방지 (Late-bind 패턴)

> **설계 결정 DS-04**: Stage 5 실행 직전에 fresh `/suggested-fees`를 재조회한다. WAIaaS의 6-stage 파이프라인은 정책 평가(Stage 3) + Owner 승인(Stage 4)으로 수초~수분의 지연이 발생하므로, 초기 quote의 quoteTimestamp이 만료될 위험이 높다.

**파이프라인 내 quote 타이밍**:

```
Stage 1: Parse     -> 최초 /suggested-fees 조회 (견적 표시용)
Stage 2: Prepare   -> (skip)
Stage 3: Policy    -> inputAmount 기준 정책 평가
Stage 4: Approval  -> Owner 승인 대기 (수초~수분)
Stage 5: Execute   -> ** fresh /suggested-fees 재조회 (late-bind) **
                   -> depositV3 calldata 인코딩
                   -> on-chain TX 실행
Stage 6: Confirm   -> TX receipt 확인
Post:              -> bridge_status enrollment
```

- `depositQuoteTimeBuffer`는 일반적으로 3600초(1시간)이므로 대부분의 경우 재조회 없이도 안전하나, late-bind 패턴으로 확실하게 방지
- 시간 단위 통일: `Math.floor(Date.now() / 1000)` (uint32 초 단위)

---

## 8. AcrossBridgeActionProvider 인터페이스 설계

### 8.1 ActionProviderMetadata

```typescript
export class AcrossBridgeActionProvider implements IActionProvider {
  readonly metadata: ActionProviderMetadata = {
    name: 'across_bridge',
    description: 'Across Protocol intent-based cross-chain bridge with fast relayer fills (2-10 seconds)',
    version: '1.0.0',
    chains: ['ethereum'],  // multi-chain via fromChain/toChain params
    mcpExpose: true,
    requiresApiKey: false,  // Across API free (integrator ID recommended)
    requiredApis: ['across'],
    requiresSigningKey: false,
  };
```

### 8.2 5 Actions 정의

```typescript
  readonly actions: readonly ActionDefinition[] = [
    {
      name: 'quote',
      description: 'Get Across bridge quote with fees, limits, and estimated fill time',
      chain: 'ethereum',
      inputSchema: AcrossQuoteInputSchema,
      riskLevel: 'low',
      defaultTier: 'INSTANT',
    },
    {
      name: 'execute',
      description: 'Execute cross-chain bridge via Across Protocol SpokePool depositV3',
      chain: 'ethereum',
      inputSchema: AcrossExecuteInputSchema,
      riskLevel: 'high',
      defaultTier: 'DELAY',
    },
    {
      name: 'status',
      description: 'Check Across bridge deposit status (filled/pending/expired/refunded)',
      chain: 'ethereum',
      inputSchema: AcrossStatusInputSchema,
      riskLevel: 'low',
      defaultTier: 'INSTANT',
    },
    {
      name: 'routes',
      description: 'List available Across bridge routes (supported chain/token combinations)',
      chain: 'ethereum',
      inputSchema: AcrossRoutesInputSchema,
      riskLevel: 'low',
      defaultTier: 'INSTANT',
    },
    {
      name: 'limits',
      description: 'Get Across bridge transfer limits for a specific route',
      chain: 'ethereum',
      inputSchema: AcrossLimitsInputSchema,
      riskLevel: 'low',
      defaultTier: 'INSTANT',
    },
  ] as const;
```

### 8.3 각 Action의 InputSchema (Zod)

```typescript
// Quote input
const AcrossQuoteInputSchema = z.object({
  fromChain: z.string().min(1, 'fromChain is required (e.g., ethereum, arbitrum, base)'),
  toChain: z.string().min(1, 'toChain is required'),
  inputToken: z.string().min(1, 'inputToken address is required'),
  outputToken: z.string().min(1, 'outputToken address is required'),
  amount: z.string().min(1, 'amount is required (in smallest units, e.g., wei)'),
  recipient: z.string().optional(),  // defaults to walletAddress
});

// Execute input (same as quote + optional slippage)
const AcrossExecuteInputSchema = z.object({
  fromChain: z.string().min(1),
  toChain: z.string().min(1),
  inputToken: z.string().min(1),
  outputToken: z.string().min(1),
  amount: z.string().min(1),
  recipient: z.string().optional(),
  slippage: z.number().min(0).max(1).optional(),  // decimal, 0.01 = 1%
});

// Status input
const AcrossStatusInputSchema = z.object({
  depositTxHash: z.string().min(1, 'depositTxHash is required'),
  originChainId: z.number().optional(),  // speeds up lookup
});

// Routes input
const AcrossRoutesInputSchema = z.object({
  fromChain: z.string().optional(),
  toChain: z.string().optional(),
  inputToken: z.string().optional(),
  outputToken: z.string().optional(),
});

// Limits input
const AcrossLimitsInputSchema = z.object({
  fromChain: z.string().min(1),
  toChain: z.string().min(1),
  inputToken: z.string().min(1),
  outputToken: z.string().min(1),
});
```

### 8.4 resolve() 메서드 분기 로직

```typescript
  async resolve(
    actionName: string,
    params: Record<string, unknown>,
    context: ActionContext,
  ): Promise<ContractCallRequest | ContractCallRequest[] | Record<string, unknown>> {
    switch (actionName) {
      case 'quote':    return this.resolveQuote(params, context);
      case 'execute':  return this.resolveExecute(params, context);
      case 'status':   return this.resolveStatus(params);
      case 'routes':   return this.resolveRoutes(params);
      case 'limits':   return this.resolveLimits(params);
      default:
        throw new ChainError('UNSUPPORTED_ACTION', `Unknown action: ${actionName}`);
    }
  }
```

### 8.5 execute action: approve + depositV3 BATCH 플로우

```typescript
  private async resolveExecute(
    params: Record<string, unknown>,
    context: ActionContext,
  ): Promise<ContractCallRequest[]> {
    const input = AcrossExecuteInputSchema.parse(params);
    const originChainId = getAcrossChainId(input.fromChain);
    const destChainId = getAcrossChainId(input.toChain);

    // 1. Get fresh suggested fees (no caching)
    const fees = await this.apiClient.getSuggestedFees({
      inputToken: input.inputToken,
      outputToken: input.outputToken,
      originChainId,
      destinationChainId: destChainId,
      amount: input.amount,
      recipient: input.recipient ?? context.walletAddress,
    });

    // 2. Validate
    const inputAmount = BigInt(input.amount);
    const outputAmount = inputAmount - BigInt(fees.totalRelayFee.total);
    validateBridgeParams(inputAmount, outputAmount, fees);

    // 3. Resolve fillDeadline + exclusivity
    const fillDeadline = calculateFillDeadline(fees, this.config);
    const { exclusiveRelayer, exclusivityDeadline } = resolveExclusivity(fees);

    // 4. Validate fillDeadline not in past (Pitfall 3)
    const nowSec = Math.floor(Date.now() / 1000);
    if (fillDeadline <= nowSec) {
      throw new ChainError('FILL_DEADLINE_PAST', 'fillDeadline is in the past');
    }

    // 5. Determine if native token bridge
    const isNative = isNativeTokenBridge(input.inputToken, originChainId);
    const spokePoolAddress = getSpokePoolAddress(originChainId);

    // 6. Encode depositV3 calldata
    const depositCalldata = encodeFunctionData({
      abi: SPOKE_POOL_DEPOSIT_V3_ABI,
      functionName: 'depositV3',
      args: [
        context.walletAddress,                          // depositor
        input.recipient ?? context.walletAddress,       // recipient
        input.inputToken,                               // inputToken
        input.outputToken,                              // outputToken
        inputAmount,                                    // inputAmount
        outputAmount,                                   // outputAmount
        BigInt(destChainId),                            // destinationChainId
        exclusiveRelayer,                               // exclusiveRelayer
        fees.timestamp,                                 // quoteTimestamp
        fillDeadline,                                   // fillDeadline
        exclusivityDeadline,                            // exclusivityDeadline
        '0x',                                           // message (empty)
      ],
    });

    // 7. Build ContractCallRequest array
    if (isNative) {
      // Native: single depositV3 with msg.value
      return [{
        type: 'CONTRACT_CALL',
        to: spokePoolAddress,
        data: depositCalldata,
        value: input.amount,  // msg.value = inputAmount
        chainId: originChainId,
      }];
    }

    // ERC-20: approve + depositV3 BATCH
    const approveCalldata = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [spokePoolAddress, inputAmount],
    });

    return [
      {
        type: 'CONTRACT_CALL',
        to: input.inputToken,
        data: approveCalldata,
        chainId: originChainId,
      },
      {
        type: 'CONTRACT_CALL',
        to: spokePoolAddress,
        data: depositCalldata,
        chainId: originChainId,
      },
    ];
  }
```

> **경고 (Pitfall 10)**: approve 금액 = inputAmount 정확히 일치. MaxUint256 금지 (WAIaaS 보안 원칙: 최소 권한). 기존 allowance가 충분하면 approve 생략 가능 (가스 절약).

### 8.6 AcrossConfig 타입 + 기본값

```typescript
export interface AcrossConfig {
  enabled: boolean;
  apiBaseUrl: string;
  integratorId: string;
  fillDeadlineBufferSec: number;
  defaultSlippagePct: number;
  maxSlippagePct: number;
  requestTimeoutMs: number;
}

export const ACROSS_DEFAULTS: AcrossConfig = {
  enabled: false,
  apiBaseUrl: 'https://app.across.to/api',
  integratorId: '',
  fillDeadlineBufferSec: 21_600,  // 6 hours
  defaultSlippagePct: 0.01,       // 1% (same-token bridge = low slippage)
  maxSlippagePct: 0.03,           // 3%
  requestTimeoutMs: 10_000,       // 10 seconds
};
```

### 8.7 체인 ID 매핑

```typescript
export const ACROSS_CHAIN_MAP: ReadonlyMap<string, number> = new Map([
  ['ethereum', 1],
  ['ethereum-mainnet', 1],
  ['arbitrum', 42161],
  ['arbitrum-mainnet', 42161],
  ['optimism', 10],
  ['optimism-mainnet', 10],
  ['base', 8453],
  ['base-mainnet', 8453],
  ['polygon', 137],
  ['polygon-mainnet', 137],
  ['linea', 59144],
  ['linea-mainnet', 59144],
]);

export function getAcrossChainId(chain: string): number {
  const id = ACROSS_CHAIN_MAP.get(chain.toLowerCase());
  if (id === undefined) {
    throw new ChainError(
      'UNSUPPORTED_CHAIN',
      `Unsupported chain '${chain}' for Across bridge. Supported: ${[...ACROSS_CHAIN_MAP.keys()].filter(k => !k.includes('-')).join(', ')}`,
    );
  }
  return id;
}
```

### 8.8 SpokePool 주소 + WETH 주소 매핑

```typescript
const SPOKE_POOL_ADDRESSES: ReadonlyMap<number, string> = new Map([
  [1, '0x5c7BCd6E7De5423a257D81B442095A1a6ced35C5'],
  [42161, '0xe35e9842fceaCA96570B734083f4a58e8F7C5f2A'],
  [10, '0x6f26Bf09B1C792e3228e5467807a900A503c0281'],
  [8453, '0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64'],
  [137, '0x9295ee1d8C5b022Be115A2AD3c30C72E34e7F096'],
  [59144, '0x7E63A5f1a8F0B4d0934B2f2327DaED3F6bb2ee75'],
]);

const WETH_ADDRESSES: ReadonlyMap<number, string> = new Map([
  [1, '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'],      // WETH
  [42161, '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1'],    // WETH (Arbitrum)
  [10, '0x4200000000000000000000000000000000000006'],        // WETH (Optimism)
  [8453, '0x4200000000000000000000000000000000000006'],      // WETH (Base)
  [137, '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270'],     // WMATIC (Polygon)
  [59144, '0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f'],   // WETH (Linea)
]);

function isNativeTokenBridge(inputToken: string, chainId: number): boolean {
  const weth = WETH_ADDRESSES.get(chainId);
  return weth !== undefined && inputToken.toLowerCase() === weth.toLowerCase();
}
```

---

## 9. MCP / SDK 설계

### 9.1 MCP 도구 (4개)

| MCP Tool | Action | Description |
|----------|--------|-------------|
| `across-bridge-quote` | quote | Across 브릿지 견적 조회 (수수료, 수령액, 예상 fill 시간) |
| `across-bridge-execute` | execute | Across 브릿지 실행 (approve+depositV3 BATCH) |
| `across-bridge-status` | status | 브릿지 deposit 상태 확인 |
| `across-bridge-routes` | routes | 지원 라우트 목록 조회 |

> `limits` action은 `quote` 응답에 포함되므로 별도 MCP 도구로 노출하지 않는다. SDK에서는 개별 메서드로 제공.

**mcpExpose=true** 설정으로 ActionProviderRegistry에 등록된 action이 MCP 도구로 자동 노출된다. 별도 MCP 코드 작성 불필요.

### 9.2 SDK 메서드 (4개)

```typescript
// @waiaas/sdk
class WAIaaSClient {
  // Bridge quote
  async acrossBridgeQuote(params: {
    fromChain: string;
    toChain: string;
    inputToken: string;
    outputToken: string;
    amount: string;
    recipient?: string;
  }): Promise<AcrossBridgeQuoteResult>;

  // Bridge execute
  async acrossBridgeExecute(params: {
    fromChain: string;
    toChain: string;
    inputToken: string;
    outputToken: string;
    amount: string;
    recipient?: string;
    slippage?: number;
  }): Promise<TransactionResult>;

  // Bridge status
  async acrossBridgeStatus(params: {
    depositTxHash: string;
    originChainId?: number;
  }): Promise<AcrossBridgeStatusResult>;

  // Bridge routes
  async acrossBridgeRoutes(params?: {
    fromChain?: string;
    toChain?: string;
    inputToken?: string;
    outputToken?: string;
  }): Promise<AcrossRoute[]>;
}
```

**응답 타입**:

```typescript
interface AcrossBridgeQuoteResult {
  inputAmount: string;
  outputAmount: string;
  totalFee: string;              // inputAmount - outputAmount
  feeBreakdown: {
    lpFee: string;
    relayerCapitalFee: string;
    relayerGasFee: string;
  };
  estimatedFillTimeSec: number;
  fillDeadline: number;          // UNIX seconds
  limits: {
    minDeposit: string;
    maxDeposit: string;
    maxDepositInstant: string;
  };
  receivedAsWeth: boolean;       // true if recipient is contract (Pitfall 5)
}

interface AcrossBridgeStatusResult {
  status: 'filled' | 'pending' | 'expired' | 'refunded';
  fillTxHash?: string;
  depositId?: number;
  destinationChainId?: number;
}
```

### 9.3 connect-info capability

```typescript
// connect-info response에 추가
{
  capabilities: {
    // ... existing
    across_bridge: true,   // Across Protocol cross-chain bridge available
  }
}
```

---

## 10. Admin Settings 설계

### 10.1 설정 키 (6개)

| Key | Default | Type | Description |
|-----|---------|------|-------------|
| `actions.across_enabled` | `'false'` | boolean | Across Bridge 프로바이더 활성화 |
| `actions.across_api_base_url` | `'https://app.across.to/api'` | string | Across API base URL |
| `actions.across_integrator_id` | `''` | string | Across Integrator ID (등록 권장, Pitfall 14) |
| `actions.across_fill_deadline_buffer_sec` | `'21600'` | number | fillDeadline 버퍼 (기본 6시간). API 미반환 시 `quoteTimestamp + buffer` |
| `actions.across_default_slippage_pct` | `'0.01'` | number | 기본 슬리피지 (1%) |
| `actions.across_max_slippage_pct` | `'0.03'` | number | 최대 슬리피지 (3%) |

### 10.2 Admin UI 표시 전략

기존 DeFi Settings 패턴(LI.FI, 0x, Jupiter 등)과 동일하게 "DeFi / Bridge" 섹션에 표시. 별도 탭 불필요.

---

## 11. 파이프라인 통합 전략

### 11.1 6-stage 파이프라인 매핑

| Stage | 역할 | Across 처리 |
|-------|------|------------|
| Stage 1 (Parse) | 요청 파싱 | 최초 `/suggested-fees` 조회 (견적 표시용) |
| Stage 2 (Prepare) | TX 준비 | depositV3 calldata 초안 인코딩 |
| Stage 3 (Policy) | 정책 평가 | **inputAmount** 기준 DAILY_LIMIT/SINGLE_TX_LIMIT 평가 (Pitfall 11) |
| Stage 4 (Approval) | Owner 승인 | 출발/도착 체인, inputAmount, 수수료, 예상 도착 시간 표시 |
| Stage 5 (Execute) | TX 실행 | **fresh `/suggested-fees` 재조회 (late-bind, DS-04)** -> depositV3 calldata 재인코딩 -> on-chain TX |
| Stage 6 (Confirm) | TX 확인 | TX receipt 확인, V3FundsDeposited 이벤트 파싱(depositId 추출) |
| Post | 후처리 | bridge_status='PENDING', bridge_metadata 저장, AsyncPollingService 등록 |

### 11.2 정책 평가 기준

> **설계 결정 DS-09**: 정책 평가 기준은 inputAmount (사용자가 실제 지출하는 금액). outputAmount은 수수료 차감 후 수령액이므로 정책 대상이 아니다.

- `SPENDING_LIMIT`: inputAmount 기준 USD 환산 평가
- `CONTRACT_WHITELIST`: SpokePool 주소가 등록되어 있어야 함
- `RATE_LIMIT`: 표준 rate limiting 적용

### 11.3 CONTRACT_WHITELIST 등록 안내

```
SpokePool 주소를 CONTRACT_WHITELIST에 등록해야 depositV3 호출이 허용됨.
미등록 시 Stage 3에서 CONTRACT_NOT_WHITELISTED 에러 발생.

예시 (Ethereum):
PUT /v1/admin/settings
{ "key": "contract_whitelist", "value": "[\"0x5c7BCd6E7De5423a257D81B442095A1a6ced35C5\"]" }
```

---

## 12. 에러 핸들링

### 12.1 에러 매핑 테이블

| 시나리오 | ChainError 코드 | 메시지 | 사용자 표시 |
|---------|----------------|--------|-----------|
| 유동성 부족 | `INSUFFICIENT_LIQUIDITY` | `Insufficient liquidity for this bridge route` | "이 라우트에 충분한 유동성이 없습니다. 금액을 줄이거나 나중에 다시 시도해주세요." |
| 미지원 라우트 | `UNSUPPORTED_ROUTE` | `Bridge route not supported: {from} -> {to}` | "이 체인/토큰 조합은 Across 브릿지에서 지원하지 않습니다." |
| 견적 만료 | `QUOTE_EXPIRED` | `Quote expired, retrying with fresh quote` | 자동 재조회 시도. 재시도 실패 시 에러 반환 |
| 최소 금액 미달 | `AMOUNT_TOO_LOW` | `Amount below minimum deposit: {min}` | "최소 전송 금액은 {min}입니다." |
| 최대 금액 초과 | `AMOUNT_TOO_HIGH` | `Amount above maximum deposit: {max}` | "최대 전송 금액은 {max}입니다." |
| fillDeadline 과거 | `FILL_DEADLINE_PAST` | `fillDeadline is in the past` | "브릿지 마감 시간이 만료되었습니다. 새 견적을 조회해주세요." |
| SpokePool 미등록 | `CONTRACT_NOT_WHITELISTED` | `SpokePool not in CONTRACT_WHITELIST` | "SpokePool 주소를 CONTRACT_WHITELIST에 등록해주세요." |
| API 에러 | `ACROSS_API_ERROR` | `Across API error: {message}` | "Across 서비스 오류입니다. 나중에 다시 시도해주세요." |

### 12.2 자동 재조회 (QUOTE_EXPIRED)

```typescript
// Stage 5 late-bind에서 자동 재조회
try {
  const freshFees = await apiClient.getSuggestedFees(params);
  // Use fresh fees for depositV3
} catch (error) {
  if (error.code === 'QUOTE_EXPIRED') {
    // Already tried fresh quote — propagate error
    throw new ChainError('BRIDGE_EXECUTION_FAILED', 'Failed to obtain valid quote for bridge');
  }
  throw error;
}
```

---

## 13. 보안 고려사항

### 13.1 approve 금액 = inputAmount (최소 권한)

```typescript
// CORRECT: approve exactly inputAmount
approve(spokePoolAddress, inputAmount)

// WRONG: never approve MaxUint256
// approve(spokePoolAddress, MaxUint256)  // SECURITY VIOLATION
```

### 13.2 Smart Account recipient WETH 수신 경고

Across SpokePool은 목적지 체인에서:
- EOA recipient -> native ETH 전송
- Contract recipient (Smart Account 포함) -> WETH 전송

견적 응답에 `receivedAsWeth: true` 플래그를 포함하여 사용자에게 경고.

### 13.3 CONTRACT_WHITELIST 필수

SpokePool 주소를 `CONTRACT_WHITELIST`에 등록하지 않으면 정책 엔진이 depositV3 호출을 차단한다. 사용자 설정 문서에 등록 안내 포함.

### 13.4 fillDeadline 과거 시간 검증

```typescript
// Pre-execution validation (before on-chain TX)
const nowSec = Math.floor(Date.now() / 1000);
if (fillDeadline <= nowSec) {
  throw new ChainError('FILL_DEADLINE_PAST', 'fillDeadline is in the past — aborting to prevent on-chain revert');
}
```

---

## 14. 컴포넌트 파일 구조

```
packages/actions/src/providers/across-bridge/
  index.ts                    -- AcrossBridgeActionProvider (IActionProvider)
  across-api-client.ts        -- AcrossApiClient (ActionApiClient 확장)
  schemas.ts                  -- Zod 스키마 5개 (API 응답 검증)
  config.ts                   -- AcrossConfig + ACROSS_DEFAULTS + ACROSS_CHAIN_MAP
  bridge-status-tracker.ts    -- AcrossBridgeStatusTracker + AcrossBridgeMonitoringTracker
```

**수정 대상 파일**:
| 파일 | 변경 |
|------|------|
| `packages/actions/src/index.ts` | across-bridge provider + trackers export 추가 |
| `packages/daemon/src/lifecycle/daemon.ts` | Across tracker 등록 (LI.FI 패턴 동일) |
| `packages/daemon/src/api/routes/actions.ts` | across_bridge execute 후 bridge enrollment |
| Admin Settings definitions | `actions.across_*` 6개 키 추가 |
| `packages/sdk/src/` | across bridge 4 메서드 추가 |
| `skills/defi.skill.md` | Across Bridge 도구 문서화 |

---

## 15. 설계 결정 요약

| ID | 결정 | 근거 |
|----|------|------|
| **DS-01** | REST API 직접 호출 (Across SDK 사용 않음) | @across-protocol/sdk는 ethers.js 의존, app-sdk는 frontend 중심. REST API + viem이 WAIaaS 아키텍처에 적합 |
| **DS-02** | bridge_status/bridge_metadata 기존 컬럼 재사용 (DB 마이그레이션 없음) | LI.FI(v28.3) 선례. transactions 테이블의 기존 컬럼이 범용 브릿지 추적용으로 설계됨 |
| **DS-03** | /suggested-fees 캐싱 금지, /available-routes 5분 캐시 허용 | Across 공식 정책. 수수료는 실시간 유동성에 따라 변동하므로 캐싱 금지. 라우트는 안정적이므로 캐시 허용 |
| **DS-04** | Late-bind quote 패턴 (Stage 5 직전 fresh /suggested-fees 재조회) | WAIaaS 6-stage 파이프라인의 정책/승인 단계에서 수초~수분 지연. quoteTimestamp 만료 방지 |
| **DS-05** | fillDeadline: API 반환값 우선, 미반환 시 quoteTimestamp + 21600초 | Across API가 최적값을 계산. Admin Settings로 버퍼 오버라이드 가능 |
| **DS-06** | exclusivityDeadline: API 반환값 그대로. exclusiveRelayer=0x0이면 0 | exclusiveRelayer와 exclusivityDeadline은 반드시 쌍으로 일관성 유지 |
| **DS-07** | outputAmount = inputAmount - totalRelayFee.total (절대값 사용) | pct 기반 계산은 소수점 변환 오류 위험. total 절대값이 안전 |
| **DS-08** | Phase 1 폴링 간격 15초 (LI.FI 30초 대비 단축) | Across fills는 2-10초 내 완료. 빠른 상태 감지로 UX 향상 |
| **DS-09** | 정책 평가 기준은 inputAmount (지출 금액) | outputAmount은 수수료 차감 후 수령액. 정책 대상은 사용자가 실제 지출하는 금액 |
| **DS-10** | message 파라미터 고정 0x (빈 바이트) | cross-chain action(수신자 컨트랙트 실행)은 범위 외. 단순 bridge에서는 빈 message |
| **DS-11** | 신규 npm 의존성 없음 | viem(calldata), Zod(검증), ActionApiClient(HTTP) 기존 스택으로 충분 |
| **DS-12** | IncomingTxMonitor 의존 않음 (보조적 감지만) | IncomingTxMonitor는 모든 체인/월렛을 구독하지 않을 수 있음. AsyncPollingService + Across API가 primary |

---

## 참조 문서

- [Across API Reference](https://docs.across.to/reference/api-reference)
- [Across Selected Contract Functions (depositV3)](https://docs.across.to/reference/selected-contract-functions)
- [Across Intent Lifecycle](https://docs.across.to/concepts/intent-lifecycle-in-across)
- [Across Fee Structure](https://docs.across.to/reference/fees-in-the-system)
- [Across Bridge Integration Guide](https://docs.across.to/developer-quickstart/bridge)
- 기존 WAIaaS 코드: `packages/actions/src/providers/lifi/` (LI.FI 선례)
- 설계 문서 77: DCent Swap Aggregator (Action Provider 설계 형식 참조)
