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
| HyperEVM Mainnet | `hyperEvm` (Phase 1 착수 시 viem 소스에서 검증) | 999 | HYPE |
| HyperEVM Testnet | `hyperliquidEvmTestnet` (Phase 1 착수 시 viem 소스에서 검증) | 998 | HYPE |

> **Fallback**: viem 빌트인에 해당 chain export가 없을 경우 `defineChain`으로 커스텀 체인 정의.

### Phase 2: Hyperliquid DEX 리서치 및 설계

Hyperliquid L1 DEX API를 심층 리서치하고 WAIaaS 아키텍처에 통합하는 설계 문서를 작성한다.

**리서치 항목:**
- Hyperliquid Exchange API / Info API / WebSocket API 전체 사양 분석
- EIP-712 서명 구조 상세 (action types, nonce 관리, 체인별 서명 차이)
- Sub-account 생성/관리 API 및 제약 사항
- Rate Limit 정책 및 IP/계정 기반 제한
- Testnet(api.hyperliquid-testnet.xyz) 환경 차이점
- Builder Fee 구조 (WAIaaS 빌더 등록 가능 여부)
- viem 2.x의 HyperEVM chain export 존재 여부 및 정확한 이름 검증 (`hyperEvm`, `hyperliquidEvmTestnet`)
- 기존 정책 엔진(지출 한도, 토큰별 한도, 컨트랙트 화이트리스트 등)의 API 기반 거래 적용 방안
- 알림 이벤트 필요 여부 (주문 체결, 포지션 청산 경고, Sub-account 이동 등)
- DB 스키마 변경 범위 (주문 이력 저장, Sub-account 매핑 테이블 등)

**설계 항목:**
- EIP-712 서명 플로우 → WAIaaS 서명 파이프라인 매핑
- discriminatedUnion 타입 매핑 방안: 기존 SIGN type 활용 또는 신규 type 추가 여부 결정
- `IPerpProvider` 확장 또는 신규 인터페이스 설계
- Spot 거래 인터페이스 설계
- Sub-account ↔ WAIaaS 월렛 모델 매핑
- 기존 6-stage 파이프라인과 API 기반 거래의 차이 해소 방안
- Phase 3~5 공통 `HyperliquidExchangeClient` 설계 (Perp/Spot/Sub-account 공유 구조)
- MCP 도구 / SDK 메서드 설계
- Admin Settings 항목 설계 (API endpoint, rate limit 설정, testnet 전환 등)
- Admin UI 표시 설계 (포지션/주문 현황, Sub-account 관리)

### Phase 3: Hyperliquid Perp 구현

> **의존성**: Phase 2 설계 완료 후 착수. Phase 3에서 `HyperliquidExchangeClient` 공유 구조를 구현하므로 Phase 4(Spot)는 Phase 3 완료 후 순차 진행.

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
- Admin UI: Perp 포지션/주문 현황 표시
- 관련 skill 파일 업데이트 (transactions.skill.md 등)

### Phase 4: Hyperliquid Spot 구현

> **의존성**: Phase 3 완료 후 착수 (`HyperliquidExchangeClient` 공유 구조 활용).

Hyperliquid Spot 마켓 거래를 구현한다.

**기능:**
- Market/Limit 주문
- 잔액 조회 (Spot 계정)
- 주문 취소 / 주문 상태 조회
- 마켓 정보 조회 (가격, 거래량)
- MCP 도구 + SDK 메서드
- Admin UI: Spot 잔액/주문 현황 표시
- 관련 skill 파일 업데이트

### Phase 5: Sub-accounts

> **의존성**: Phase 3 완료 후 착수 가능 (Phase 4와 병렬 가능).

Hyperliquid Sub-account 기능을 WAIaaS 월렛 모델과 통합한다.

**기능:**
- Sub-account 생성/조회
- Master ↔ Sub-account 간 자금 이동 (internal transfer)
- Sub-account별 포지션/잔액 조회
- WAIaaS 월렛과의 매핑 전략 (1 wallet = 1 sub-account 또는 N:1)
- Admin UI: Sub-account 관리 표시
- 관련 skill 파일 업데이트

---

## 설계 확정: HDESIGN-01 파이프라인 통합

### 1. ApiDirectResult 인터페이스 정의

코드 수준 확정 (`packages/core/src/interfaces/action-provider.types.ts`에 추가):

```typescript
export interface ApiDirectResult {
  __apiDirect: true;
  externalId: string;
  status: 'success' | 'partial' | 'pending';
  provider: string;      // e.g., 'hyperliquid_perp'
  action: string;        // e.g., 'hl_open_position'
  data: Record<string, unknown>;
  metadata?: {
    market?: string;
    side?: string;
    size?: string;
    price?: string;
    [key: string]: unknown;
  };
}

export function isApiDirectResult(result: unknown): result is ApiDirectResult {
  return typeof result === 'object' && result !== null && '__apiDirect' in result && (result as any).__apiDirect === true;
}
```

IActionProvider.resolve() 반환 타입 확장:

```typescript
resolve(
  actionName: string,
  params: Record<string, unknown>,
  context: ActionContext,
): Promise<ContractCallRequest | ContractCallRequest[] | ApiDirectResult>;
```

ActionContext 확장 (requiresSigningKey 지원):

```typescript
interface ActionContext {
  // ... existing fields
  privateKey?: Hex;  // Only provided when provider.requiresSigningKey === true
}
```

IActionProvider 메타데이터 확장:

```typescript
interface ActionProviderMetadata {
  // ... existing fields
  requiresSigningKey?: boolean;  // default: false
}
```

### 2. Stage 5 분기 설계

기존 `stages.ts`의 Stage 5 (execute) 내부에 분기 추가. 파이프라인 순서:

```
Stage 1 (Validate) -> Stage 2 (Auth) -> Stage 3 (Policy) -> Stage 4 (Delay/Approval)
  -> [NEW] Pre-Stage 5: requiresSigningKey 확인 -> key decrypt
  -> Stage 5: isApiDirectResult(result) 분기
    YES -> DB UPDATE (status=COMPLETED, metadata에 externalId/provider response 저장)
         -> Provider-specific DB INSERT (hyperliquid_orders 등)
         -> Skip on-chain execution entirely
    NO  -> 기존 온체인 실행 플로우 (build -> simulate -> sign -> submit)
  -> Stage 6 (Notification): 동일하게 실행 (TRANSACTION_COMPLETED 이벤트)
```

key decryption 흐름 상세:

1. ActionProviderRegistry가 `provider.metadata.requiresSigningKey` 확인
2. true인 경우 Stage 4 완료 후 `keyStore.decrypt(walletId, masterPassword)` 호출
3. 복호화된 privateKey를 ActionContext에 추가하여 `provider.resolve()`에 전달
4. `resolve()` 완료 후 즉시 메모리에서 privateKey 참조 해제 (GC 대상)
5. 기존 `sign-message.ts`의 패턴과 동일: decrypt -> use -> release

### 3. 기존 파이프라인 영향 범위 분석

| 파일 | 변경 | 변경 내용 |
|------|------|-----------|
| `packages/core/src/interfaces/action-provider.types.ts` | 수정 | ApiDirectResult 타입 + isApiDirectResult() + ActionContext.privateKey + requiresSigningKey |
| `packages/daemon/src/pipeline/stages.ts` | 수정 | Stage 5 분기 (isApiDirectResult 분기 로직 ~20줄 추가) |
| `packages/daemon/src/infrastructure/action-provider-registry.ts` | 수정 | requiresSigningKey 시 key decrypt 로직 추가 |
| discriminatedUnion 8-type | 변경 없음 | API-direct 액션은 파이프라인 타입과 무관 |
| PolicyEngine | 변경 없음 | 기존 riskLevel/defaultTier 기반 평가 그대로 |
| NotificationService | 변경 없음 | TRANSACTION_COMPLETED 이벤트 재사용 |

### 4. ApiDirectResult vs ContractCallRequest 비교

| 항목 | ContractCallRequest (기존) | ApiDirectResult (신규) |
|------|---------------------------|----------------------|
| 실행 방식 | 온체인 TX (sign -> submit) | Provider 내부 (sign -> API POST) |
| 결과 식별자 | txHash | externalId (provider-specific) |
| Gas | 필요 (estimateGas + safety margin) | 불필요 (Hyperliquid API는 gasless) |
| 확인 방식 | on-chain polling (confirmation worker) | API 응답 즉시 완료 |
| DB 기록 | transactions 테이블 (txHash, status) | transactions 테이블 (metadata에 externalId) + provider별 테이블 |
| Stage 5 | 전체 실행 (build/simulate/sign/submit) | skip (provider가 이미 실행 완료) |

### 5. 에러 처리 설계

ApiDirectResult 전용 에러 코드 (기존 DeFi 에러 체계에 추가):

| 코드 | HTTP | 설명 |
|------|------|------|
| HL_API_ERROR | 502 | Hyperliquid Exchange API 호출 실패 |
| HL_RATE_LIMITED | 429 | Hyperliquid rate limit 초과 (1200 weight/min) |
| HL_INSUFFICIENT_MARGIN | 422 | 마진 부족으로 주문 거부 |
| HL_ORDER_REJECTED | 422 | Hyperliquid가 주문 거부 (사유 포함) |
| HL_SIGNING_FAILED | 500 | EIP-712 서명 생성 실패 |
| HL_INVALID_MARKET | 404 | 존재하지 않는 마켓 |

ChainError -> WAIaaSError 변환: Stage 5에서 `provider.resolve()` 실패 시 ChainError를 catch하여 WAIaaSError로 변환 (기존 패턴 그대로).

---

## 설계 확정: HDESIGN-02 EIP-712 서명

### 1. 두 서명 스키마 비교

| 항목 | L1 Action (Phantom Agent) | User-Signed Action |
|------|--------------------------|-------------------|
| 용도 | 주문/취소/레버리지/마진모드 등 거래 액션 | 입출금/내부이체/Sub-account 생성/API Wallet 등록 |
| Domain name | 'Exchange' | 'HyperliquidSignTransaction' |
| Domain version | '1' | '1' |
| Domain chainId | 1337 (mainnet, testnet 동일) | 42161 (mainnet) / 421614 (testnet) |
| Domain verifyingContract | 0x0000...0000 | 0x0000...0000 |
| Primary type | 'Agent' | 'HyperliquidTransaction:{ActionType}' |
| 서명 대상 | phantom agent { source, connectionId } | action payload 직접 |
| msgpack 필요 | YES (action -> msgpack -> keccak256 -> connectionId) | NO |
| @msgpack/msgpack 의존성 | 필수 | 불필요 |

### 2. Phantom Agent 서명 상세 (L1 Actions)

`HyperliquidSigner.signL1Action()` 메서드 설계:

```typescript
async signL1Action(
  action: Record<string, unknown>,
  nonce: number,          // Date.now() ms timestamp
  isMainnet: boolean,
  privateKey: Hex,
  vaultAddress?: Hex,     // Sub-account인 경우
): Promise<{ r: Hex; s: Hex; v: number }> {
  // Step 1: trailing zero 제거 (price, size, trigger 등 decimal string 필드)
  const normalized = removeTrailingZeros(action);

  // Step 2: msgpack encode (canonical field order!)
  // CRITICAL: 필드 순서는 Python SDK signing.py의 order_type_to_wire() 기준
  // 예: { a: assetIndex, b: isBuy, p: price, s: size, r: reduceOnly, t: orderType, c: cloid }
  const encoded = encode(normalized);

  // Step 3: nonce + vaultAddress 직렬화
  const nonceBytes = Buffer.alloc(8);
  nonceBytes.writeBigUInt64BE(BigInt(nonce));
  // vaultAddress: 0x01 + 20 bytes if present, 0x00 if absent
  const vaultBytes = vaultAddress
    ? Buffer.concat([Buffer.from([0x01]), hexToBytes(vaultAddress)])
    : Buffer.from([0x00]);

  // Step 4: keccak256(encoded + nonceBytes + vaultBytes) -> connectionId
  const connectionId = keccak256(
    concat([encoded, nonceBytes, vaultBytes])
  );

  // Step 5: phantom agent 구성
  const phantomAgent = {
    source: isMainnet ? 'a' : 'b',
    connectionId,
  };

  // Step 6: EIP-712 서명
  const account = privateKeyToAccount(privateKey);
  const signature = await account.signTypedData({
    domain: {
      name: 'Exchange',
      version: '1',
      chainId: 1337,
      verifyingContract: '0x0000000000000000000000000000000000000000',
    },
    types: {
      Agent: [
        { name: 'source', type: 'string' },
        { name: 'connectionId', type: 'bytes32' },
      ],
    },
    primaryType: 'Agent',
    message: phantomAgent,
  });

  // Step 7: {r, s, v} 분리
  return parseSignature(signature);
}
```

### 3. msgpack 정규 필드 순서 (Python SDK signing.py 기준)

| Action type | Wire 필드 순서 (msgpack key order) |
|------------|----------------------------------|
| order | a(asset), b(isBuy), p(limitPx), s(sz), r(reduceOnly), t(orderType), c(cloid) |
| cancel | a(asset), o(oid) |
| cancelByCloid | asset, cloid |
| modify | oid, order(nested: a,b,p,s,r,t,c), traderAddress? |
| batchModify | modifies(array of modify wire) |
| updateLeverage | asset, isCross, leverage |
| updateIsolatedMargin | asset, isBuy, ntli |

trailing zero 제거 규칙:
- price, size, trigger 등 decimal string: "100.00" -> "100", "1.50" -> "1.5", "0.0010" -> "0.001"
- 정수는 변환 불필요: 10 -> 10
- 함수: `function removeTrailingZeros(s: string): string { return s.replace(/\.?0+$/, ''); }`

### 4. User-Signed Action 서명 상세

`HyperliquidSigner.signUserSignedAction()` 메서드 설계:

```typescript
async signUserSignedAction(
  actionType: string,     // e.g., 'UsdSend', 'Withdraw', 'CreateSubAccount'
  action: Record<string, unknown>,
  isMainnet: boolean,
  privateKey: Hex,
): Promise<{ r: Hex; s: Hex; v: number }> {
  const account = privateKeyToAccount(privateKey);
  const signature = await account.signTypedData({
    domain: {
      name: 'HyperliquidSignTransaction',
      version: '1',
      chainId: isMainnet ? 42161 : 421614,
      verifyingContract: '0x0000000000000000000000000000000000000000',
    },
    types: USER_ACTION_TYPES[actionType],  // 아래 매핑 테이블
    primaryType: `HyperliquidTransaction:${actionType}`,
    message: action,
  });
  return parseSignature(signature);
}
```

User-Signed Action types 매핑:

| Action Type | EIP-712 Types |
|------------|---------------|
| UsdSend | { hyperliquidChain: 'string', destination: 'string', amount: 'string', time: 'uint64' } |
| Withdraw | { hyperliquidChain: 'string', destination: 'string', amount: 'string', time: 'uint64' } |
| UsdClassTransfer | { hyperliquidChain: 'string', amount: 'string', toPerp: 'bool', nonce: 'uint64' } |
| CreateSubAccount | { hyperliquidChain: 'string', name: 'string', time: 'uint64' } |
| SubAccountTransfer | { hyperliquidChain: 'string', subAccountUser: 'string', isDeposit: 'bool', usd: 'uint64', time: 'uint64' } |
| ApproveAgent | { hyperliquidChain: 'string', agentAddress: 'address', agentName: 'string', nonce: 'uint64' } |

hyperliquidChain 값: mainnet -> 'Mainnet', testnet -> 'Testnet'

---

## 설계 확정: HDESIGN-03 ExchangeClient 공유 구조

### 1. HyperliquidExchangeClient 클래스 설계

```typescript
// packages/actions/src/providers/hyperliquid/exchange-client.ts
export class HyperliquidExchangeClient {
  constructor(
    private readonly apiUrl: string,     // from Admin Settings
    private readonly rateLimiter: HyperliquidRateLimiter,
  ) {}

  // Exchange endpoint: POST /exchange
  async exchange(request: {
    action: Record<string, unknown>;
    nonce: number;
    signature: { r: Hex; s: Hex; v: number };
    vaultAddress?: Hex;
  }): Promise<ExchangeResponse> {
    await this.rateLimiter.acquire(1);  // weight=1 for exchange actions
    return this.post('/exchange', request, ExchangeResponseSchema);
  }

  // Info endpoint: POST /info
  async info<T>(request: InfoRequest, schema: z.ZodType<T>): Promise<T> {
    const weight = INFO_WEIGHTS[request.type] ?? 2;
    await this.rateLimiter.acquire(weight);
    return this.post('/info', request, schema);
  }

  private async post<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
    // native fetch + AbortController (10s timeout)
    // Zod schema.parse() on response
    // HL_API_ERROR on non-200
  }
}
```

### 2. Info API 요청 가중치 테이블

| Info type | Weight | 설명 |
|-----------|--------|------|
| clearinghouseState | 20 | Perp 포지션 + 잔액 |
| spotClearinghouseState | 20 | Spot 잔액 |
| openOrders | 20 | 오픈 주문 목록 |
| userFills | 20 | 최근 체결 내역 |
| meta | 2 | Perp 마켓 메타데이터 |
| spotMeta | 2 | Spot 마켓 메타데이터 |
| allMids | 2 | 모든 마켓 중간가 |
| fundingHistory | 2 | 펀딩 레이트 이력 |
| subAccounts | 20 | Sub-account 목록 + 잔액 |

### 3. Rate Limiter 설계

가중치 기반 rate limiter (Hyperliquid 공식: IP당 1200 weight/min):

```typescript
class HyperliquidRateLimiter {
  private totalWeight = 0;
  private windowStart = Date.now();
  private readonly maxWeightPerMin: number;  // default: 600 (보수적, 공식 1200의 50%)

  async acquire(weight: number): Promise<void> {
    const now = Date.now();
    if (now - this.windowStart > 60_000) {
      this.totalWeight = 0;
      this.windowStart = now;
    }
    if (this.totalWeight + weight > this.maxWeightPerMin) {
      const waitMs = 60_000 - (now - this.windowStart);
      await new Promise(resolve => setTimeout(resolve, waitMs));
      this.totalWeight = 0;
      this.windowStart = Date.now();
    }
    this.totalWeight += weight;
  }
}
```

`maxWeightPerMin`은 Admin Settings `HYPERLIQUID_RATE_LIMIT_WEIGHT_PER_MIN`으로 런타임 조정 가능.

### 4. HyperliquidMarketData 설계

Info API 래퍼 (read-only, 파이프라인 밖에서 사용):

```typescript
class HyperliquidMarketData {
  constructor(private readonly client: HyperliquidExchangeClient) {}

  // 파이프라인 없이 직접 호출 (MCP query tools, Admin UI)
  async getPositions(walletAddress: Hex, subAccount?: Hex): Promise<Position[]>
  async getOpenOrders(walletAddress: Hex, subAccount?: Hex): Promise<OpenOrder[]>
  async getMarkets(): Promise<MarketMeta[]>
  async getSpotMarkets(): Promise<SpotMarketMeta[]>
  async getFundingHistory(market: string, startTime: number): Promise<FundingRate[]>
  async getAllMidPrices(): Promise<Record<string, string>>
  async getAccountState(walletAddress: Hex): Promise<ClearinghouseState>
  async getSpotState(walletAddress: Hex): Promise<SpotClearinghouseState>
  async getSubAccounts(walletAddress: Hex): Promise<SubAccountState[]>
  async getUserFills(walletAddress: Hex, limit?: number): Promise<Fill[]>
}
```

### 5. 컴포넌트 의존성 그래프

```
HyperliquidRateLimiter
  |
HyperliquidExchangeClient (Exchange + Info 래핑)
  |
  +-- HyperliquidSigner (EIP-712 서명만 담당, ExchangeClient 미사용)
  |
  +-- HyperliquidMarketData (Info API read-only 래핑)
  |
  +-- HyperliquidPerpProvider (resolve: Signer.signL1Action -> Client.exchange)
  |     uses: Signer, Client, MarketData (가격 조회)
  |
  +-- HyperliquidSpotProvider (resolve: Signer.signL1Action -> Client.exchange)
  |     uses: Signer, Client, MarketData
  |
  +-- HyperliquidSubAccountService (Signer.signUserSignedAction -> Client.exchange)
        uses: Signer, Client
```

### 6. 신규 의존성

| 패키지 | 버전 | 용도 | 기존 의존성 여부 |
|--------|------|------|----------------|
| @msgpack/msgpack | ^3.0.0 | phantom agent 서명의 msgpack 직렬화 | 신규 (0 transitive deps) |
| viem | ^2.21.0 | signTypedData, keccak256, parseSignature | 기존 |

파일 구조:

```
packages/actions/src/providers/hyperliquid/
  config.ts              -- API endpoints, rate limits, defaults, Admin Settings keys
  schemas.ts             -- Zod input schemas for all actions + API response schemas
  exchange-client.ts     -- HyperliquidExchangeClient
  signer.ts              -- HyperliquidSigner (signL1Action + signUserSignedAction)
  market-data.ts         -- HyperliquidMarketData
  perp-provider.ts       -- HyperliquidPerpProvider : IPerpProvider
  spot-provider.ts       -- HyperliquidSpotProvider : IActionProvider
  sub-account-service.ts -- Sub-account CRUD + transfer
  index.ts               -- Re-exports + registerHyperliquidProviders()
```

---

## 설계 확정: HDESIGN-04 Sub-account 매핑 모델

### 1. Sub-account-to-Wallet 매핑 모델

```
WAIaaS Wallet (EVM, hyperevm-mainnet)
  |-- publicKey: 0xMaster... (Hyperliquid master account = EVM 지갑 주소)
  |-- [hyperliquid_sub_accounts]
  |     |-- sub_account_address: 0xSub1... (name: "Trend Following")
  |     |-- sub_account_address: 0xSub2... (name: "Mean Reversion")
  |-- [정책 적용 범위]: master + 모든 sub-accounts 합산
```

핵심 설계 결정:
- 1 WAIaaS Wallet = 1 Hyperliquid Master Account + N Sub-accounts
- Sub-account는 별도 WAIaaS 지갑으로 생성하지 않음 (private key 없음, master 서명으로 동작)
- Sub-account는 `hyperliquid_sub_accounts` 테이블에 메타데이터로 저장
- action params의 `subAccount` 필드로 대상 sub-account 지정 (생략 시 master)
- Signer의 `vaultAddress` 파라미터로 sub-account 주소 전달

### 2. Sub-account 생성 제약

- Hyperliquid 정책: $100K 거래량 이상의 계정만 sub-account 생성 가능
- Testnet에서는 제약 없을 수 있음 (Phase 351 착수 시 검증)
- 생성 시 User-Signed Action 서명 (`signUserSignedAction('CreateSubAccount', ...)`)
- 생성 후 Hyperliquid가 sub-account 주소를 반환 -> DB에 저장

### 3. Sub-account 간 자금 이동 정책

- Master -> Sub-account (Deposit): User-Signed Action 'SubAccountTransfer'
- Sub-account -> Master (Withdraw): User-Signed Action 'SubAccountTransfer'
- 두 방향 모두 정책 엔진 SPENDING_LIMIT 평가 대상 (자금 이동이므로 TRANSFER와 동일 취급)
- 정책 평가 기준: 이체 금액 (USD)
- Sub-account 간 직접 이체는 Hyperliquid API에서 미지원 -> master 경유 필수

---

## 설계 확정: HDESIGN-07 정책 엔진 적용 방안

### 1. 정책 평가 기준 테이블

| 액션 유형 | 정책 평가 금액 기준 | 산출 방식 | 근거 |
|-----------|-------------------|-----------|------|
| Perp 주문 (open) | Margin 금액 | size * price / leverage | 실제 위험 노출 = 증거금. Notional은 레버리지로 인해 과대 평가 가능 |
| Perp 주문 (close) | $0 (면제) | - | 포지션 청산은 위험 감소 행위, 지출 아님 |
| Spot 주문 (buy) | 주문 총액 | size * price | Spot은 레버리지 없으므로 notional = 실제 지출 |
| Spot 주문 (sell) | $0 (면제) | - | 기존 자산 매도는 지출 아님 |
| 레버리지 변경 | $0 (면제) | - | 설정 변경이지 지출 아님 |
| 주문 취소 | $0 (면제) | - | 지출 아님 |
| Sub-account 이체 | 이체 금액 | amount (USD) | 자금 이동은 TRANSFER와 동일 |
| USDC 입금/출금 | 입출금 금액 | amount (USD) | 외부 자금 이동 |

### 2. riskLevel + defaultTier 매핑

| 액션 | riskLevel | defaultTier | 근거 |
|------|-----------|-------------|------|
| hl_open_position | high | APPROVAL | 레버리지 포지션 오픈은 고위험 |
| hl_close_position | medium | DELAY | 포지션 청산은 중위험 (위험 감소 행위이나 실행 결과 확인 필요) |
| hl_place_order | high | APPROVAL | 지정가 주문도 체결 시 포지션 오픈과 동일 |
| hl_cancel_order | low | INSTANT | 주문 취소는 위험 감소 |
| hl_set_leverage | medium | DELAY | 레버리지 변경은 위험 프로파일 변경 |
| hl_set_margin_mode | medium | DELAY | 마진 모드 변경은 청산 조건 변경 |
| hl_spot_buy | medium | DELAY | Spot 구매는 레버리지 없어 중위험 |
| hl_spot_sell | low | INSTANT | Spot 매도는 저위험 |
| hl_sub_transfer | medium | DELAY | 내부 자금 이동은 중위험 |
| hl_create_sub_account | medium | DELAY | 계정 구조 변경 |

### 3. 정책 금액 추출 로직 설계

ActionProviderRegistry가 `resolve()` 호출 전에 금액을 추출하는 로직:

```typescript
// HyperliquidPerpProvider 내부
getSpendingAmount(actionName: string, params: Record<string, unknown>): {
  amount: bigint;  // USD 기준 (6 decimals, USDC)
  asset: string;   // 'USDC' (Hyperliquid는 USDC settlement)
} {
  switch (actionName) {
    case 'hl_open_position': {
      const size = parseFloat(params.size as string);
      const price = parseFloat(params.price as string || midPrice); // market order시 midPrice 사용
      const leverage = params.leverage as number || 1;
      const margin = (size * price) / leverage;
      return { amount: BigInt(Math.ceil(margin * 1e6)), asset: 'USDC' };
    }
    case 'hl_close_position':
    case 'hl_cancel_order':
    case 'hl_set_leverage':
    case 'hl_set_margin_mode':
      return { amount: 0n, asset: 'USDC' };  // 면제
    case 'hl_spot_buy': {
      const size = parseFloat(params.size as string);
      const price = parseFloat(params.price as string || midPrice);
      return { amount: BigInt(Math.ceil(size * price * 1e6)), asset: 'USDC' };
    }
    case 'hl_spot_sell':
      return { amount: 0n, asset: 'USDC' };  // 면제
    case 'hl_sub_transfer':
      return { amount: BigInt(Math.ceil(parseFloat(params.amount as string) * 1e6)), asset: 'USDC' };
  }
}
```

### 4. 정책 적용 범위

- SPENDING_LIMIT: master wallet 단위로 합산 (모든 sub-account 포함)
- TOKEN_SPENDING_LIMIT: USDC 기준 (Hyperliquid settlement currency)
- Sub-account별 독립 한도는 지원하지 않음 (WAIaaS 정책은 wallet 단위)
- Default-deny: SPENDING_LIMIT 미설정 시 Hyperliquid 액션 거부 (기존 default-deny 정책)

---

## 기술적 고려사항

1. **파이프라인 분기**: Hyperliquid L1 거래는 온체인 TX가 아닌 API 콜이므로 기존 6-stage 파이프라인과 다른 플로우 필요. 별도 `HyperliquidExchangeClient` 또는 Stage 5 분기로 처리.
2. **서명 방식**: EIP-712 typed data signing — 기존 `EvmAdapter.signTypedData` 활용 가능.
3. **discriminatedUnion 타입**: L1 API 거래는 기존 8-type (TRANSFER/TOKEN_TRANSFER/CONTRACT_CALL/APPROVE/BATCH/SIGN/X402_PAYMENT/NFT_TRANSFER) 어디에도 직접 매핑되지 않음. SIGN type 재활용 또는 신규 type 도입 여부를 Phase 2 설계에서 확정.
4. **정책 엔진 적용**: API 기반 거래에 기존 정책(지출 한도, 토큰별 한도)을 적용하려면 금액 환산 로직 필요. Phase 2 설계에서 정책 매핑 방안 확정.
5. **WebSocket**: 실시간 주문/포지션 업데이트를 위한 WebSocket 연결 관리 필요. Phase 2 설계에서 필요성과 범위를 확정하고, 구현 Phase(3/4) 또는 별도 Phase로 배정.
6. **Rate Limiting**: Hyperliquid API rate limit 준수 (기존 RPC Pool 패턴 참고).
7. **Testnet 지원**: Hyperliquid testnet(api.hyperliquid-testnet.xyz) 환경 분리.
8. **DB 마이그레이션**: Sub-account 매핑, 주문 이력 등에 필요한 테이블 추가 시 incremental ALTER TABLE 방식 준수 (현재 DB v50 기준, v51부터 할당).
9. **Admin Settings / UI**: API endpoint, rate limit 등 런타임 설정은 Admin Settings로 노출. 포지션/주문 현황은 Admin UI에 표시.

---

## 테스트 항목

- HyperEVM 체인 등록 및 기존 EVM 지갑 호환 테스트
- EIP-712 서명 생성/검증 테스트
- Perp 주문 CRUD (mock API) 테스트
- Spot 주문 CRUD (mock API) 테스트
- Sub-account 생성/이동 테스트
- MCP 도구 + SDK 메서드 통합 테스트
- 에러 핸들링 (API 에러, rate limit, insufficient margin 등)
- 정책 엔진 적용 테스트 (API 기반 거래에 지출 한도/토큰별 한도 적용 검증)
- Admin Settings 저장/로드 및 런타임 반영 테스트
- Admin UI 컴포넌트 테스트 (포지션/주문 현황, Sub-account 관리 표시)
