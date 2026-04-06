# Phase 272: Perp 프레임워크 설계 - Research

**Researched:** 2026-02-26
**Domain:** Perpetual futures trading framework design (IPerpProvider interface, margin/leverage policy, MarginMonitor integration, Drift Protocol mapping)
**Confidence:** HIGH

## Summary

Phase 272 designs the IPerpProvider framework for perpetual futures trading, following the exact patterns established by Phase 270 (ILendingProvider) and Phase 271 (IYieldProvider). The primary target implementation is Drift Protocol on Solana. The framework must define 5 standard actions (openPosition/closePosition/modifyPosition/addMargin/withdrawMargin), 3 query methods (getPosition/getMarginInfo/getMarkets), Zod type schemas for PerpPosition and MarginInfo, a PerpPolicyEvaluator with leverage/position-size/market-whitelist policies, and MarginMonitor integration from Phase 269.

The research confirms that this is primarily a design-pattern mirroring exercise: IPerpProvider extends IActionProvider (same as ILendingProvider/IYieldProvider), uses the dual-interface pattern with IPositionProvider, and integrates with the existing PolicyEngine at step 4h. The unique aspects are: (1) perp-specific policy types (max leverage, max position size USD, market whitelist), (2) MarginMonitor integration with the dual margin-ratio + liquidation-price check designed in Phase 269 section 10.3, and (3) Drift Protocol SDK mapping. Drift's TypeScript SDK (`@drift-labs/sdk`) provides `placePerpOrder`, `closePosition`, `modifyPerpOrder`, `deposit`, `withdraw`, and comprehensive `User` methods for position/margin queries. Additionally, Drift offers a self-hosted Rust Gateway with REST endpoints that could serve as an alternative integration path.

**Primary recommendation:** Mirror the ILendingProvider/IYieldProvider pattern exactly for interface structure and policy design, use `@drift-labs/sdk` as the primary integration path (not Gateway), and add sections 21-23 to the m29-00 design document.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PERP-01 | IPerpProvider 인터페이스가 openPosition/closePosition/modifyPosition/addMargin/withdrawMargin 5개 표준 액션을 정의한다 | ILendingProvider/IYieldProvider extends IActionProvider 패턴 미러링. Drift SDK 메서드 매핑: placePerpOrder, closePosition, modifyPerpOrder, deposit, withdraw |
| PERP-02 | getPosition/getMarginInfo/getMarkets 3개 조회 메서드가 정의된다 | Drift SDK User 클래스: getPerpPosition, getLeverage, getFreeCollateral, getUnrealizedPNL + DriftClient.getPerpMarketAccounts() |
| PERP-03 | PerpPosition Zod 스키마가 direction(LONG/SHORT), leverage, unrealized_pnl, liquidation_price를 포함한다 | Phase 268 PerpMetadataSchema 확장. Drift PerpPosition.baseAssetAmount (positive=LONG, negative=SHORT), User.getLeverage(), User.getUnrealizedPNL() |
| PERP-04 | MarginInfo 타입이 유지 마진, 사용 마진, 가용 마진을 정의한다 | Drift User 메서드: getTotalCollateral(), getMarginRequirement() (initial/maintenance), getFreeCollateral(). Gateway: GET /v2/user/marginInfo, GET /v2/collateral |
| PERP-05 | PerpPolicyEvaluator가 최대 레버리지 제한 규칙을 정의한다 | LendingPolicyEvaluator의 LENDING_LTV_LIMIT 패턴 미러링 → PERP_LEVERAGE_LIMIT. PolicyEngine step 4h-c |
| PERP-06 | 최대 포지션 크기(USD) 정책과 허용 시장 화이트리스트가 정의된다 | PERP_POSITION_SIZE_LIMIT + PERP_MARKET_WHITELIST. LENDING_ASSET_WHITELIST의 default-deny 패턴 재사용 |
| PERP-07 | MarginMonitor가 1분 간격 폴링으로 유지 마진 임계값 접근 시 경고를 설계한다 | Phase 269 section 10.3 MarginMonitor 이미 설계 완료. Phase 272에서는 IPerpProvider↔MarginMonitor 데이터 플로우 명세 + PerpMetadata 완전성 검증 |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@drift-labs/sdk` | ~2.158.x | Drift Protocol V2 TypeScript SDK | Official SDK, comprehensive DriftClient + User methods for perp trading, position queries, margin calculations |
| `zod` | 3.x (existing) | Schema validation SSoT | Project standard - all schemas derive from Zod |
| `viem` | 2.x (existing) | Not used for Drift (Solana-only) but referenced for cross-chain pattern consistency | Project standard for EVM |
| `@solana/kit` | 6.x (existing) | Solana transaction construction | Project standard for Solana chain |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@drift-labs/sdk` User class | - | Position queries, margin calculations, leverage | getPosition, getMarginInfo implementation |
| Drift Gateway (Rust) | - | Self-hosted REST API wrapper | Alternative integration path if SDK direct integration proves problematic (not primary) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @drift-labs/sdk direct | Drift Gateway (REST) | Gateway requires self-hosting a Rust binary, adds infrastructure complexity. SDK is direct Solana program calls, no extra service. WAIaaS daemon already handles Solana connections. Gateway is better for standalone REST apps but redundant when SDK is available |

**Installation:** Not applicable for this design phase. Implementation milestone (m29-08) will add: `npm install @drift-labs/sdk`

## Architecture Patterns

### Recommended Document Structure (sections 21-23 in m29-00)

```
Section 21: IPerpProvider 인터페이스
  21.1: 인터페이스 정의 (extends IActionProvider + 3 query methods)
  21.2: ActionDefinition 5개 (open/close/modify/addMargin/withdrawMargin)
  21.3: IPositionProvider 동시 구현 패턴
  21.4: 설계 결정

Section 22: PerpPosition + MarginInfo 타입
  22.1: PerpPositionSummary Zod 스키마 (API 응답용)
  22.2: MarginInfo 타입
  22.3: PerpMarketInfo 타입
  22.4: 설계 결정

Section 23: PerpPolicyEvaluator + MarginMonitor 통합 + Drift 프로토콜 매핑
  23.1: PERP_LEVERAGE_LIMIT 정책 타입
  23.2: PERP_POSITION_SIZE_LIMIT 정책 타입
  23.3: PERP_MARKET_WHITELIST 정책 타입
  23.4: PolicyEngine 통합 지점 (step 4h-c~e)
  23.5: MarginMonitor ↔ IPerpProvider 데이터 플로우
  23.6: Drift V2 프로토콜 매핑
  23.7: 설계 결정
```

### Pattern 1: IPerpProvider extends IActionProvider

**What:** IPerpProvider interface inherits from IActionProvider, adding 3 perp-specific query methods. Mirrors ILendingProvider (section 13.1) and IYieldProvider (section 18.1) exactly.

**When to use:** Always -- this is the locked pattern for all DeFi provider interfaces.

**Example:**
```typescript
// Source: Phase 270 ILendingProvider pattern + Phase 272 perp adaptation
import type { IActionProvider, ActionContext } from './action-provider.types.js';

export interface IPerpProvider extends IActionProvider {
  /** 지갑의 현재 perp 포지션 조회 (시장별 포지션 상세) */
  getPosition(walletId: string, context: ActionContext): Promise<PerpPositionSummary[]>;

  /** 지갑의 마진 정보 조회 (총 마진, 사용 마진, 가용 마진, 유지 마진) */
  getMarginInfo(walletId: string, context: ActionContext): Promise<MarginInfo>;

  /** 사용 가능한 perp 시장 목록 조회 */
  getMarkets(chain: string, network?: string): Promise<PerpMarketInfo[]>;
}
```

### Pattern 2: Dual Interface Implementation (IPerpProvider + IPositionProvider)

**What:** Same class implements both IPerpProvider (for API/pipeline) and IPositionProvider (for PositionTracker). Mirrors AaveV3Provider and PendleProvider patterns.

**When to use:** Every perp provider implementation (DriftProvider for m29-08).

**Example:**
```typescript
// Source: Phase 270 section 13.3 dual interface pattern
class DriftProvider implements IPerpProvider, IPositionProvider {
  // IActionProvider (via IPerpProvider)
  readonly metadata: ActionProviderMetadata = { name: 'drift', ... };
  readonly actions: readonly ActionDefinition[] = [...];
  async resolve(actionName, params, context): Promise<ContractCallRequest | ContractCallRequest[]> { ... }

  // IPerpProvider query methods
  async getPosition(walletId, context): Promise<PerpPositionSummary[]> { ... }
  async getMarginInfo(walletId, context): Promise<MarginInfo> { ... }
  async getMarkets(chain, network?): Promise<PerpMarketInfo[]> { ... }

  // IPositionProvider (PositionTracker)
  async getPositions(walletId): Promise<PositionUpdate[]> { ... }
  getProviderName(): string { return 'drift'; }
  getSupportedCategories(): PositionCategory[] { return ['PERP']; }
}
```

### Pattern 3: PerpPolicyEvaluator (3 policy types)

**What:** Three new policy types in DatabasePolicyEngine: PERP_LEVERAGE_LIMIT (max leverage), PERP_POSITION_SIZE_LIMIT (max USD notional), PERP_MARKET_WHITELIST (allowed markets, default-deny). Follows LendingPolicyEvaluator pattern from section 15.

**When to use:** Step 4h in policy evaluation pipeline, after lending policies (4h-a, 4h-b).

**Example:**
```typescript
// Source: Phase 270 section 15.1 LendingLtvLimitRules pattern
const PerpLeverageLimitRulesSchema = z.object({
  maxLeverage: z.number().min(1).max(100)
    .describe('Maximum allowed leverage (e.g., 10 = 10x)'),
  warningLeverage: z.number().min(1).max(100)
    .describe('Warning threshold — forces DELAY tier for human review'),
});
```

### Pattern 4: MarginMonitor Data Flow (Monitor reads DB, not Provider)

**What:** MarginMonitor (Phase 269 section 10.3) reads from defi_positions table cache. IPerpProvider updates positions via PositionTracker. No direct MarginMonitor → IPerpProvider dependency. Mirrors MaturityMonitor ↔ IYieldProvider (section 20.1).

**When to use:** Always -- DEC-MON-03 locks this pattern (monitors read DB cache, never make direct RPC calls).

### Anti-Patterns to Avoid

- **Adding a new discriminatedUnion type for perp actions:** Use ContractCallRequest.metadata `{ actionProvider: 'drift', actionName: 'open_position' }` to identify perp actions. Do NOT add a 6th type to the 5-type union (DEC-LEND-09).
- **Coupling MarginMonitor directly to IPerpProvider:** Monitors read from defi_positions DB cache only (DEC-MON-03). The provider populates the cache via PositionTracker.
- **Using Drift Gateway as primary integration:** The SDK (`@drift-labs/sdk`) provides direct Solana program calls. Gateway adds an unnecessary Rust service dependency for a daemon that already manages Solana connections.
- **Using bigint for amount fields in API responses:** Use string for JSON serialization compatibility (DEC-LEND-06 precedent).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Perp margin calculations | Custom margin math | Drift SDK `User.getTotalCollateral()`, `User.getMarginRequirement()`, `User.getFreeCollateral()` | Protocol-specific margin weights, oracle prices, cross-margin calculations are complex and protocol-defined |
| Liquidation price estimation | Custom price calculation | Drift SDK maintenance margin formula: `maintenance_collateral < maintenance_margin_requirement` | Cross-margined positions require summing weighted collateral across all positions |
| Order parameter construction | Manual instruction building | Drift SDK `getMarketOrderParams()`, `getLimitOrderParams()`, `convertToPerpPrecision()` | Precision handling (BASE_PRECISION=1e9, PRICE_PRECISION=1e6) is error-prone |
| Market index lookup | Hardcoded index mapping | Drift SDK `PerpMarkets[env]` registry | Market indices change across environments (mainnet vs devnet) |
| PnL settlement | Custom settlement logic | Drift SDK `settlePNL()`, `settleFundingPayment()` | Funding rate payments and PnL settlement are protocol-specific |

**Key insight:** Perp protocols have complex cross-margin math that depends on protocol-specific parameters (margin weights, oracle TWAPs, insurance fund). Always delegate calculations to the protocol's SDK rather than reimplementing.

## Common Pitfalls

### Pitfall 1: Confusing Drift's order-based model with position-based actions
**What goes wrong:** Drift doesn't have explicit "openPosition" / "closePosition" instructions. All position changes happen through orders (placePerpOrder, modifyPerpOrder, cancelOrder). Opening a LONG = placing a BUY order. Closing a LONG = placing a SELL order for the same size.
**Why it happens:** Other perp protocols (e.g., GMX) have explicit open/close instructions.
**How to avoid:** IPerpProvider.resolve('open_position') must internally translate to `driftClient.placePerpOrder()` with appropriate direction. resolve('close_position') must fetch current position size and place an opposing order. The interface abstracts the order-based model into position-based semantics.
**Warning signs:** If the design references a Drift "openPosition" instruction directly -- it doesn't exist.

### Pitfall 2: Ignoring cross-margin implications
**What goes wrong:** Drift uses cross-margin by default (all perp positions share the same collateral pool). A new position affects the margin available for all existing positions.
**Why it happens:** Isolated margin mental model (each position has its own margin).
**How to avoid:** MarginInfo must reflect the aggregate account state, not per-position margin. PERP_LEVERAGE_LIMIT policy should check account-level leverage, not per-position.
**Warning signs:** MarginInfo schema has per-position margin fields without aggregate account fields.

### Pitfall 3: Precision handling errors
**What goes wrong:** Drift uses BN (big number) with specific precision constants: BASE_PRECISION (1e9) for base amounts, PRICE_PRECISION (1e6) for prices, MARGIN_PRECISION (1e4) for margin ratios.
**Why it happens:** Mixing up precisions or using raw numbers without conversion.
**How to avoid:** Always use Drift SDK conversion helpers: `convertToPerpPrecision()`, `convertToPricePrecision()`. Document precision in PerpMarketInfo type.
**Warning signs:** Numbers being off by 1e3 or 1e6 in test assertions.

### Pitfall 4: Not accounting for sub-accounts
**What goes wrong:** Drift supports sub-accounts (up to 128 per authority). Position queries may miss positions on non-default sub-accounts.
**Why it happens:** Assuming single-account model.
**How to avoid:** Design should specify sub-account handling policy. For v29-08, start with sub-account 0 only (default). Document as known limitation.
**Warning signs:** Position count mismatch between WAIaaS and Drift UI.

### Pitfall 5: MarginMonitor threshold mismatch with PerpMetadataSchema
**What goes wrong:** MarginMonitor (Phase 269 section 10.3) reads `metadata.margin`, `metadata.liquidationPrice`, `metadata.leverage` from defi_positions. If PerpMetadataSchema doesn't populate these fields correctly, monitoring fails silently.
**Why it happens:** DB schema and monitor code designed in different phases.
**How to avoid:** Verify that Phase 268 PerpMetadataSchema fields exactly match what MarginMonitor.evaluate() reads. Cross-reference section 10.3 code with section 5.3 Zod schema.
**Warning signs:** MarginMonitor returning null for all PERP positions.

## Code Examples

### Drift SDK: Opening a Perpetual Position
```typescript
// Source: https://drift-labs.github.io/v2-teacher/ (official docs)
import { DriftClient, OrderType, PositionDirection } from '@drift-labs/sdk';

const orderParams = {
  orderType: OrderType.MARKET,
  marketIndex: 0,  // SOL-PERP
  direction: PositionDirection.LONG,
  baseAssetAmount: driftClient.convertToPerpPrecision(100), // 100 SOL
  auctionStartPrice: driftClient.convertToPricePrecision(21.20),
  auctionEndPrice: driftClient.convertToPricePrecision(21.30),
  price: driftClient.convertToPricePrecision(21.35), // limit price
  auctionDuration: 60, // slots
};
await driftClient.placePerpOrder(orderParams);
```

### Drift SDK: Closing a Position
```typescript
// Source: https://drift-labs.github.io/v2-teacher/
// closePosition is a convenience method on DriftClient
await driftClient.closePosition(0); // marketIndex 0 = SOL-PERP

// Alternatively, manually place opposing order:
const position = user.getPerpPosition(0);
if (position && !position.baseAssetAmount.isZero()) {
  await driftClient.placePerpOrder({
    orderType: OrderType.MARKET,
    marketIndex: 0,
    direction: position.baseAssetAmount.gt(new BN(0))
      ? PositionDirection.SHORT  // Close LONG
      : PositionDirection.LONG,  // Close SHORT
    baseAssetAmount: position.baseAssetAmount.abs(),
  });
}
```

### Drift SDK: Querying Margin Info
```typescript
// Source: https://drift-labs.github.io/v2-teacher/
const user = driftClient.getUser();
const totalCollateral = user.getTotalCollateral();      // Total collateral value
const marginRequirement = user.getMarginRequirement();  // Maintenance margin requirement
const freeCollateral = user.getFreeCollateral();         // Available margin
const leverage = user.getLeverage();                     // Current leverage
const unrealizedPnl = user.getUnrealizedPNL();          // Unrealized PnL
```

### Drift SDK: Deposit/Withdraw Margin
```typescript
// Source: https://drift-labs.github.io/protocol-v2/sdk/classes/DriftClient.html
// Deposit USDC as margin
const marketIndex = 0; // USDC spot market
const amount = driftClient.convertToSpotPrecision(marketIndex, 100); // $100
await driftClient.deposit(amount, marketIndex, associatedTokenAccount);

// Withdraw margin
await driftClient.withdraw(amount, marketIndex, associatedTokenAccount);
```

### Drift SDK: Market Discovery
```typescript
// Source: https://drift-labs.github.io/protocol-v2/sdk/classes/DriftClient.html
const perpMarkets = driftClient.getPerpMarketAccounts(); // All perp markets
const solPerp = driftClient.getPerpMarketAccount(0);     // SOL-PERP specifically
const oracleData = await driftClient.getOracleDataForPerpMarket(0); // Oracle price
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Drift V1 (isolated margin) | Drift V2 (cross-margin default, sub-accounts) | 2023 | All position/margin calculations are cross-margined by default |
| Direct program calls | @drift-labs/sdk DriftClient | Ongoing | SDK abstracts Solana instruction complexity |
| No Gateway | Self-hosted Rust Gateway (REST API) | 2024+ | Alternative HTTP-based integration, but SDK is still primary |

**Deprecated/outdated:**
- Drift V1 SDK: Replaced by V2. All current development is on protocol-v2
- `interestRateMode=1` (stable): Not applicable to perp (this is a lending concept from Aave)

## Open Questions

1. **Drift sub-account strategy**
   - What we know: Drift supports up to 128 sub-accounts per authority. Sub-account 0 is default.
   - What's unclear: Should WAIaaS support multiple sub-accounts per wallet, or restrict to sub-account 0?
   - Recommendation: Design for sub-account 0 only in v29-08. Document as extensibility point for future. The design should not preclude future sub-account support.

2. **Drift Gateway vs SDK for WAIaaS**
   - What we know: Gateway is a self-hosted Rust binary with REST API. SDK is direct TypeScript integration. Gateway replaces SDK for HTTP-based apps.
   - What's unclear: Previously flagged in STATE.md as "Drift Gateway 자체 호스팅 요구사항 미평가"
   - Recommendation: Use SDK directly (not Gateway). WAIaaS daemon already manages Solana connections and transaction signing. Gateway adds unnecessary infrastructure (Rust binary deployment). Resolve STATE.md research flag.

3. **Cross-margin impact on PERP_LEVERAGE_LIMIT policy**
   - What we know: Drift cross-margin means one position's leverage affects all others.
   - What's unclear: Should PERP_LEVERAGE_LIMIT check per-position leverage or account-level leverage?
   - Recommendation: Check account-level leverage (consistent with how Drift calculates margin). Per-position leverage is misleading in cross-margin.

## Drift Protocol Mapping Summary

**Key DriftClient methods mapped to IPerpProvider:**

| IPerpProvider Action | Drift SDK Method | Notes |
|---------------------|------------------|-------|
| `open_position` | `driftClient.placePerpOrder(orderParams)` | Direction + baseAssetAmount. No explicit "open" instruction |
| `close_position` | `driftClient.closePosition(marketIndex)` | Convenience method, or manual opposing order |
| `modify_position` | `driftClient.modifyPerpOrder(orderParams, orderId)` | Atomic cancel+place. For position resize: place additional/reducing order |
| `add_margin` | `driftClient.deposit(amount, marketIndex, ata)` | Deposit USDC (spot market 0) as collateral |
| `withdraw_margin` | `driftClient.withdraw(amount, marketIndex, ata)` | Withdraw excess collateral |

| IPerpProvider Query | Drift SDK Method | Notes |
|--------------------|------------------|-------|
| `getPosition(walletId)` | `user.getPerpPosition(marketIndex)` | Per-market. Loop all markets for full list |
| `getMarginInfo(walletId)` | `user.getTotalCollateral()` + `user.getMarginRequirement()` + `user.getFreeCollateral()` | Aggregate account-level |
| `getMarkets(chain)` | `driftClient.getPerpMarketAccounts()` | Full market list with oracle data |

**Drift-specific concepts:**
- BASE_PRECISION = 1e9 (base asset amounts)
- PRICE_PRECISION = 1e6 (prices)
- MARGIN_PRECISION = 1e4 (margin ratios)
- Market index 0 = SOL-PERP, index 1 = BTC-PERP (env-dependent)
- Cross-margin by default (all positions share collateral pool)
- Sub-account 0 is default, up to 128 sub-accounts per authority

## Sources

### Primary (HIGH confidence)
- Phase 268 summary (268-01-SUMMARY.md) -- positions table schema, PerpMetadataSchema, PositionTracker
- Phase 269 summaries (269-01, 269-02) -- IDeFiMonitor, MarginMonitor (section 10.3), notification events
- Phase 270 summaries (270-01, 270-02) -- ILendingProvider pattern, LendingPolicyEvaluator, protocol mapping pattern
- Phase 271 summaries (271-01, 271-02) -- IYieldProvider pattern, MaturityMonitor integration pattern
- m29-00 design document sections 5-20 -- existing infrastructure and framework designs
- IActionProvider source code (`packages/core/src/interfaces/action-provider.types.ts`) -- base interface

### Secondary (MEDIUM confidence)
- [Drift SDK Documentation](https://docs.drift.trade/sdk-documentation) -- SDK overview and setup
- [DriftClient API](https://drift-labs.github.io/protocol-v2/sdk/classes/DriftClient.html) -- Full method listing with signatures
- [Drift v2-teacher](https://drift-labs.github.io/v2-teacher/) -- Integration examples, order params, precision constants
- [Drift Gateway](https://github.com/drift-labs/gateway) -- Self-hosted REST API alternative
- [@drift-labs/sdk npm](https://www.npmjs.com/package/@drift-labs/sdk) -- Package version ~2.158.x

### Tertiary (LOW confidence)
- Drift sub-account support (128 max) -- referenced in docs but exact behavior with WAIaaS wallet model needs validation during implementation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- Drift SDK is well-documented, IActionProvider pattern is locked
- Architecture: HIGH -- Mirrors Phase 270/271 patterns exactly, MarginMonitor already designed in Phase 269
- Pitfalls: HIGH -- Drift order-based model vs position-based abstraction is well-understood from docs
- Drift mapping: MEDIUM -- SDK method signatures verified from official docs, but precision/sub-account details need implementation-time validation

**Research date:** 2026-02-26
**Valid until:** 2026-03-26 (30 days -- stable design patterns, Drift SDK is mature)
