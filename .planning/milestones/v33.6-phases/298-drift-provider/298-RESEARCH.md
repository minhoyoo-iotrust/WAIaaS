# Phase 298: Drift Provider - Research

**Researched:** 2026-03-02
**Domain:** DeFi Perp Trading (Drift Protocol V2) on Solana
**Confidence:** HIGH

## Summary

Phase 298은 Drift Protocol V2를 위한 DriftPerpProvider를 `@waiaas/actions` 패키지에 구현한다. IPerpProvider + IPositionProvider를 동시 구현하며, 5개 액션(open_position, close_position, modify_position, add_margin, withdraw_margin)과 3개 쿼리 메서드(getPosition, getMarginInfo, getMarkets)를 제공한다.

핵심 기술 과제는 `@drift-labs/sdk`가 `@solana/web3.js` 1.x (`Connection`, `PublicKey`, `Keypair`, BN)에 의존하는 반면, WAIaaS 코드베이스는 `@solana/kit` 6.x를 사용한다는 점이다. 기존 Kamino 패턴(IDriftSdkWrapper 인터페이스 + MockDriftSdkWrapper)으로 SDK를 완전히 격리하여 타입 오염을 방지한다. `@drift-labs/sdk`는 `@waiaas/actions`의 optional dependency로 추가하며, 실제 SDK wrapper 구현은 lazy import로 런타임에만 로드된다.

**Primary recommendation:** Kamino 패턴을 정확히 미러링하여 IDriftSdkWrapper 인터페이스로 SDK를 격리. Mock wrapper로 unit test. DriftInstruction 중간 타입으로 `@solana/web3.js` 1.x 타입이 provider 레벨에 노출되지 않도록 차단.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DRIFT-01 | DriftPerpProvider open_position | m29-00 섹션 21.2 + 23.6 매핑 (placePerpOrder), ActionDefinition high/APPROVAL |
| DRIFT-02 | DriftPerpProvider close_position (percentage for partial close) | m29-00 섹션 23.6 (closePosition/reducing order), ActionDefinition medium/DELAY |
| DRIFT-03 | DriftPerpProvider modify_position | m29-00 섹션 23.6 (modifyPerpOrder), ActionDefinition high/APPROVAL |
| DRIFT-04 | DriftPerpProvider add_margin/withdraw_margin | m29-00 섹션 23.6 (deposit/withdraw), low/AUTO + medium/DELAY |
| DRIFT-05 | DriftSdkWrapper abstracting @drift-labs/sdk | Kamino IKaminoSdkWrapper 패턴 검증, IDriftSdkWrapper 인터페이스 설계 |
| DRIFT-06 | DriftMarketData market list, funding rates, oracle prices | m29-00 섹션 23.6 쿼리 매핑 (getPerpMarketAccounts + getOracleDataForPerpMarket) |
| DRIFT-07 | DriftPerpProvider market/limit orders (limitPrice parameter) | m29-00 섹션 21.2 OpenPositionInputSchema.orderType + limitPrice |
| DRIFT-08 | @solana/web3.js 1.x and @solana/kit 6.x compatibility isolation | IDriftSdkWrapper 경계에서 타입 변환, DriftInstruction 중간 타입 |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @drift-labs/sdk | ~2.158.x | Drift V2 DriftClient, User, OrderParams | 공식 SDK, 직접 Solana 프로그램 호출 (DEC-PERP-14) |
| @solana/web3.js | 1.98.x | @drift-labs/sdk 내부 의존 (Connection, PublicKey, BN) | drift SDK의 transitive dependency |
| @coral-xyz/anchor | 0.29.0 | @drift-labs/sdk 내부 의존 | drift SDK가 Anchor 기반 |
| bn.js | ^5.x | Drift SDK 정밀도 상수 (BASE_PRECISION, PRICE_PRECISION) | Drift의 모든 수치가 BN 타입 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | ^3.24 | Input schema 정의 (Zod SSoT) | 모든 액션 입력 스키마 |
| @waiaas/core | workspace:* | IPerpProvider, IPositionProvider, ContractCallRequest, ChainError | 인터페이스 및 타입 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @drift-labs/sdk 직접 사용 | Drift Gateway (Rust) | Gateway는 별도 바이너리 배포 필요, 불필요한 인프라 복잡도 (DEC-PERP-14) |
| Instruction 직접 빌드 | Jito 패턴처럼 수동 인코딩 | Drift 인스트럭션이 너무 복잡 (주문 파라미터, AMM 계산, 오라클 통합) -- SDK 필수 |

**Installation:**
```bash
# @drift-labs/sdk는 @waiaas/actions의 optional dependency로 추가
cd packages/actions
pnpm add @drift-labs/sdk --save-optional
```

## Architecture Patterns

### Recommended Project Structure
```
packages/actions/src/providers/drift/
  config.ts                    # DriftConfig 타입, 프로그램 ID, 기본값, 시장 상수
  schemas.ts                   # 5개 액션 Zod 입력 스키마 (Zod SSoT)
  drift-sdk-wrapper.ts         # IDriftSdkWrapper 인터페이스 + MockDriftSdkWrapper + DriftSdkWrapper
  drift-market-data.ts         # DriftMarketData 클래스 (시장 목록, 펀딩 레이트, 오라클)
  index.ts                     # DriftPerpProvider (IPerpProvider + IPositionProvider)
  __tests__/
    drift-provider.test.ts     # Provider 유닛 테스트 (Mock 사용)
    drift-sdk-wrapper.test.ts  # Wrapper 인터페이스 테스트
    drift-market-data.test.ts  # 시장 데이터 테스트
```

### Pattern 1: SDK Wrapper Isolation (Kamino 패턴 미러링)
**What:** IDriftSdkWrapper 인터페이스로 @drift-labs/sdk를 완전 격리. Provider는 이 인터페이스에만 의존.
**When to use:** 외부 SDK가 @solana/web3.js 1.x에 의존할 때
**Example:**
```typescript
// Source: packages/actions/src/providers/kamino/kamino-sdk-wrapper.ts 패턴
/** Drift instruction result (converted from TransactionInstruction). */
export interface DriftInstruction {
  programId: string;
  /** Base64-encoded instruction data. */
  instructionData: string;
  accounts: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
}

/** Abstraction over @drift-labs/sdk for testability and type isolation. */
export interface IDriftSdkWrapper {
  buildOpenPositionInstruction(params: {
    market: string;
    direction: 'LONG' | 'SHORT';
    size: string;
    orderType: 'MARKET' | 'LIMIT';
    limitPrice?: string;
    walletAddress: string;
  }): Promise<DriftInstruction[]>;

  buildClosePositionInstruction(params: {
    market: string;
    size?: string;   // partial close amount
    walletAddress: string;
  }): Promise<DriftInstruction[]>;

  buildModifyPositionInstruction(params: {
    market: string;
    newSize?: string;
    newLimitPrice?: string;
    walletAddress: string;
  }): Promise<DriftInstruction[]>;

  buildDepositInstruction(params: {
    amount: string;
    asset: string;
    walletAddress: string;
  }): Promise<DriftInstruction[]>;

  buildWithdrawInstruction(params: {
    amount: string;
    asset: string;
    walletAddress: string;
  }): Promise<DriftInstruction[]>;

  /** Get all perp positions for a wallet. */
  getPositions(walletAddress: string): Promise<DriftPosition[]>;

  /** Get account-level margin info. */
  getMarginInfo(walletAddress: string): Promise<DriftMarginInfo>;

  /** Get all available perp markets. */
  getMarkets(): Promise<DriftMarketInfo[]>;
}
```

### Pattern 2: Instruction-to-ContractCallRequest Conversion
**What:** DriftInstruction[] -> ContractCallRequest[] 변환 (Kamino의 instructionsToRequests 패턴)
**When to use:** resolve() 반환 시
**Example:**
```typescript
// Source: packages/actions/src/providers/kamino/index.ts 패턴
function instructionsToRequests(
  instructions: DriftInstruction[],
  driftProgramId: string,
): ContractCallRequest[] {
  return instructions.map((ix) => ({
    type: 'CONTRACT_CALL' as const,
    to: driftProgramId,
    programId: ix.programId,
    instructionData: ix.instructionData,
    accounts: ix.accounts,
    network: 'solana-mainnet' as const,
  }));
}
```

### Pattern 3: Order-Based to Position-Based Abstraction
**What:** Drift의 주문 기반 모델을 포지션 기반 시맨틱스로 추상화 (DEC-PERP-16)
**When to use:** open_position/close_position/modify_position resolve에서
**Example:**
```typescript
// DriftSdkWrapper 내부에서 SDK 호출 시:
// open_position(LONG, size=100) -> placePerpOrder({ direction: LONG, baseAssetAmount: 100 })
// close_position(SOL-PERP)      -> closePosition(marketIndex) or reverse order
// modify_position(newSize=50)   -> calculate delta, place reducing/adding order
```

### Pattern 4: Provider + PositionProvider Dual Implementation
**What:** IPerpProvider + IPositionProvider 동시 구현 (Kamino 패턴)
**When to use:** 항상. PositionTracker 연동 필수.
**Example:**
```typescript
// Source: packages/actions/src/providers/kamino/index.ts line 98
export class DriftPerpProvider implements IPerpProvider, IPositionProvider {
  // IPerpProvider (from IActionProvider)
  readonly metadata: ActionProviderMetadata;
  readonly actions: readonly ActionDefinition[];
  async resolve(...): Promise<ContractCallRequest | ContractCallRequest[]> { ... }
  async getPosition(walletId: string, context: ActionContext): Promise<PerpPositionSummary[]> { ... }
  async getMarginInfo(walletId: string, context: ActionContext): Promise<MarginInfo> { ... }
  async getMarkets(chain: string, network?: string): Promise<PerpMarketInfo[]> { ... }

  // IPositionProvider (PositionTracker sync)
  async getPositions(walletId: string): Promise<PositionUpdate[]> { ... }
  getProviderName(): string { return 'drift'; }
  getSupportedCategories(): PositionCategory[] { return ['PERP']; }
}
```

### Pattern 5: registerBuiltInProviders 통합
**What:** `@waiaas/actions/src/index.ts`에 DriftPerpProvider를 등록 팩토리에 추가
**When to use:** 프로바이더 등록 시
**Example:**
```typescript
// In registerBuiltInProviders() providers array:
{
  key: 'drift',
  enabledKey: 'actions.drift_enabled',
  factory: () => {
    const config: DriftConfig = {
      enabled: true,
      rpcUrl: settingsReader.get('actions.drift_rpc_url') || '',
      subAccount: 0,
    };
    return new DriftPerpProvider(config);
  },
},
```

### Anti-Patterns to Avoid
- **@solana/web3.js 타입 노출 금지:** IDriftSdkWrapper 인터페이스의 모든 파라미터와 반환값은 plain JS 타입(string, number, boolean)만 사용. PublicKey, BN, Connection은 wrapper 내부에서만 사용.
- **직접 SDK import 금지:** Provider(index.ts)에서 `@drift-labs/sdk`를 직접 import하지 않음. 오직 IDriftSdkWrapper를 통해서만 접근.
- **raw BN 값 직접 사용 금지:** Drift의 BASE_PRECISION(1e9), PRICE_PRECISION(1e6), MARGIN_PRECISION(1e4) 변환 함수 항상 사용.
- **포지션별 마진 비율 계산 금지:** cross-margin 모델에서 계정 수준 집계만 의미 있음 (DEC-PERP-04).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Perp order instruction 인코딩 | 수동 Borsh 직렬화 | @drift-labs/sdk DriftClient | Drift 인스트럭션은 AMM 상태, 오라클 계정, 사용자 계정 등 수십 개의 계정 주소 해결 필요 |
| BN 정밀도 변환 | 직접 BigInt 산술 | SDK 내장 convertToNumber(), BASE_PRECISION | Drift의 정밀도 상수는 비표준 (1e9, 1e6, 1e4) |
| PDA 계산 (Drift 사용자 계정) | 수동 derivation | SDK의 getUserAccountPublicKey() | sub-account, authority 조합이 복잡 |
| 시장 인덱스-심볼 매핑 | 하드코딩 매핑 테이블 | SDK의 PerpMarkets 레지스트리 | 시장 추가/제거 시 자동 반영 |
| 오라클 가격 디코딩 | Pyth/Switchboard 직접 파싱 | SDK의 getOracleDataForPerpMarket() | 오라클 프로바이더별 디코딩 로직이 다름 |

**Key insight:** Drift는 다른 DeFi 프로토콜(Jito, Lido)과 달리 인스트럭션이 극도로 복잡하여 수동 빌드가 실질적으로 불가능. SDK wrapper가 유일한 합리적 접근.

## Common Pitfalls

### Pitfall 1: @solana/web3.js 1.x 타입 오염
**What goes wrong:** @drift-labs/sdk의 PublicKey, BN, Connection 타입이 provider 코드로 누출되어 @solana/kit 6.x 타입과 충돌
**Why it happens:** TypeScript가 동일 이름의 다른 타입을 혼동 (예: @solana/web3.js PublicKey vs @solana/kit address)
**How to avoid:** IDriftSdkWrapper 경계에서 모든 Solana 타입을 string으로 변환. wrapper 내부에서만 web3.js 타입 사용.
**Warning signs:** `Cannot assign to type 'Address'` 또는 `Type 'PublicKey' is not assignable` 에러

### Pitfall 2: BN 정밀도 손실
**What goes wrong:** Drift의 BN 값을 Number로 변환할 때 정밀도 손실 (JavaScript Number는 2^53까지만 안전)
**Why it happens:** BASE_PRECISION(1e9) * 큰 금액 = 2^53 초과 가능
**How to avoid:** DriftInstruction 단계에서 모든 수치를 string으로 변환. wrapper 내부에서만 BN 사용. `convertToNumber()` 후 즉시 `.toString()`.
**Warning signs:** 큰 포지션 크기에서 예상과 다른 숫자

### Pitfall 3: Order-Based 모델 혼동
**What goes wrong:** open_position을 단순 주문으로 매핑하면 기존 포지션에 추가/감소가 됨
**Why it happens:** Drift에는 명시적 "open" 명령이 없음 -- 모든 포지션 변경이 주문
**How to avoid:** 기존 포지션 조회 후 의도에 맞는 주문 방향 결정. close_position은 반대 방향 주문 또는 편의 메서드 사용.
**Warning signs:** "포지션이 두 배가 됐다" 또는 "포지션이 반대로 바뀌었다"

### Pitfall 4: Cross-Margin 계정 수준 위험
**What goes wrong:** 하나의 포지션 개설이 다른 모든 포지션의 청산 위험을 증가시킴
**Why it happens:** Drift는 모든 포지션이 하나의 담보 풀 공유 (cross-margin)
**How to avoid:** MarginInfo는 항상 계정 수준으로 조회. add_margin/withdraw_margin은 시장과 무관하게 계정 수준에서 동작.
**Warning signs:** 특정 포지션 마진이 충분해 보이지만 계정 전체가 청산 위험

### Pitfall 5: Sub-Account 0 가정
**What goes wrong:** 다른 sub-account에 있는 포지션을 조회하지 못함
**Why it happens:** v29-08 범위에서는 sub-account 0만 사용 (DEC-PERP-15)
**How to avoid:** config에 subAccount=0 하드코딩. 미래 확장을 위해 인터페이스는 subAccount 파라미터 추가 가능하도록 설계.
**Warning signs:** 사용자가 Drift UI에서 sub-account 1에 포지션을 만들면 WAIaaS에서 보이지 않음

### Pitfall 6: DriftClient 구독 관리
**What goes wrong:** DriftClient.subscribe()를 호출하지 않으면 계정 데이터가 stale
**Why it happens:** Drift SDK는 폴링(BulkAccountLoader) 또는 웹소켓으로 계정 구독이 필요
**How to avoid:** DriftSdkWrapper 초기화 시 subscribe() 호출. 종료 시 unsubscribe(). daemon lifecycle에 맞춰 관리.
**Warning signs:** getPosition()이 빈 배열 반환하거나 오래된 데이터

## Code Examples

### ActionDefinition 5개 (from m29-00 design doc section 21.2)
```typescript
// Source: m29-00 design doc, DEC-PERP-03
const actions: readonly ActionDefinition[] = [
  {
    name: 'open_position',
    description: 'Open a leveraged perpetual position (LONG or SHORT) on Drift V2. Position direction and size determine effective leverage.',
    chain: 'solana',
    inputSchema: OpenPositionInputSchema,
    riskLevel: 'high',
    defaultTier: 'APPROVAL',
  },
  {
    name: 'close_position',
    description: 'Close a perpetual position (full or partial) on Drift V2. Full close settles all PnL.',
    chain: 'solana',
    inputSchema: ClosePositionInputSchema,
    riskLevel: 'medium',
    defaultTier: 'DELAY',
  },
  {
    name: 'modify_position',
    description: 'Modify position size or pending order limit price on Drift V2.',
    chain: 'solana',
    inputSchema: ModifyPositionInputSchema,
    riskLevel: 'high',
    defaultTier: 'APPROVAL',
  },
  {
    name: 'add_margin',
    description: 'Deposit collateral to increase available margin on Drift V2. Reduces liquidation risk.',
    chain: 'solana',
    inputSchema: AddMarginInputSchema,
    riskLevel: 'low',
    defaultTier: 'INSTANT',
  },
  {
    name: 'withdraw_margin',
    description: 'Withdraw excess collateral from Drift V2 margin account.',
    chain: 'solana',
    inputSchema: WithdrawMarginInputSchema,
    riskLevel: 'medium',
    defaultTier: 'DELAY',
  },
];
```

### Input Schemas (from m29-00 design doc section 21.2)
```typescript
// Source: m29-00 design doc, Zod SSoT
import { z } from 'zod';

export const OpenPositionInputSchema = z.object({
  market: z.string().min(1, 'market symbol required (e.g., "SOL-PERP")'),
  direction: z.enum(['LONG', 'SHORT']),
  size: z.string().min(1, 'base asset amount as string (e.g., "100")'),
  leverage: z.number().min(1).max(100).optional(),
  orderType: z.enum(['MARKET', 'LIMIT']),
  limitPrice: z.string().optional(),
}).refine(
  (d) => d.orderType !== 'LIMIT' || d.limitPrice !== undefined,
  { message: 'limitPrice is required for LIMIT orders', path: ['limitPrice'] },
);

export const ClosePositionInputSchema = z.object({
  market: z.string().min(1, 'market symbol required'),
  size: z.string().optional(), // omit for full close
});

export const ModifyPositionInputSchema = z.object({
  market: z.string().min(1, 'market symbol required'),
  newSize: z.string().optional(),
  newLimitPrice: z.string().optional(),
}).refine(
  (d) => d.newSize !== undefined || d.newLimitPrice !== undefined,
  { message: 'At least one of newSize or newLimitPrice is required' },
);

export const AddMarginInputSchema = z.object({
  amount: z.string().min(1, 'collateral amount required (e.g., "100")'),
  asset: z.string().min(1, 'CAIP-19 asset identifier required'),
});

export const WithdrawMarginInputSchema = z.object({
  amount: z.string().min(1, 'withdrawal amount required'),
  asset: z.string().min(1, 'CAIP-19 asset identifier required'),
});
```

### MockDriftSdkWrapper (테스트 패턴)
```typescript
// Source: packages/actions/src/providers/kamino/kamino-sdk-wrapper.ts MockKaminoSdkWrapper 패턴
export class MockDriftSdkWrapper implements IDriftSdkWrapper {
  async buildOpenPositionInstruction(params: {
    market: string;
    direction: 'LONG' | 'SHORT';
    size: string;
    orderType: 'MARKET' | 'LIMIT';
    limitPrice?: string;
    walletAddress: string;
  }): Promise<DriftInstruction[]> {
    return [{
      programId: DRIFT_PROGRAM_ID,
      instructionData: encodeMockInstructionData(0, params.size),
      accounts: [
        { pubkey: params.walletAddress, isSigner: true, isWritable: true },
        { pubkey: DRIFT_PROGRAM_ID, isSigner: false, isWritable: true },
      ],
    }];
  }
  // ... other methods with mock data
}
```

### PositionUpdate for PositionTracker (PERP category)
```typescript
// Source: packages/actions/src/providers/kamino/index.ts getPositions() 패턴
async getPositions(walletId: string): Promise<PositionUpdate[]> {
  const positions = await this.sdkWrapper.getPositions(walletId);
  const now = Math.floor(Date.now() / 1000);

  return positions.map((pos) => ({
    walletId,
    category: 'PERP' as const,
    provider: 'drift',
    chain: 'solana',
    network: 'solana-mainnet',
    assetId: null, // Perp positions -- assetId null is OK (m29-00 섹션 5.3)
    amount: pos.baseAssetAmount,
    amountUsd: pos.notionalValueUsd,
    metadata: {
      direction: pos.direction,
      leverage: pos.leverage,
      unrealizedPnl: pos.unrealizedPnl,
      liquidationPrice: pos.liquidationPrice,
      margin: pos.margin,
      entryPrice: pos.entryPrice,
      market: pos.market,
    },
    status: 'ACTIVE' as const,
    openedAt: now,
  }));
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| @solana/web3.js 1.x (Connection, PublicKey) | @solana/kit 6.x (functional pipe, address branded type) | 2024-2025 | WAIaaS는 kit 사용, drift-sdk는 아직 1.x. 격리 필수 |
| DriftClient v1 | DriftClient v2 (protocol-v2) | 2023 | v2 SDK만 지원. placePerpOrder API |
| Drift Gateway (Rust) | SDK 직접 사용 | DEC-PERP-14 | Gateway 불필요, SDK로 충분 |
| Isolated margin | Cross-margin 기본 | Drift V2 | account-level 마진 관리 (DEC-PERP-04) |

**Deprecated/outdated:**
- `DriftClient.closePosition()`: deprecated, `placePerpOrder` 또는 `placeAndTakePerpOrder` 사용 권장. 하지만 편의상 내부적으로 반대 방향 주문으로 구현 가능.
- Drift Gateway: 별도 Rust 바이너리, WAIaaS 아키텍처에 불필요 (DEC-PERP-14)

## Open Questions

1. **@drift-labs/sdk optional dependency 설치 전략**
   - What we know: `@waiaas/actions`는 현재 외부 Solana SDK 의존성 없음 (zod만). Kamino도 optional.
   - What's unclear: pnpm workspace에서 optional dependency 설치 시 다른 패키지에 영향 여부
   - Recommendation: `pnpm add @drift-labs/sdk --save-optional` 후 typecheck 확인. 문제 시 `devDependencies`로 이동하고 런타임 lazy import 유지.

2. **DriftClient 수명 관리**
   - What we know: DriftClient는 subscribe()/unsubscribe() 라이프사이클 필요 (WebSocket 또는 polling)
   - What's unclear: daemon hot-reload 시 DriftClient 재생성 비용
   - Recommendation: DriftSdkWrapper가 lazy-init 패턴으로 첫 사용 시 subscribe. unsubscribe는 daemon shutdown에 연동. SettingsService 변경 시 재초기화.

3. **add_margin defaultTier: AUTO vs INSTANT**
   - What we know: m29-00 설계 문서에서 add_margin은 "low" risk, defaultTier "AUTO"로 명시. 현재 IPerpProvider 인터페이스에서는 'INSTANT'가 ActionDefinition defaultTier 옵션에 없음.
   - What's unclear: ActionDefinitionSchema의 defaultTier enum이 'INSTANT' | 'NOTIFY' | 'DELAY' | 'APPROVAL'인지 확인 필요
   - Recommendation: PolicyTierEnum 확인 후 'INSTANT'이 있으면 사용, 없으면 'NOTIFY'로 대체 (가장 낮은 승인 수준).

## Sources

### Primary (HIGH confidence)
- m29-00 design doc sections 21-23: IPerpProvider 인터페이스, PerpPosition/MarginInfo 타입, PerpPolicyEvaluator, Drift 프로토콜 매핑 (18개 설계 결정 DEC-PERP-01~18)
- `packages/core/src/interfaces/perp-provider.types.ts`: IPerpProvider 인터페이스 정의 (Phase 297에서 생성)
- `packages/core/src/interfaces/action-provider.types.ts`: IActionProvider, ActionDefinition, ActionContext
- `packages/core/src/interfaces/position-provider.types.ts`: IPositionProvider, PositionUpdate
- `packages/actions/src/providers/kamino/`: SDK wrapper 패턴 참조 (IDriftSdkWrapper 설계 기반)
- `packages/actions/src/providers/jito-staking/`: Solana instruction 빌드 패턴 참조
- `packages/actions/src/index.ts`: registerBuiltInProviders() 통합 패턴
- `packages/core/src/schemas/transaction.schema.ts`: ContractCallRequestSchema (Solana fields)

### Secondary (MEDIUM confidence)
- [Drift SDK DriftClient API docs](https://drift-labs.github.io/protocol-v2/sdk/classes/DriftClient.html): placePerpOrder, closePosition, deposit, withdraw 시그니처
- [Drift SDK README](https://github.com/drift-labs/protocol-v2/blob/master/sdk/README.md): DriftClient 초기화, OrderParams, precision 상수
- [Drift SDK package.json](https://github.com/drift-labs/protocol-v2/blob/master/sdk/package.json): @solana/web3.js 1.98.0 의존성 확인

### Tertiary (LOW confidence)
- @drift-labs/sdk 2.158.x 버전: npm 최신 stable 버전 확인 필요 (현재 2.158.0-beta.0 확인)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - @drift-labs/sdk가 유일한 합리적 선택, 설계 문서에서 확정 (DEC-PERP-14)
- Architecture: HIGH - Kamino 패턴이 검증된 선행 사례, m29-00 설계 결정이 상세함
- Pitfalls: HIGH - 설계 문서에서 주요 위험 요소 명시, @solana/web3.js 격리는 기존 패턴 존재
- SDK API: MEDIUM - 공식 문서에서 확인했으나 실제 설치 후 타입 확인 필요

**Research date:** 2026-03-02
**Valid until:** 2026-04-01 (SDK API는 비교적 안정적, 30일)
