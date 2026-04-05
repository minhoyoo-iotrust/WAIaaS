# Phase 271: Yield 프레임워크 설계 - Research

**Researched:** 2026-02-26
**Domain:** DeFi yield tokenization protocol interface design (Pendle V2 focus)
**Confidence:** HIGH

## Summary

Phase 271 designs the IYieldProvider interface, YieldPosition/MaturityInfo types, and MaturityMonitor integration for yield tokenization protocols, specifically targeting Pendle V2 as the first implementation (m29-06). The design phase produces only design document sections (added to m29-00-defi-advanced-protocol-design.md), no implementation code.

The research establishes that this phase closely mirrors the Phase 270 Lending framework pattern: IYieldProvider extends IActionProvider with 5 yield-specific actions and 3 query methods, just as ILendingProvider extends IActionProvider with 4 lending actions and 3 query methods. The key differentiator is maturity management -- yield positions have a deterministic expiration date (unlike lending positions which are open-ended), requiring tight integration with Phase 269's MaturityMonitor (already fully designed in section 10.2 of m29-00).

**Primary recommendation:** Follow the ILendingProvider pattern exactly (sections 13-17 of m29-00), adapting for yield-specific semantics: 5 actions (buyPT/buyYT/redeemPT/addLiquidity/removeLiquidity), 3 query methods (getMarkets/getPosition/getYieldForecast), YieldPosition/MaturityInfo/YieldMarketInfo Zod schemas, and Pendle V2 protocol mapping via Hosted SDK + Router contract.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| YIELD-01 | IYieldProvider 인터페이스가 buyPT/buyYT/redeemPT/addLiquidity/removeLiquidity 5개 표준 액션을 정의한다 | Pendle Router contract functions map directly: swapExactTokenForPt, swapExactTokenForYt, redeemPyToToken, addLiquiditySingleToken, removeLiquiditySingleToken. IActionProvider extends pattern from Phase 270 DEC-LEND-01. |
| YIELD-02 | getMarkets/getPosition/getYieldForecast 3개 조회 메서드가 정의된다 | Pendle Backend API provides: GET /v1/markets/all (market listing), GET /v1/dashboard/positions/database/{user} (positions), GET /v2/{chainId}/markets/{address}/data (APY/maturity data for yield forecasting). Follow DEC-LEND-02 pattern. |
| YIELD-03 | YieldPosition Zod 스키마가 token_type(PT/YT/LP), market_id, maturity, apy를 포함한다 | Phase 268 already defined YieldMetadataSchema with tokenType, marketId, maturity, apy, entryPrice. YIELD-03 requires API-response-level schema (like LendingPositionSummarySchema in section 14.1) extending this base. |
| YIELD-04 | MaturityInfo 타입이 만기일, 경과 시간, 상환 가능 여부를 정의한다 | Pendle maturity model: pre-maturity needs PT+YT for redemption, post-maturity needs PT only. MaturityInfo type captures maturityEpoch, daysRemaining, isRedeemable (post-maturity check), isExpired. |
| YIELD-05 | MaturityMonitor가 1일 1회 폴링으로 만기 7일/1일 전 알림과 미상환 경고를 설계한다 | Phase 269 section 10.2 already fully designed MaturityMonitor class with evaluate() logic, 3-tier severity (WARNING 7d, DANGER 1d, CRITICAL post-maturity), MATURITY_WARNING event. Phase 271 confirms integration and adds any yield-framework-specific adjustments. |
| YIELD-06 | positions 테이블의 Yield 카테고리 확장 스키마가 정의된다 | Phase 268 section 5.3 already defined YieldMetadataSchema and YieldPositionSchema as part of discriminatedUnion. YIELD-06 confirms completeness and documents any additional fields needed for Pendle-specific data (e.g., SY token address, underlying asset). |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | 3.x | Schema SSoT for YieldPosition/MaturityInfo/YieldMarketInfo | Project convention (CLAUDE.md: Zod SSoT) |
| @waiaas/core | current | IActionProvider interface, ContractCallRequest types | Project base package |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Pendle Hosted SDK API | v2 | Transaction payload generation via GET /v2/sdk/{chainId}/convert | Implementation phase (m29-06), referenced in protocol mapping |
| Pendle Backend API | v2 | Market data, positions, APY via api-v2.pendle.finance | Implementation phase (m29-06), referenced in protocol mapping |
| Pendle Router Contract | V3 (IPAllActionV3) | On-chain operations: swapExactTokenForPt, redeemPyToToken, etc. | Implementation phase (m29-06), referenced in protocol mapping |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Pendle Hosted SDK (REST API) | @pendle/sdk-v2 npm package | Hosted SDK is simpler (single HTTP endpoint), stays in sync with Pendle UI, no version dependency. npm SDK requires manual version management. Design should support both. |
| Direct Router contract calls | Hosted SDK convert endpoint | Router requires ABI encoding + complex parameter structures (ApproxParams). Hosted SDK handles routing and optimization. Design should map both paths. |

**Installation (implementation phase only, not this design phase):**
```bash
# No new packages needed for design phase
# Implementation (m29-06) will use HTTP client for Pendle API
```

## Architecture Patterns

### Recommended Design Document Structure

This phase adds sections to the existing `internal/objectives/m29-00-defi-advanced-protocol-design.md`:

```
Section 18: IYieldProvider 인터페이스
  18.1: 인터페이스 정의 (extends IActionProvider)
  18.2: ActionDefinition 5개 (buyPT/buyYT/redeemPT/addLiquidity/removeLiquidity)
  18.3: IPositionProvider 동시 구현 패턴
  18.4: 설계 결정

Section 19: YieldPosition + MaturityInfo 타입
  19.1: YieldPositionSummary Zod 스키마 (API 응답용)
  19.2: MaturityInfo 타입
  19.3: YieldMarketInfo 타입
  19.4: YieldForecast 타입
  19.5: 설계 결정

Section 20: MaturityMonitor 통합 + Pendle 프로토콜 매핑
  20.1: MaturityMonitor ↔ IYieldProvider 연동 설계
  20.2: positions 테이블 YIELD 카테고리 확장 검증
  20.3: Pendle V2 프로토콜 매핑 (Router + Hosted SDK → IYieldProvider)
  20.4: 설계 결정
```

### Pattern 1: IYieldProvider extends IActionProvider (same as ILendingProvider)

**What:** IYieldProvider inherits resolve() from IActionProvider and adds 3 yield-specific query methods
**When to use:** All yield protocol providers (Pendle, future yield tokenization protocols)
**Source:** Phase 270, DEC-LEND-01 establishes this pattern

```typescript
// Following Phase 270 section 13.1 pattern exactly
export interface IYieldProvider extends IActionProvider {
  /** 사용 가능한 yield 시장 목록 */
  getMarkets(chain: string, network?: string): Promise<YieldMarketInfo[]>;

  /** 지갑의 현재 yield 포지션 조회 */
  getPosition(walletId: string, context: ActionContext): Promise<YieldPositionSummary[]>;

  /** 시장의 수익률 예측 */
  getYieldForecast(marketId: string, context: ActionContext): Promise<YieldForecast>;
}
```

### Pattern 2: Dual Interface Implementation (IYieldProvider + IPositionProvider)

**What:** Same class implements both IYieldProvider (for pipeline/API) and IPositionProvider (for PositionTracker)
**When to use:** All yield provider implementations
**Source:** Phase 270, section 13.3 (AaveV3Provider dual implementation)

```typescript
// Following Phase 270 section 13.3 pattern
class PendleProvider implements IYieldProvider, IPositionProvider {
  // IActionProvider (via IYieldProvider)
  readonly metadata: ActionProviderMetadata = { name: 'pendle', ... };
  readonly actions: readonly ActionDefinition[] = [...]; // 5 actions
  async resolve(actionName, params, context): Promise<ContractCallRequest | ContractCallRequest[]> { ... }

  // IYieldProvider query methods
  async getMarkets(chain, network?): Promise<YieldMarketInfo[]> { ... }
  async getPosition(walletId, context): Promise<YieldPositionSummary[]> { ... }
  async getYieldForecast(marketId, context): Promise<YieldForecast> { ... }

  // IPositionProvider (PositionTracker integration)
  async getPositions(walletId): Promise<PositionUpdate[]> { ... }
  getProviderName(): string { return 'pendle'; }
  getSupportedCategories(): PositionCategory[] { return ['YIELD']; }
}
```

### Pattern 3: Pendle Hosted SDK as Primary Integration Path

**What:** Use Pendle's Hosted SDK (single REST endpoint) for transaction payload generation rather than direct ABI encoding
**When to use:** Pendle implementation (m29-06)
**Source:** Pendle V2 docs, api-v2.pendle.finance

```typescript
// Pendle Hosted SDK: single endpoint for all operations
// GET https://api-v2.pendle.finance/core/v2/sdk/{chainId}/convert
// Parameters: tokensIn, amountsIn, tokensOut, receiver, slippage, enableAggregator

// resolve() maps IYieldProvider actions to Hosted SDK convert calls:
// buyPT:           tokensIn=[underlying], tokensOut=[PT address]
// buyYT:           tokensIn=[underlying], tokensOut=[YT address]
// redeemPT:        tokensIn=[PT address], tokensOut=[underlying] (post-maturity)
// addLiquidity:    tokensIn=[underlying], tokensOut=[LP address]
// removeLiquidity: tokensIn=[LP address], tokensOut=[underlying]
```

### Anti-Patterns to Avoid

- **Separate position table for yield:** Phase 268 already defined YIELD as a category in the unified defi_positions table with YieldMetadataSchema. Do not create a separate yield_positions table.
- **Custom maturity monitoring:** Phase 269 section 10.2 already fully designed MaturityMonitor. Do not redesign it -- instead confirm the integration points.
- **Health factor for yield positions:** Yield positions do not have a health factor concept. Do not conflate lending health factor monitoring with yield maturity monitoring. MaturityMonitor uses MATURITY_WARNING event (DEC-MON-06), not LIQUIDATION_IMMINENT.
- **Overloading IYieldProvider with protocol specifics:** The interface must remain protocol-agnostic. Pendle-specific details (SY tokens, pyIndex, vePENDLE) belong in the PendleProvider implementation, not in IYieldProvider.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| APY calculation | Custom APY formula from PT price/maturity | Pendle Backend API market data (implied APY, underlying APY) | APY calculation involves complex AMM math (geometric mean oracle); Pendle's API already computes this |
| Transaction routing | Custom SY->PT swap path | Pendle Hosted SDK convert endpoint | Handles aggregator routing, optimal path selection, slippage protection |
| Maturity monitoring | New monitor class | Phase 269 MaturityMonitor (section 10.2) | Already fully designed with 3-tier severity, cooldown, evaluate() logic |
| Position schema | New Zod schema from scratch | Phase 268 YieldMetadataSchema + YieldPositionSchema | Already in discriminatedUnion; extend for API response (like LendingPositionSummarySchema) |

**Key insight:** Phase 271 is a design phase. The output is design document sections, not code. The prior phases (268, 269) already established all shared infrastructure -- this phase defines the yield-specific interface and type layer on top.

## Common Pitfalls

### Pitfall 1: Confusing DB Metadata Schema vs API Response Schema

**What goes wrong:** Mixing up YieldMetadataSchema (Phase 268, for defi_positions.metadata JSON column) with YieldPositionSummary (Phase 271, for API/AI agent response).
**Why it happens:** Both describe yield positions but serve different purposes. Phase 268 designed the storage schema; Phase 271 designs the presentation schema.
**How to avoid:** Follow the exact split from Phase 270: LendingMetadataSchema (section 5.3, DB storage) vs LendingPositionSummarySchema (section 14.1, API response). YieldPositionSummary adds human-readable fields (symbol, marketName, underlyingAsset) that the DB metadata doesn't store.
**Warning signs:** If YieldPositionSummary looks identical to YieldMetadataSchema, the API response is missing human-readable context.

### Pitfall 2: Ignoring Pendle's SY (Standardized Yield) Layer

**What goes wrong:** Designing IYieldProvider actions as if users directly trade PT/YT with underlying tokens, ignoring the SY intermediary.
**Why it happens:** The user-facing description says "buy PT with ETH" but internally Pendle routes through SY: ETH -> SY -> PT.
**How to avoid:** IYieldProvider actions accept underlying tokens as input (user-facing simplicity), but the protocol mapping documents the full SY routing path. The Hosted SDK convert endpoint handles this routing transparently.
**Warning signs:** If the design requires users to explicitly manage SY tokens, the abstraction is leaking.

### Pitfall 3: Missing Pre-Maturity vs Post-Maturity Redemption Distinction

**What goes wrong:** Designing a single "redeem" action without accounting for pre-maturity (requires PT+YT) vs post-maturity (PT only).
**Why it happens:** Pendle's redemption flow changes at maturity.
**How to avoid:** The redeemPT action should document both paths. For AI agents, the post-maturity path (PT-only redemption) is the primary use case. Pre-maturity redemption (PT+YT) is an advanced operation that could be a separate action or handled via the same action with automatic detection.
**Warning signs:** If the action schema doesn't have a way to indicate whether YT is also being provided.

### Pitfall 4: Overcomplicating Yield Forecast

**What goes wrong:** Trying to implement complex yield curve prediction in the framework design.
**Why it happens:** "getYieldForecast" sounds like it needs predictive analytics.
**How to avoid:** Keep it simple: getYieldForecast returns current implied APY, underlying APY, and fixed APY for a given market based on Pendle API data. It's a data query, not a prediction engine. The AI agent uses this to make decisions.
**Warning signs:** If the YieldForecast type includes complex statistical fields like confidence intervals or Monte Carlo outputs.

### Pitfall 5: Inconsistent Section Numbering in Design Doc

**What goes wrong:** Using section numbers that conflict with existing sections in m29-00.
**Why it happens:** The design doc already has sections 5-17 from Phases 268-270.
**How to avoid:** Phase 271 adds sections 18-20 (continuing from Phase 270's sections 13-17). Check the current last section number before writing.
**Warning signs:** The file has duplicate section numbers.

## Code Examples

Verified patterns from existing codebase:

### ActionDefinition Schema Pattern (from LidoStakingActionProvider)

```typescript
// Source: packages/actions/src/providers/lido-staking/index.ts
// Phase 271 will define 5 ActionDefinitions following this pattern:
this.actions = [
  {
    name: 'buy_pt',
    description: 'Buy Principal Token (PT) for a yield market. Fixed yield until maturity.',
    chain: 'ethereum', // Pendle is EVM-only (Ethereum, Arbitrum)
    inputSchema: BuyPTInputSchema,
    riskLevel: 'medium',
    defaultTier: 'DELAY',
  },
  // ... 4 more actions
] as const;
```

### Zod Discriminated Union Extension (from Phase 268 section 5.3)

```typescript
// Source: m29-00 section 5.3 (Phase 268 design)
// YieldMetadataSchema is already defined in discriminatedUnion:
export const YieldMetadataSchema = z.object({
  tokenType: z.enum(['PT', 'YT', 'LP']),
  marketId: z.string(),
  maturity: z.number().int(),  // epoch seconds
  apy: z.number().nullable(),
  entryPrice: z.number().nullable(),
});

export const YieldPositionSchema = BasePositionSchema.extend({
  category: z.literal('YIELD'),
  metadata: YieldMetadataSchema,
});
```

### MaturityMonitor Evaluate Pattern (from Phase 269 section 10.2)

```typescript
// Source: m29-00 section 10.2 (Phase 269 design)
// MaturityMonitor already handles YIELD positions:
evaluate(position: DefiPositionRow): MonitorEvaluation | null {
  if (position.category !== 'YIELD' || position.status !== 'ACTIVE') return null;
  const metadata = JSON.parse(position.metadata ?? '{}');
  const maturityEpoch = metadata.maturity;
  // ... severity: WARNING (7d), DANGER (1d), CRITICAL (post-maturity)
}
```

### ILendingProvider Pattern to Mirror (from Phase 270 section 13.1)

```typescript
// Source: m29-00 section 13.1 (Phase 270 design)
// IYieldProvider should follow same structure:
export interface ILendingProvider extends IActionProvider {
  getPosition(walletId: string, context: ActionContext): Promise<LendingPositionSummary[]>;
  getHealthFactor(walletId: string, context: ActionContext): Promise<HealthFactor>;
  getMarkets(chain: string, network?: string): Promise<MarketInfo[]>;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Direct Pendle Router ABI calls | Pendle Hosted SDK (REST API convert endpoint) | Pendle V2 API launch | Simplifies integration: single endpoint, automatic routing, aggregator support |
| @pendle/sdk-v2 npm package | Hosted SDK preferred for new integrations | Pendle docs recommendation | Hosted SDK stays in sync with UI, no version management overhead |
| Separate per-protocol position tables | Unified defi_positions with discriminatedUnion | Phase 268 (2026-02-26) | All yield positions in same table as lending/perp/staking |
| Custom maturity tracking | IDeFiMonitor-based MaturityMonitor | Phase 269 (2026-02-26) | Standard monitoring framework, shared lifecycle management |

**Deprecated/outdated:**
- Pendle V1 SDK (@pendle/sdk): Replaced by V2 architecture with SY/PT/YT model
- Stable interest rate in Aave (interestRateMode=1): Largely deprecated, relevant context for understanding yield tokenization of aToken yields

## Open Questions

1. **Pendle chain support scope for IYieldProvider**
   - What we know: Pendle V2 is deployed on Ethereum mainnet, Arbitrum, BNB Chain, Optimism, Mantle. WAIaaS currently supports Ethereum (EVM) and Solana.
   - What's unclear: Should IYieldProvider's `getMarkets(chain, network?)` scope be limited to Ethereum/Arbitrum initially, or designed for multi-chain from the start?
   - Recommendation: Design for multi-chain (same as ILendingProvider), but Pendle protocol mapping only covers EVM chains. The interface stays chain-agnostic; PendleProvider specifies its supported chains in metadata.

2. **LP position token_type scope**
   - What we know: Pendle LP positions (providing liquidity to PT/SY markets) are a distinct position type from PT and YT holdings.
   - What's unclear: Should LP positions track impermanent loss? LP rewards (PENDLE token incentives)?
   - Recommendation: YieldMetadataSchema already has tokenType: 'LP'. Design the LP variant to track basic position data (amount, market, maturity, APY). Impermanent loss and reward tracking can be added in implementation phase via additional metadata fields.

3. **redeemPT pre-maturity handling**
   - What we know: Post-maturity redemption needs only PT. Pre-maturity needs PT+YT together.
   - What's unclear: Should IYieldProvider expose a separate redeemPY (pre-maturity) action, or handle it within redeemPT based on maturity check?
   - Recommendation: Single redeemPT action with automatic pre/post-maturity handling. Implementation checks maturity timestamp and routes accordingly. This keeps the AI agent interface simple (5 actions, not 6).

## Sources

### Primary (HIGH confidence)
- Phase 268 section 5.3: YieldMetadataSchema, YieldPositionSchema, defi_positions discriminatedUnion -- verified by reading m29-00
- Phase 269 section 10.2: MaturityMonitor full design (evaluate logic, 3-tier severity, MATURITY_WARNING event) -- verified by reading m29-00
- Phase 270 sections 13-17: ILendingProvider pattern (extends IActionProvider, dual interface, Zod schemas, policy, protocol mapping) -- verified by reading m29-00
- IActionProvider interface: packages/core/src/interfaces/action-provider.types.ts -- verified by reading source
- LidoStakingActionProvider: packages/actions/src/providers/lido-staking/index.ts -- verified by reading source

### Secondary (MEDIUM confidence)
- Pendle V2 API docs (api-v2.pendle.finance/core/docs): Market listing, positions, Hosted SDK convert endpoint -- verified via WebFetch of Swagger docs
- Pendle Router SDK class: swapExactTokenForPt, addLiquiditySingleToken, redeemPyToToken methods -- verified via WebFetch of API reference
- Pendle V2 Yield Tokenization contracts: mintPY, redeemPY, redeemDueInterestAndRewards, pyIndexCurrent -- verified via WebFetch of official docs
- Pendle APY model: Implied APY = 1/(1+APY)^(time_to_maturity) -- verified via WebSearch from multiple sources

### Tertiary (LOW confidence)
- Pendle rate limits: 100 CU/minute free tier -- from WebFetch of API docs, needs validation during implementation
- Pendle multi-chain deployment list (Ethereum, Arbitrum, BNB, Optimism, Mantle) -- from WebSearch, needs verification at implementation time

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Using existing project patterns (IActionProvider, Zod SSoT) with well-documented Pendle V2 API
- Architecture: HIGH - Directly mirrors Phase 270 ILendingProvider pattern, which is already designed and validated
- Pitfalls: HIGH - Based on actual Pendle protocol mechanics (SY layer, maturity redemption rules) and verified codebase patterns
- Protocol mapping: MEDIUM - Pendle API endpoints verified via Swagger docs, but exact parameter schemas need implementation-time validation

**Research date:** 2026-02-26
**Valid until:** 2026-03-28 (30 days - stable domain, design-only phase)
