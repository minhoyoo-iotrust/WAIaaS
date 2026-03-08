# Technology Stack: Across Protocol Cross-Chain Bridge

**Project:** WAIaaS v31.6 Across Protocol Bridge Integration
**Researched:** 2026-03-08

## Recommended Stack

### Core Approach: Direct REST API + viem ABI Encoding (No SDK)

Across Protocol은 SDK 없이 REST API + SpokePool ABI 직접 호출 방식을 사용한다. LI.FI(v28.3) 패턴과 동일한 접근.

**결론**: `ActionApiClient` 베이스 클래스를 재사용하고, SpokePool `depositV3` ABI는 viem `encodeFunctionData`로 직접 인코딩한다.

### New Dependencies: NONE

Across Protocol 통합에 **새로운 npm 의존성이 필요 없다**. 기존 스택만으로 완전 구현 가능:

| Existing Dependency | Version | Role in Across Integration |
|---------------------|---------|----------------------------|
| `viem` | ^2.21.0 | `encodeFunctionData` for SpokePool ABI, `parseAbi` for inline ABI definition |
| `zod` | ^3.24.0 | API response schema validation (suggested-fees, deposit/status, routes, limits) |
| `@waiaas/core` | workspace:* | `ActionApiClient`, `ChainError`, `IActionProvider`, `IAsyncStatusTracker` |

### Why No New Dependencies

| Rejected Package | Version | Why Not |
|------------------|---------|---------|
| `@across-protocol/app-sdk` | 0.4.4 | Frontend/React/wagmi 중심 SDK. 서버사이드 데몬 아키텍처에 부적합. viem을 peer dependency로만 사용하며 브라우저 환경 가정 |
| `@across-protocol/sdk` | 4.1.32 | Relayer/데이터 워커용 내부 유틸 성격. ethers.js, winston 등 무거운 의존성 포함. WAIaaS는 viem 전용 |
| `@across-protocol/contracts` | 4.1.3 | ABI 하나를 위해 전체 contracts 패키지 추가 불필요. `depositV3`는 12 파라미터 단일 함수로 인라인 정의 충분 |

## Across REST API

### Base URLs

| Environment | Base URL |
|-------------|----------|
| Mainnet | `https://app.across.to/api` |
| Testnet | `https://testnet.across.to/api` |

### Endpoints Used

| Endpoint | Method | Purpose | WAIaaS Action |
|----------|--------|---------|---------------|
| `/suggested-fees` | GET | Quote + fee + SpokePool 주소 + fillDeadline | `quote` action |
| `/limits` | GET | Min/max deposit amounts per route | `limits` action |
| `/available-routes` | GET | Supported chain+token pairs | `routes` action |
| `/deposit/status` | GET | Bridge completion tracking | `AcrossBridgeStatusTracker` |

### suggested-fees Request Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `inputToken` | YES | Origin chain token address |
| `outputToken` | YES | Destination chain token address |
| `originChainId` | YES | Origin chain ID (e.g., 1 for Ethereum) |
| `destinationChainId` | YES | Destination chain ID (e.g., 42161 for Arbitrum) |
| `amount` | YES | Input amount in smallest units (wei) |
| `recipient` | NO | Recipient address (defaults to depositor) |
| `message` | NO | Arbitrary bytes for cross-chain actions (default 0x) |
| `relayer` | NO | Preferred relayer address |
| `timestamp` | NO | Quote timestamp (API returns current if omitted) |

### suggested-fees Response Schema (Zod)

```typescript
const AcrossFeeBreakdownSchema = z.object({
  pct: z.string(),    // fee as decimal fraction string (e.g., "0.001")
  total: z.string(),  // fee as absolute amount in smallest units
});

const AcrossSuggestedFeesSchema = z.object({
  totalRelayFee: AcrossFeeBreakdownSchema,
  relayerCapitalFee: AcrossFeeBreakdownSchema,
  relayerGasFee: AcrossFeeBreakdownSchema,
  lpFee: AcrossFeeBreakdownSchema,
  timestamp: z.string(),                    // quoteTimestamp for depositV3
  isAmountTooLow: z.boolean(),
  quoteBlock: z.string(),
  spokePoolAddress: z.string(),              // origin chain SpokePool (dynamic!)
  exclusiveRelayer: z.string(),
  exclusivityDeadline: z.string(),           // unix timestamp
  expectedFillTimeSec: z.string(),           // estimated fill time
  fillDeadline: z.string(),                  // ISO 8601 or unix timestamp
  limits: z.object({
    minDeposit: z.string(),
    maxDeposit: z.string(),
    maxDepositInstant: z.string(),
    maxDepositShortDelay: z.string(),
    recommendedDepositInstant: z.string(),
  }),
});
```

### deposit/status Response Schema (Zod)

```typescript
const AcrossDepositStatusSchema = z.object({
  status: z.enum(['filled', 'pending', 'expired', 'refunded']),
  fillTxnRef: z.string().optional(),
  destinationChainId: z.number(),
  originChainId: z.number(),
  depositId: z.number(),
  depositTxnRef: z.string().optional(),
  depositRefundTxnRef: z.string().optional(),
  actionsSucceeded: z.boolean().optional(),
});
```

### available-routes Response Schema (Zod)

```typescript
const AcrossRouteSchema = z.object({
  originChainId: z.coerce.number(),
  destinationChainId: z.coerce.number(),
  originToken: z.string(),
  destinationToken: z.string(),
  originTokenSymbol: z.string(),
  destinationTokenSymbol: z.string(),
});

const AcrossRoutesResponseSchema = z.array(AcrossRouteSchema);
```

### limits Response Schema (Zod)

```typescript
const AcrossLimitsSchema = z.object({
  minDeposit: z.string(),
  maxDeposit: z.string(),
  maxDepositInstant: z.string(),
  maxDepositShortDelay: z.string(),
  recommendedDepositInstant: z.string(),
});
```

## SpokePool depositV3 ABI (Inline Definition)

`depositV3` 함수 시그니처를 viem `parseAbi`로 인라인 정의. @across-protocol/contracts 패키지 불필요.

```typescript
import { encodeFunctionData, parseAbi } from 'viem';

const SPOKE_POOL_ABI = parseAbi([
  'function depositV3(address depositor, address recipient, address inputToken, address outputToken, uint256 inputAmount, uint256 outputAmount, uint256 destinationChainId, address exclusiveRelayer, uint32 quoteTimestamp, uint32 fillDeadline, uint32 exclusivityDeadline, bytes message) external payable',
]);
```

### depositV3 Parameter Mapping (API -> Contract)

| depositV3 Parameter | Source | Description |
|---------------------|--------|-------------|
| `depositor` | `context.walletAddress` | 입금자 (WAIaaS 월렛 주소) |
| `recipient` | User input or `depositor` | 수령자 (기본값: 입금자와 동일) |
| `inputToken` | User input | Origin chain 토큰 주소 |
| `outputToken` | User input | Destination chain 토큰 주소 |
| `inputAmount` | User input | 입금 금액 (smallest units) |
| `outputAmount` | `inputAmount - totalRelayFee.total` | 수령 금액 (수수료 차감) |
| `destinationChainId` | User input | 목적지 체인 ID |
| `exclusiveRelayer` | `suggestedFees.exclusiveRelayer` | API 반환값 사용 |
| `quoteTimestamp` | `suggestedFees.timestamp` | API 반환 timestamp (uint32) |
| `fillDeadline` | `suggestedFees.fillDeadline` | API 반환값 사용 (uint32 unix) |
| `exclusivityDeadline` | `suggestedFees.exclusivityDeadline` | API 반환값 사용 (uint32 unix) |
| `message` | `0x` (empty) | 단순 브릿지 (cross-chain action 미사용) |

### outputAmount Calculation

```typescript
// outputAmount = inputAmount - totalRelayFee.total
const outputAmount = BigInt(inputAmount) - BigInt(suggestedFees.totalRelayFee.total);
```

## Integration Points with Existing Stack

### 1. AcrossApiClient extends ActionApiClient

LI.FI `LiFiApiClient` 패턴과 동일. `get()` 메서드로 4개 엔드포인트 호출.

```typescript
export class AcrossApiClient extends ActionApiClient {
  constructor(config: AcrossConfig) {
    super(config.apiBaseUrl, config.requestTimeoutMs);
  }
  async getSuggestedFees(params: {...}): Promise<AcrossSuggestedFees> { ... }
  async getDepositStatus(params: {...}): Promise<AcrossDepositStatus> { ... }
  async getAvailableRoutes(params?: {...}): Promise<AcrossRoute[]> { ... }
  async getLimits(params: {...}): Promise<AcrossLimits> { ... }
}
```

### 2. AcrossBridgeActionProvider implements IActionProvider

LI.FI `LiFiActionProvider` 패턴 그대로:

| Action | Description | Returns |
|--------|-------------|---------|
| `bridge` | 크로스체인 브릿지 실행 | `ContractCallRequest[]` (approve + depositV3) |
| `quote` | 견적 조회 (수수료, 예상 시간) | Quote 정보 (ActionResult) |
| `routes` | 지원 라우트 조회 | Route 목록 |
| `limits` | 최소/최대 금액 조회 | Limits 정보 |
| `status` | 브릿지 상태 확인 | Status 정보 |

### 3. Pipeline Integration (변경 없음)

SpokePool `depositV3`는 일반 EVM 컨트랙트 호출:

| Token Type | Pipeline Type | Flow |
|------------|--------------|------|
| ERC-20 | `BATCH` | `APPROVE(SpokePool, amount)` + `CONTRACT_CALL(depositV3)` |
| Native (ETH) | `CONTRACT_CALL` | `depositV3` with `value: inputAmount` |

기존 6-stage 파이프라인 변경 없음. `ContractCallRequest` 반환 형태로 기존 파이프라인 그대로 동작.

### 4. AcrossBridgeStatusTracker implements IAsyncStatusTracker

LI.FI `BridgeStatusTracker` 2-phase 패턴 재사용. Across는 Intent 기반으로 수초 내 fill이 일반적이므로 Phase 1 타임아웃이 더 짧아도 됨.

| Phase | Interval | Max Attempts | Total Duration |
|-------|----------|-------------|----------------|
| Phase 1 (active) | 15s | 480 | 2시간 |
| Phase 2 (monitoring) | 5min | 264 | 22시간 |

Status 매핑:

| Across Status | AsyncTrackingResult State |
|---------------|---------------------------|
| `filled` | `COMPLETED` |
| `pending` | `PENDING` |
| `expired` | `FAILED` |
| `refunded` | `COMPLETED` (details.refunded=true) |

### 5. SpokePool Address: Dynamic from API

SpokePool 주소를 **하드코딩하지 않는다**. `suggested-fees` API 응답의 `spokePoolAddress` 필드에서 동적으로 가져온다. 이유:
- 2025-01-23 V2->V3 컨트랙트 마이그레이션 선례 (주소 변경)
- API가 항상 현재 유효한 SpokePool 주소 반환
- 코드 변경 없이 마이그레이션 대응

### 6. Chain Map (Across Supported Chains -> WAIaaS Network Names)

```typescript
const ACROSS_CHAIN_MAP: ReadonlyMap<string, number> = new Map([
  ['ethereum', 1],      ['ethereum-mainnet', 1],
  ['optimism', 10],     ['optimism-mainnet', 10],
  ['polygon', 137],     ['polygon-mainnet', 137],
  ['arbitrum', 42161],  ['arbitrum-mainnet', 42161],
  ['base', 8453],       ['base-mainnet', 8453],
  ['linea', 59144],     ['linea-mainnet', 59144],
  ['zksync', 324],      ['zksync-mainnet', 324],
]);
```

Note: Across는 Solana를 지원하지 않음 (EVM-only). LI.FI와 차별점.

## File Structure (Expected)

```
packages/actions/src/providers/across/
  index.ts                  # AcrossBridgeActionProvider (IActionProvider)
  across-api-client.ts      # AcrossApiClient extends ActionApiClient
  schemas.ts                # Zod schemas for all API responses
  config.ts                 # AcrossConfig type + defaults + chain map
  bridge-status-tracker.ts  # 2-phase IAsyncStatusTracker
```

## Admin Settings Keys (Expected)

| Key | Default | Description |
|-----|---------|-------------|
| `across_enabled` | `false` | Provider 활성화 |
| `across_api_base_url` | `https://app.across.to/api` | API base URL |
| `across_request_timeout_ms` | `15000` | API 요청 타임아웃 |
| `across_fill_deadline_buffer_sec` | `0` | fillDeadline에 추가할 버퍼 초 (API 반환값 사용 기본) |
| `across_exclusivity_deadline_buffer_sec` | `0` | exclusivityDeadline 버퍼 |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| API Client | Direct REST (`ActionApiClient`) | `@across-protocol/app-sdk` | Frontend SDK, 서버 부적합 |
| API Client | Direct REST | `@across-protocol/sdk` | ethers.js 의존성, 과도한 번들 크기 |
| ABI Source | viem `parseAbi` inline | `@across-protocol/contracts` | 1개 함수 위해 전체 패키지 불필요 |
| SpokePool Address | API 동적 조회 (`spokePoolAddress`) | 하드코딩 | 컨트랙트 마이그레이션 시 코드 변경 필요 |
| Status Tracking | REST `/deposit/status` 폴링 | 온체인 이벤트 구독 | REST API가 단순하고 충분 |
| Fee Calculation | API `totalRelayFee.total` | SDK fee utils | API가 이미 계산해서 반환 |

## Installation

```bash
# No new packages needed.
# Existing dependencies in @waiaas/actions suffice:
#   viem ^2.21.0
#   zod ^3.24.0
#   @waiaas/core workspace:*
```

## Key Technical Notes

### quoteTimestamp Validity Window

- `suggested-fees` API가 반환하는 `timestamp`를 `depositV3`의 `quoteTimestamp`로 전달
- 현재 블록 타임스탬프 기준 **10분 이내**여야 유효
- Quote 조회 후 즉시 실행하는 WAIaaS 패턴에서는 문제 없음
- 주의: **API 응답을 캐시하면 안 됨** (Across 공식 가이드: "do not cache API responses")

### Native Token Bridge (msg.value)

- ETH 등 네이티브 토큰 브릿지 시 `inputToken`은 Wrapped Native Token 주소 (WETH)
- `msg.value`로 ETH를 전달하면 SpokePool이 자동으로 WETH wrap 처리
- `ContractCallRequest.value`에 `inputAmount` 설정

### message Parameter

- 단순 브릿지에서는 `0x` (empty bytes)
- Cross-chain action (목적지 체인에서 추가 실행)이 필요한 경우에만 사용
- WAIaaS 초기 통합에서는 `0x` 고정. Multicaller Handler 통합은 범위 외

### API 캐싱 금지

Across 공식 문서: "Consumers of Across APIs are requested not to cache API responses, especially the /swap/approval and /suggested-fees endpoints." 온체인 상태가 블록마다 변하므로 캐시된 데이터는 빠르게 무효화됨.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| No new dependencies needed | HIGH | LI.FI 동일 패턴 검증 완료, viem ABI encoding 공식 문서 확인 |
| depositV3 ABI signature | HIGH | 공식 SpokePool.sol 소스 + Across docs 교차 검증 |
| suggested-fees response schema | MEDIUM | 공식 문서에서 필드 확인. 일부 타입(string vs number) 런타임 검증 필요 |
| deposit/status response schema | MEDIUM | status enum 값(filled/pending/expired/refunded) 문서 확인. 세부 필드 검증 필요 |
| SpokePool 동적 주소 조회 | HIGH | suggested-fees.spokePoolAddress 공식 문서 확인 |
| Chain support (EVM-only) | HIGH | 공식 available-routes API로 확인 가능 |

## Sources

- [Across API Reference](https://docs.across.to/reference/api-reference) -- suggested-fees, deposit/status, limits, routes endpoints
- [Selected Contract Functions](https://docs.across.to/reference/selected-contract-functions) -- depositV3, speedUpDepositV3 signatures
- [Bridge Integration Guide](https://docs.across.to/developer-quickstart/bridge-integration-guide) -- integration flow
- [SpokePool.sol (GitHub)](https://github.com/across-protocol/contracts/blob/master/contracts/SpokePool.sol) -- contract source
- [Fees in the System](https://docs.across.to/reference/fees-in-the-system) -- fee structure (LP + relayer + gas)
- [Tracking Events](https://docs.across.to/reference/tracking-events) -- V3FundsDeposited event
- [Migration V2 to V3](https://docs.across.to/introduction/migration-guides/migration-from-v2-to-v3) -- 2025-01-23 contract migration
- [@across-protocol/app-sdk (npm)](https://www.npmjs.com/package/@across-protocol/app-sdk) -- v0.4.4, frontend SDK (rejected)
- [@across-protocol/sdk (npm)](https://www.npmjs.com/package/@across-protocol/sdk) -- v4.1.32, internal utils (rejected)
- [@across-protocol/contracts (npm)](https://www.npmjs.com/package/@across-protocol/contracts) -- v4.1.3, ABI source (rejected)
