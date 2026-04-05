# Phase 270: Lending 프레임워크 설계 - Research

**Researched:** 2026-02-26
**Domain:** DeFi lending protocol framework design (ILendingProvider interface, LendingPosition/HealthFactor types, LendingPolicyEvaluator, REST API, Aave V3/Kamino/Morpho protocol mapping)
**Confidence:** HIGH

## Summary

Phase 270 designs the `ILendingProvider` framework that enables Aave V3, Kamino, and Morpho lending protocol implementations to be added as simple providers without modifying the framework itself. This is a **design-only** phase producing sections in the m29-00 design document. The deliverables are: (1) ILendingProvider interface extending IActionProvider with 4 action methods (supply/borrow/repay/withdraw) and 3 query methods (getPosition/getHealthFactor/getMarkets), (2) LendingPosition Zod schema and HealthFactor type, (3) LendingPolicyEvaluator integrated with the existing PolicyEngine, (4) REST API endpoint specifications for positions and health factor, and (5) protocol-specific interface mappings for all three target protocols.

The codebase already provides all building blocks needed. The `IActionProvider` interface in `@waiaas/core` defines the base contract (metadata, actions, resolve). Existing providers (LidoStaking, JitoStaking, JupiterSwap, ZeroExSwap, LiFi) demonstrate the resolve-to-ContractCallRequest pattern. Phase 268 established the `defi_positions` table with `LendingMetadataSchema` (positionType, apy, healthFactor, collateralUsd, debtUsd) and the `IPositionProvider` interface for PositionTracker integration. Phase 269 designed the `HealthFactorMonitor` with adaptive polling that reads from the defi_positions table. The `DatabasePolicyEngine` provides 9 existing policy types that the LendingPolicyEvaluator must integrate with via a new policy type or evaluator pattern.

The key design challenge is the protocol mapping: Aave V3 (EVM, well-documented Solidity ABI with `supply`/`borrow`/`repay`/`withdraw`/`getUserAccountData`), Kamino (Solana, TypeScript SDK `@kamino-finance/klend-sdk` with `KaminoMarket`/`KaminoAction`/`KaminoObligation` classes), and Morpho Blue (EVM, distinct ABI with `supplyCollateral`/`borrow`/`repay`/`withdrawCollateral` and per-market isolated positions without a global `getUserAccountData`). Each protocol has fundamentally different position models and health factor computation, requiring the ILendingProvider to abstract these differences while preserving protocol-specific capabilities.

**Primary recommendation:** Design ILendingProvider as an extension of IActionProvider that adds 3 query methods (`getPosition`, `getHealthFactor`, `getMarkets`). Each query method returns protocol-agnostic normalized types (LendingPosition, HealthFactor, MarketInfo). Action methods route through the existing resolve() -> ContractCallRequest pipeline. The LendingPolicyEvaluator operates as a pre-pipeline validator (before Stage 1) that checks max LTV and asset whitelist constraints, using the same deny-first default policy as CONTRACT_WHITELIST.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| LEND-01 | ILendingProvider 인터페이스가 supply/borrow/repay/withdraw 4개 표준 액션을 정의한다 | IActionProvider resolve() pattern, LidoStaking/JitoStaking provider examples, ContractCallRequest return type for pipeline integration |
| LEND-02 | getPosition/getHealthFactor/getMarkets 3개 조회 메서드가 정의된다 | IPositionProvider.getPositions() pattern from Phase 268, IActionProvider interface extension via TypeScript, defi_positions LendingMetadataSchema from Phase 268 |
| LEND-03 | LendingPosition Zod 스키마가 type(SUPPLY/BORROW), provider, asset, amount, apy를 포함한다 | Phase 268 LendingMetadataSchema (positionType, apy, healthFactor, collateralUsd, debtUsd), BasePositionSchema common fields, Zod SSoT pattern |
| LEND-04 | HealthFactor 타입이 담보 가치/차입 가치 비율과 임계값(기본 1.2)을 정의한다 | Aave V3 getUserAccountData returns 6-tuple including healthFactor, Morpho HEALTH_FACTOR = (collateral * LLTV) / borrowed, Phase 269 HealthFactorMonitor severity thresholds (2.0/1.5/1.2) |
| LEND-05 | LendingPolicyEvaluator가 최대 LTV 제한 규칙을 정의한다 | DatabasePolicyEngine 9 policy types pattern, APPROVE_AMOUNT_LIMIT evaluator pattern for amount-based restrictions, existing policy table schema (type, rules JSON, wallet_id, priority) |
| LEND-06 | 허용 담보/차입 자산 화이트리스트 정책이 정의된다 | ALLOWED_TOKENS policy type (default deny, tokens array in rules JSON), CONTRACT_WHITELIST policy type pattern, CAIP-19 asset identifier integration |
| LEND-07 | REST API GET /v1/wallets/:id/positions 엔드포인트가 명세된다 | Phase 268 already designed this endpoint (section 7) with PositionsResponseSchema. Phase 270 adds lending-specific position query behavior and filter parameters |
| LEND-08 | REST API GET /v1/wallets/:id/health-factor 엔드포인트가 명세된다 | New endpoint -- no existing pattern. Must follow createRoute + Zod response schema + openapi pattern. HealthFactor response includes per-provider breakdown |
| LEND-09 | Aave V3/Kamino/Morpho 대상 구현체의 인터페이스 매핑이 정의된다 | Aave V3 IPool ABI (supply/borrow/repay/withdraw/getUserAccountData), Kamino klend-sdk (KaminoMarket/KaminoAction), Morpho Blue IMorpho (supplyCollateral/borrow/repay/withdrawCollateral/position) -- all verified via official docs |
</phase_requirements>

## Standard Stack

### Core (Already in Project)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | 3.x | Zod SSoT for LendingPosition, HealthFactor, MarketInfo schemas | Project rule: Zod SSoT, discriminatedUnion pattern |
| @hono/zod-openapi | Existing | OpenAPI route definitions for health-factor endpoint | All existing routes use this |
| viem | 2.x | EVM contract interaction (Aave V3, Morpho Blue ABI encoding) | Already used by EvmAdapter for all EVM transactions |
| @solana/kit | 6.x | Solana transaction building (Kamino instructions) | Already used by SolanaAdapter |

### External Dependencies for Protocol Mapping (Design-Only)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @aave/contract-helpers | Latest | Aave V3 ABI types and contract helpers | Aave V3 provider implementation (m29-02) |
| @kamino-finance/klend-sdk | Latest | Kamino lending SDK for transaction building and position queries | Kamino provider implementation (m29-04) |
| (none for Morpho) | - | Morpho uses raw viem ABI calls (minimal interface) | Morpho provider implementation (m29-10) |

**Note:** These external libraries are listed for the design document's protocol mapping section. They will be installed during implementation milestones (m29-02, m29-04, m29-10), not during this design phase.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| ILendingProvider extends IActionProvider | Separate ILendingProvider (no inheritance) | Extension keeps resolve() in the same class, enabling the 6-stage pipeline. Separate interface would require duplicate wiring. Extension wins. |
| LendingPolicyEvaluator as new policy type in DatabasePolicyEngine | Standalone pre-pipeline evaluator | A new policy type (LENDING_LTV_LIMIT) in the existing policies table reuses the entire infrastructure (wallet scoping, priority, enable/disable). Standalone evaluator would duplicate DB access patterns. Policy type wins. |
| Per-provider health factor endpoints | Single aggregated /health-factor endpoint | Aggregated endpoint is simpler for AI agents (one call). Per-provider is more granular but requires N calls. Recommend single endpoint with per-provider breakdown in response. |

## Architecture Patterns

### Recommended Design Document Structure

```
설계 문서 (m29-00 섹션 13-17):
├── 13. ILendingProvider 인터페이스
│   ├── 13.1 인터페이스 정의 (IActionProvider 확장 + 3 쿼리 메서드)
│   ├── 13.2 ActionDefinition 4개 (supply, borrow, repay, withdraw)
│   ├── 13.3 IPositionProvider 동시 구현 패턴
│   └── 13.4 설계 결정 기록
├── 14. LendingPosition + HealthFactor 타입
│   ├── 14.1 LendingPosition Zod 스키마 (Phase 268 LendingMetadataSchema 확장)
│   ├── 14.2 HealthFactor 타입 (담보/차입 비율, 임계값 매핑)
│   ├── 14.3 MarketInfo 타입 (프로바이더 시장 정보)
│   └── 14.4 설계 결정 기록
├── 15. LendingPolicyEvaluator
│   ├── 15.1 LENDING_LTV_LIMIT 정책 타입 (최대 LTV 제한)
│   ├── 15.2 LENDING_ASSET_WHITELIST 정책 타입 (담보/차입 자산 화이트리스트)
│   ├── 15.3 PolicyEngine 통합 지점 (DatabasePolicyEngine 확장)
│   └── 15.4 설계 결정 기록
├── 16. REST API 명세
│   ├── 16.1 GET /v1/wallets/:id/health-factor 엔드포인트
│   ├── 16.2 HealthFactorResponseSchema (Zod)
│   ├── 16.3 Phase 268 positions API와의 관계
│   └── 16.4 설계 결정 기록
└── 17. 프로토콜 인터페이스 매핑
    ├── 17.1 Aave V3 매핑 (IPool ABI → ILendingProvider)
    ├── 17.2 Kamino 매핑 (klend-sdk → ILendingProvider)
    ├── 17.3 Morpho Blue 매핑 (IMorpho ABI → ILendingProvider)
    └── 17.4 프로토콜 간 차이점 정리
```

### Pattern 1: ILendingProvider as IActionProvider Extension

**What:** ILendingProvider extends IActionProvider with 3 additional query methods. Each provider class also implements IPositionProvider for PositionTracker integration.

**When to use:** When protocol providers need both action execution (supply/borrow/repay/withdraw through pipeline) and position querying (for monitoring and API responses).

**Why this approach:** The existing pipeline (6-stage + sign-only) expects `IActionProvider.resolve()` to return `ContractCallRequest`. Lending actions (supply, borrow, repay, withdraw) are all on-chain transactions that should go through the same pipeline for policy evaluation, signing, and submission. Adding query methods directly on the provider avoids a separate service lookup.

**Example:**
```typescript
// packages/core/src/interfaces/lending-provider.types.ts

import type { IActionProvider, ActionContext } from './action-provider.types.js';
import type { IPositionProvider } from './position-provider.types.js';

/** Lending market information for AI agent discovery */
export interface MarketInfo {
  marketId: string;          // Protocol-specific market identifier
  asset: string;             // CAIP-19 asset identifier
  symbol: string;            // Human-readable symbol (e.g., 'USDC')
  supplyApy: number;         // Current supply APY (decimal, e.g., 0.032)
  borrowApy: number;         // Current borrow APY (decimal, e.g., 0.045)
  totalSupply: string;       // Total supply in asset units
  totalBorrow: string;       // Total borrow in asset units
  ltv: number;               // Max Loan-to-Value ratio (decimal, e.g., 0.80)
  liquidationThreshold: number; // Liquidation threshold (decimal, e.g., 0.825)
  isActive: boolean;         // Whether the market accepts new positions
}

/** Health factor for a wallet across all lending positions on this provider */
export interface HealthFactor {
  healthFactor: number;      // collateral / debt ratio (> 1 = safe, < 1 = liquidatable)
  totalCollateralUsd: number;
  totalDebtUsd: number;
  availableBorrowUsd: number;
  currentLtv: number;        // current LTV (decimal)
  maxLtv: number;            // max allowed LTV before liquidation
  positions: LendingPositionSummary[]; // per-asset breakdown
}

export interface LendingPositionSummary {
  asset: string;             // CAIP-19
  positionType: 'SUPPLY' | 'BORROW';
  amount: string;
  amountUsd: number;
  apy: number;
}

/**
 * ILendingProvider: extends IActionProvider with lending-specific query methods.
 *
 * Actions (via resolve()):
 * - supply: deposit collateral/supply asset
 * - borrow: borrow against collateral
 * - repay: repay borrowed amount
 * - withdraw: withdraw supplied asset
 *
 * Queries (new methods):
 * - getPosition: current positions for a wallet
 * - getHealthFactor: health factor + collateral/debt summary
 * - getMarkets: available lending markets
 */
export interface ILendingProvider extends IActionProvider {
  /** Get current lending positions for a wallet */
  getPosition(walletId: string, context: ActionContext): Promise<LendingPositionSummary[]>;

  /** Get health factor (collateral/debt ratio) for a wallet */
  getHealthFactor(walletId: string, context: ActionContext): Promise<HealthFactor>;

  /** Get available lending markets */
  getMarkets(chain: string, network?: string): Promise<MarketInfo[]>;
}
```

### Pattern 2: Dual Interface Implementation (IActionProvider + IPositionProvider)

**What:** A single provider class implements both ILendingProvider (extends IActionProvider) and IPositionProvider (for PositionTracker).

**When to use:** When the same protocol class needs to serve both action execution and position tracking.

**Why this approach:** `IPositionProvider.getPositions()` returns `PositionUpdate[]` for the PositionTracker's write queue. `ILendingProvider.getPosition()` returns a richer type for the API/AI agent. The same underlying RPC calls can serve both interfaces, but the return types differ by purpose.

**Example:**
```typescript
class AaveV3Provider implements ILendingProvider, IPositionProvider {
  // IActionProvider (inherited via ILendingProvider)
  readonly metadata: ActionProviderMetadata = { name: 'aave_v3', ... };
  readonly actions: readonly ActionDefinition[] = [
    { name: 'supply', ... },
    { name: 'borrow', ... },
    { name: 'repay', ... },
    { name: 'withdraw', ... },
  ];
  async resolve(actionName, params, context): Promise<ContractCallRequest> { ... }

  // ILendingProvider query methods
  async getPosition(walletId, context): Promise<LendingPositionSummary[]> { ... }
  async getHealthFactor(walletId, context): Promise<HealthFactor> { ... }
  async getMarkets(chain, network?): Promise<MarketInfo[]> { ... }

  // IPositionProvider (for PositionTracker)
  async getPositions(walletId): Promise<PositionUpdate[]> { ... }
  getProviderName(): string { return 'aave_v3'; }
  getSupportedCategories(): PositionCategory[] { return ['LENDING']; }
}
```

### Pattern 3: LendingPolicyEvaluator via New Policy Types

**What:** Two new policy types added to the existing `DatabasePolicyEngine`: `LENDING_LTV_LIMIT` (max LTV restriction) and `LENDING_ASSET_WHITELIST` (allowed collateral/borrow assets).

**When to use:** When lending-specific policy rules need to integrate with the existing policy priority/scoping system.

**Why this approach:** The existing `DatabasePolicyEngine` already handles 9 policy types with wallet/global scoping, priority ordering, and enable/disable. Adding lending policies as new types reuses all this infrastructure. The `rules` JSON column stores lending-specific config (max LTV, allowed assets). The evaluator runs after existing policy checks but before pipeline execution.

**Example:**
```typescript
// LENDING_LTV_LIMIT policy type
interface LendingLtvLimitRules {
  maxLtv: number;            // Maximum allowed LTV (e.g., 0.75 = 75%)
  warningLtv: number;        // Warning threshold (e.g., 0.65 = 65%)
}

// LENDING_ASSET_WHITELIST policy type (default-deny per CLAUDE.md)
interface LendingAssetWhitelistRules {
  collateralAssets: Array<{ assetId: string; symbol?: string }>; // Allowed collateral
  borrowAssets: Array<{ assetId: string; symbol?: string }>;     // Allowed borrow targets
}

// Integration in DatabasePolicyEngine.evaluate():
// 1. Check existing policies (WHITELIST, SPENDING_LIMIT, etc.)
// 2. For lending actions (supply/borrow/repay/withdraw):
//    a. Evaluate LENDING_ASSET_WHITELIST: deny if asset not whitelisted
//    b. For borrow: evaluate LENDING_LTV_LIMIT: deny if projected LTV exceeds maxLtv
```

### Pattern 4: Health Factor Endpoint

**What:** A new `GET /v1/wallets/:id/health-factor` endpoint that returns aggregated health factor across all lending providers.

**When to use:** When AI agents need quick health status without parsing all positions.

**Example:**
```typescript
const HealthFactorResponseSchema = z.object({
  walletId: z.string(),
  aggregated: z.object({
    healthFactor: z.number().nullable(),  // worst health factor across providers
    totalCollateralUsd: z.number(),
    totalDebtUsd: z.number(),
    status: z.enum(['SAFE', 'WARNING', 'DANGER', 'CRITICAL', 'NO_POSITIONS']),
  }),
  providers: z.array(z.object({
    provider: z.string(),
    healthFactor: z.number(),
    totalCollateralUsd: z.number(),
    totalDebtUsd: z.number(),
    currentLtv: z.number(),
    maxLtv: z.number(),
    positions: z.array(z.object({
      asset: z.string(),
      positionType: z.enum(['SUPPLY', 'BORROW']),
      amount: z.string(),
      amountUsd: z.number(),
      apy: z.number().nullable(),
    })),
  })),
  lastSyncedAt: z.number().int(),
}).openapi('HealthFactorResponse');
```

### Anti-Patterns to Avoid

- **Bypassing the 6-stage pipeline for lending actions:** Supply/borrow/repay/withdraw are on-chain transactions. They MUST go through resolve() -> ContractCallRequest -> pipeline. Never have providers sign or submit directly.
- **Computing health factor in the API route handler:** Health factor computation belongs in the provider (getHealthFactor). The API route should call the provider method or read from defi_positions cache, not duplicate computation logic.
- **Mixing Solana and EVM patterns in the interface:** ILendingProvider must be chain-agnostic. Each provider implementation handles chain-specific details internally. The interface exposes only normalized types.
- **Adding lending-specific columns to defi_positions:** Phase 268 already designed the metadata JSON column for category-specific fields. Lending data goes in LendingMetadata, not new columns.
- **Making the health factor endpoint return only the numeric value:** Always return the full context (collateral, debt, per-asset breakdown, status classification). AI agents need structured data to make decisions.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ABI encoding for Aave V3 | Manual hex encoding | viem's encodeFunctionData with IPool ABI | viem handles ABI encoding, type safety, and gas estimation |
| Kamino transaction building | Raw Solana instruction construction | @kamino-finance/klend-sdk KaminoAction.buildDepositTxns etc. | SDK handles account lookups, instruction ordering, and market state |
| Morpho market ID computation | Manual keccak256(abi.encode(params)) | viem's keccak256 + encodeAbiParameters | Morpho's market ID is keccak256 of packed MarketParams struct |
| LTV computation | Manual collateral/debt ratio | Aave: getUserAccountData returns ltv directly; Kamino: obligation has borrowLimit; Morpho: position.collateral * oracle / position.borrowShares | Each protocol has its own computation method; use the native one |
| Policy evaluation infrastructure | New policy evaluation system | Extend DatabasePolicyEngine with new policy types | Reuses wallet scoping, priority, enable/disable, Admin UI |
| Health factor caching | Separate health factor table | defi_positions.metadata.healthFactor field | Phase 268 already designed LendingMetadata with healthFactor |

**Key insight:** This phase is design-only. The design document must specify exactly which ABI functions, SDK methods, or API calls each protocol mapping uses, so implementation milestones can proceed without ambiguity.

## Common Pitfalls

### Pitfall 1: Aave V3 Interest Rate Mode Confusion

**What goes wrong:** Aave V3's `borrow()` function takes an `interestRateMode` parameter (1 = stable, 2 = variable). Stable rate has been deprecated on most markets but the parameter is still required.
**Why it happens:** The Aave V3 ABI requires the parameter even though stable rate is unavailable for most assets.
**How to avoid:** Design document must specify that the ILendingProvider supply/borrow input schemas include an optional `interestRateMode` field that defaults to 2 (variable). The Aave V3 mapping section must note that stable rate (1) is deprecated.
**Warning signs:** Borrow transactions failing with "STABLE_BORROWING_NOT_ENABLED" error.

### Pitfall 2: Morpho Per-Market Position Model vs Aave Global Account

**What goes wrong:** Assuming all lending protocols have a global health factor per account. Morpho Blue uses per-market isolated positions -- each market has its own collateral/debt/LTV with no cross-margin.
**Why it happens:** Aave V3 has a single `getUserAccountData()` that returns global health factor. Morpho requires querying each market separately and aggregating.
**How to avoid:** The ILendingProvider.getHealthFactor() must be protocol-aware. For Aave, it returns the global health factor. For Morpho, it aggregates per-market health factors and returns the worst. The HealthFactor type must include a `providers` array with per-provider breakdown.
**Warning signs:** Morpho implementation returning a single health factor that doesn't reflect individual market risks.

### Pitfall 3: Kamino Obligation vs Position Mapping

**What goes wrong:** Kamino uses an "obligation" account model where a single obligation can have multiple deposits and borrows. Mapping this to the flat `defi_positions` table (one row per asset per category) requires expanding one obligation into multiple position rows.
**Why it happens:** Kamino (and Solana lending in general) uses PDAs (Program Derived Addresses) for obligations, which are different from Aave's per-token position model.
**How to avoid:** Design document must specify that the Kamino provider's `getPositions()` iterates over the obligation's deposit/borrow entries and creates one `PositionUpdate` per asset per type (SUPPLY/BORROW). The `assetId` is the CAIP-19 for the SPL token mint.
**Warning signs:** Missing positions because the obligation was treated as a single position.

### Pitfall 4: Default-Deny Policy Not Applied to Lending

**What goes wrong:** Lending assets are allowed without a LENDING_ASSET_WHITELIST policy, violating the project's default-deny principle.
**Why it happens:** CLAUDE.md states "Default-deny policy: deny when ALLOWED_TOKENS / CONTRACT_WHITELIST / APPROVED_SPENDERS are not configured." This must extend to lending.
**How to avoid:** Design must specify that when no LENDING_ASSET_WHITELIST policy exists for a wallet, all lending actions (supply, borrow, repay, withdraw) are denied. Same pattern as CONTRACT_WHITELIST opt-in.
**Warning signs:** Wallets able to supply/borrow arbitrary assets without policy configuration.

### Pitfall 5: Health Factor Threshold Mismatch Between Policy and Monitor

**What goes wrong:** LendingPolicyEvaluator uses one set of LTV thresholds while HealthFactorMonitor uses different thresholds, creating inconsistent behavior.
**Why it happens:** LTV policy (max LTV for new borrows) and monitoring thresholds (health factor danger/critical) are related but different concepts. LTV = debt/collateral, while health factor = collateral/debt (inverse).
**How to avoid:** Design document must clearly distinguish: (1) LendingPolicyEvaluator.maxLtv -- prevents new borrows that would exceed this ratio, (2) HealthFactorMonitor thresholds -- alert on existing positions where health factor drops. Include a conversion formula: healthFactor = liquidationThreshold / currentLtv. Map the config keys to avoid confusion.
**Warning signs:** AI agent gets approval for a borrow that immediately triggers a LIQUIDATION_WARNING.

### Pitfall 6: Morpho Blue Missing Global Health Factor Function

**What goes wrong:** Calling a non-existent `getUserAccountData()` equivalent on Morpho, expecting a global health factor.
**Why it happens:** Aave training data dominance -- developers assume all lending protocols have a global account view.
**How to avoid:** Design must specify that Morpho's health factor is computed per-market using `position(marketId, user)` which returns `(supplyShares, borrowShares, collateral)`. The health factor formula is `(collateral * oraclePrice * LLTV) / borrowedAmount`. Each market must be queried individually.
**Warning signs:** Provider implementation trying to call a single function for global health.

## Code Examples

### Aave V3 IPool ABI Methods (Verified from Official Docs)

```typescript
// Source: https://aave.com/docs/aave-v3/smart-contracts/pool
// Aave V3 Pool contract on Ethereum mainnet: 0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2

// Core write functions (used by resolve())
const AAVE_V3_POOL_ABI = [
  {
    name: 'supply',
    type: 'function',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'onBehalfOf', type: 'address' },
      { name: 'referralCode', type: 'uint16' },
    ],
  },
  {
    name: 'borrow',
    type: 'function',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'interestRateMode', type: 'uint256' }, // 2 = variable
      { name: 'referralCode', type: 'uint16' },
      { name: 'onBehalfOf', type: 'address' },
    ],
  },
  {
    name: 'repay',
    type: 'function',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'interestRateMode', type: 'uint256' },
      { name: 'onBehalfOf', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'withdraw',
    type: 'function',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'to', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  // Core read function (used by getHealthFactor)
  {
    name: 'getUserAccountData',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [
      { name: 'totalCollateralBase', type: 'uint256' },
      { name: 'totalDebtBase', type: 'uint256' },
      { name: 'availableBorrowsBase', type: 'uint256' },
      { name: 'currentLiquidationThreshold', type: 'uint256' },
      { name: 'ltv', type: 'uint256' },
      { name: 'healthFactor', type: 'uint256' },
    ],
  },
] as const;

// ILendingProvider.resolve() -> ContractCallRequest for 'supply' action
// Example: supply 100 USDC to Aave V3
const supplyCalldata = encodeFunctionData({
  abi: AAVE_V3_POOL_ABI,
  functionName: 'supply',
  args: [
    USDC_ADDRESS,           // asset
    parseUnits('100', 6),   // amount (USDC has 6 decimals)
    walletAddress,          // onBehalfOf
    0,                      // referralCode (0 = none)
  ],
});

// Returns: ContractCallRequest { type: 'CONTRACT_CALL', toAddress: POOL_ADDRESS, calldata: supplyCalldata, ... }
```

### Morpho Blue Methods (Verified from Official Docs)

```typescript
// Source: https://docs.morpho.org/build/borrow/tutorials/assets-flow/
// Morpho Blue on Ethereum mainnet: 0xBBBBBbbBBb9cc5e90e3b3Af64bdAF62C37EEFFCb

// MarketParams struct that identifies a market
interface MorphoMarketParams {
  loanToken: `0x${string}`;
  collateralToken: `0x${string}`;
  oracle: `0x${string}`;
  irm: `0x${string}`;     // Interest Rate Model
  lltv: bigint;            // Liquidation LTV (WAD scaled, e.g., 0.86e18)
}

// Core write functions
const MORPHO_ABI = [
  {
    name: 'supplyCollateral',
    inputs: [
      { name: 'marketParams', type: 'tuple', components: [...] },
      { name: 'assets', type: 'uint256' },
      { name: 'onBehalf', type: 'address' },
      { name: 'data', type: 'bytes' },
    ],
  },
  {
    name: 'borrow',
    inputs: [
      { name: 'marketParams', type: 'tuple', components: [...] },
      { name: 'assets', type: 'uint256' },
      { name: 'shares', type: 'uint256' },
      { name: 'onBehalf', type: 'address' },
      { name: 'receiver', type: 'address' },
    ],
    outputs: [
      { name: 'assetsBorrowed', type: 'uint256' },
      { name: 'sharesBorrowed', type: 'uint256' },
    ],
  },
  {
    name: 'repay',
    inputs: [
      { name: 'marketParams', type: 'tuple', components: [...] },
      { name: 'assets', type: 'uint256' },
      { name: 'shares', type: 'uint256' },
      { name: 'onBehalf', type: 'address' },
      { name: 'data', type: 'bytes' },
    ],
  },
  {
    name: 'withdrawCollateral',
    inputs: [
      { name: 'marketParams', type: 'tuple', components: [...] },
      { name: 'assets', type: 'uint256' },
      { name: 'onBehalf', type: 'address' },
      { name: 'receiver', type: 'address' },
    ],
  },
  // Position query (per-market)
  {
    name: 'position',
    stateMutability: 'view',
    inputs: [
      { name: 'id', type: 'bytes32' },    // keccak256(abi.encode(marketParams))
      { name: 'user', type: 'address' },
    ],
    outputs: [
      { name: 'supplyShares', type: 'uint256' },
      { name: 'borrowShares', type: 'uint256' },
      { name: 'collateral', type: 'uint256' },
    ],
  },
] as const;

// Health factor computation for Morpho (per-market):
// healthFactor = (collateral * oraclePrice / ORACLE_PRICE_SCALE * LLTV) / borrowedAmount
// ORACLE_PRICE_SCALE = 10^36
// LLTV is WAD-scaled (10^18)
```

### Kamino klend-sdk Methods (Verified from GitHub/npm)

```typescript
// Source: https://github.com/Kamino-Finance/klend-sdk
// npm: @kamino-finance/klend-sdk

import { KaminoMarket, KaminoAction } from '@kamino-finance/klend-sdk';

// Initialize market
const market = await KaminoMarket.load(connection, MAIN_MARKET_ADDRESS);
await market.loadReserves();

// Query user positions (for getPosition/getPositions)
const obligation = await market.getObligationByWallet(walletPublicKey);
// obligation.deposits -> [{ mintAddress, depositedAmount, marketValueSf }]
// obligation.borrows -> [{ mintAddress, borrowedAmount, marketValueSf }]
// obligation.stats.borrowLimit -> max borrow capacity
// obligation.stats.userTotalDeposit -> total deposit USD value
// obligation.stats.userTotalBorrow -> total borrow USD value

// Build transactions (for resolve())
const depositAction = await KaminoAction.buildDepositTxns(
  market,
  amountInLamports,          // amount as BN
  tokenMintPublicKey,        // SPL token mint
  walletPublicKey,           // depositor
  obligation,                // existing obligation (or undefined for new)
);
// Returns: { setupIxs, lendingIxs, cleanupIxs } -> Transaction instructions

const borrowAction = await KaminoAction.buildBorrowTxns(
  market,
  amountInLamports,
  tokenMintPublicKey,
  walletPublicKey,
  obligation,
);

// Health factor: derived from obligation stats
// healthFactor = borrowLimit / totalBorrow
// If totalBorrow = 0, healthFactor = Infinity (safe)
```

### LendingPolicyEvaluator Integration Pattern

```typescript
// In DatabasePolicyEngine.evaluate():
// After existing policy checks (step 4a-4g), add lending-specific checks

// Step 4h: LENDING_ASSET_WHITELIST (default-deny for lending)
if (isLendingAction(transaction.type)) {
  const lendingWhitelist = policies.find(p => p.type === 'LENDING_ASSET_WHITELIST');
  if (!lendingWhitelist) {
    return { tier: 'INSTANT', allowed: false, reason: 'No lending asset whitelist configured' };
  }
  const rules = JSON.parse(lendingWhitelist.rules) as LendingAssetWhitelistRules;
  // For supply: check if asset is in collateralAssets
  // For borrow: check if asset is in borrowAssets
}

// Step 4i: LENDING_LTV_LIMIT (for borrow actions only)
if (transaction.type === 'LENDING_BORROW') {
  const ltvPolicy = policies.find(p => p.type === 'LENDING_LTV_LIMIT');
  if (ltvPolicy) {
    const rules = JSON.parse(ltvPolicy.rules) as LendingLtvLimitRules;
    // Compute projected LTV after this borrow
    const projectedLtv = computeProjectedLtv(walletId, transaction.amount, ...);
    if (projectedLtv > rules.maxLtv) {
      return { tier: 'INSTANT', allowed: false, reason: `Borrow would exceed max LTV (${rules.maxLtv})` };
    }
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No lending framework | To be: ILendingProvider + 3 protocol mappings | Phase 270 (this phase) | Enables AI agents to supply/borrow/repay/withdraw through standard pipeline |
| No lending policies | To be: LENDING_LTV_LIMIT + LENDING_ASSET_WHITELIST | Phase 270 (this phase) | Default-deny lending with configurable limits |
| No health factor endpoint | To be: GET /v1/wallets/:id/health-factor | Phase 270 (this phase) | AI agents can check portfolio health in one call |
| Transaction-derived staking only | PositionTracker-synced lending positions (Phase 268) | Phase 268 | defi_positions table stores real-time position state |
| No liquidation risk monitoring | HealthFactorMonitor (Phase 269) reads from defi_positions | Phase 269 | Adaptive polling based on health factor severity |

**Protocol-specific notes:**
- Aave V3 is the most mature EVM lending protocol with well-documented ABI and deployed on 10+ EVM chains.
- Kamino is the leading Solana lending protocol (~$2.8B TVL as of Q3 2025) with TypeScript SDK (`@kamino-finance/klend-sdk`).
- Morpho Blue is a newer minimalist lending primitive on EVM with per-market isolated positions (no global health factor).

## Open Questions

1. **LENDING_BORROW transaction type in the pipeline**
   - What we know: The 6-stage pipeline uses the discriminatedUnion 5-type (TRANSFER/TOKEN_TRANSFER/CONTRACT_CALL/APPROVE/BATCH). Lending actions resolve to CONTRACT_CALL.
   - What's unclear: How does the LendingPolicyEvaluator distinguish a lending CONTRACT_CALL from a regular CONTRACT_CALL? The `metadata` field on ContractCallRequest could carry action context.
   - Recommendation: Use the existing `metadata` field (or `hint` field) on ContractCallRequest to carry `{ actionProvider: 'aave_v3', actionName: 'borrow' }`. The policy evaluator checks this metadata to identify lending actions. This avoids adding a new transaction type to the discriminatedUnion.

2. **Kamino klend-sdk version compatibility with @solana/kit 6.x**
   - What we know: The project uses `@solana/kit` 6.x (new Solana SDK). Kamino's `klend-sdk` may depend on the older `@solana/web3.js` 1.x.
   - What's unclear: Whether klend-sdk has migrated to @solana/kit or still uses legacy web3.js.
   - Recommendation: Design document should note this as a compatibility flag for the Kamino implementation milestone (m29-04). If klend-sdk uses legacy web3.js, the Kamino provider may need an adapter layer to convert between PublicKey types. This is LOW confidence since klend-sdk version compatibility was not verified.

3. **Morpho market discovery mechanism**
   - What we know: Morpho Blue has no built-in market registry. Markets are identified by `keccak256(abi.encode(marketParams))`. There's no `getMarkets()` equivalent on-chain.
   - What's unclear: Whether Morpho has an off-chain API or subgraph for market discovery.
   - Recommendation: Design document should specify that the Morpho provider's `getMarkets()` uses a curated list of known market IDs (config-based) rather than on-chain discovery. This matches the project's self-hosted model where the operator configures which Morpho markets to interact with.

4. **Multi-step lending operations (approve + supply)**
   - What we know: Aave V3 `supply()` and Morpho `supplyCollateral()` require prior ERC-20 `approve()` of the lending pool contract. The existing pipeline handles multi-step via `ContractCallRequest[]` array return (LidoStaking uses this for approve + requestWithdrawals).
   - What's unclear: Whether the approve step should be automatic (provider adds it) or explicit (user/agent calls approve separately).
   - Recommendation: Follow the LidoStaking pattern -- `resolve('supply', ...)` returns `[approveRequest, supplyRequest]` when the current allowance is insufficient. The pipeline executes both sequentially. This is transparent to the AI agent.

## Sources

### Primary (HIGH confidence)
- `/packages/core/src/interfaces/action-provider.types.ts` - IActionProvider interface (metadata, actions, resolve)
- `/packages/core/src/interfaces/position-provider.types.ts` (Phase 268 design) - IPositionProvider interface (getPositions, getProviderName, getSupportedCategories)
- `/packages/core/src/schemas/position.schema.ts` (Phase 268 design) - LendingMetadataSchema (positionType, apy, healthFactor, collateralUsd, debtUsd)
- `/packages/daemon/src/pipeline/database-policy-engine.ts` - DatabasePolicyEngine 9 policy types, evaluation algorithm
- `/packages/daemon/src/api/routes/staking.ts` - Existing staking position route pattern
- `/packages/actions/src/providers/lido-staking/index.ts` - LidoStaking provider pattern (IActionProvider, multi-step resolve)
- `/internal/objectives/m29-00-defi-advanced-protocol-design.md` - Phase 268 outputs (sections 5-8), Phase 269 outputs (sections 9-12)
- [Aave V3 Pool Documentation](https://aave.com/docs/aave-v3/smart-contracts/pool) - supply/borrow/repay/withdraw/getUserAccountData ABI
- [Morpho Blue Tutorials](https://docs.morpho.org/build/borrow/tutorials/assets-flow/) - supplyCollateral/borrow/repay/withdrawCollateral
- [Morpho LTV Concepts](https://docs.morpho.org/build/borrow/concepts/ltv) - Health factor = (collateral * LLTV) / borrowed, per-market isolation
- [Kamino klend-sdk GitHub](https://github.com/Kamino-Finance/klend-sdk) - KaminoMarket, KaminoAction, KaminoObligation classes

### Secondary (MEDIUM confidence)
- [Aave V3 IPool.sol Interface](https://github.com/aave/aave-v3-core/blob/master/contracts/interfaces/IPool.sol) - Full Solidity interface
- [Morpho Blue Morpho.sol](https://github.com/morpho-org/morpho-blue/blob/main/src/Morpho.sol) - position() function, market() function
- [Kamino klend-sdk npm](https://www.npmjs.com/package/@kamino-finance/klend-sdk) - SDK documentation and examples
- [Kamino REST API](https://api.kamino.finance/) - REST API for market data and user positions

### Tertiary (LOW confidence)
- Kamino klend-sdk compatibility with @solana/kit 6.x - Not verified, flagged for implementation milestone
- Morpho market discovery off-chain mechanism - Not verified, assumed config-based curated list

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All core libraries already in the codebase; external protocol libraries verified via official docs/npm
- Architecture: HIGH - Direct extensions of IActionProvider, DatabasePolicyEngine, and Phase 268/269 infrastructure patterns
- Pitfalls: HIGH - Based on verified protocol differences (Aave global vs Morpho per-market, Kamino obligation model) and existing codebase constraints (default-deny policy, discriminatedUnion pipeline)
- Protocol mapping: MEDIUM - Aave V3 mapping HIGH (well-documented ABI), Morpho mapping HIGH (official tutorials verified), Kamino mapping MEDIUM (SDK methods verified but @solana/kit compatibility unconfirmed)

**Research date:** 2026-02-26
**Valid until:** 2026-03-28 (stable protocol interfaces, Aave V3 and Morpho Blue are immutable contracts)
