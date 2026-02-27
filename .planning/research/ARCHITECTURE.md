# Architecture: Aave V3 EVM Lending + Lending Framework

**Domain:** DeFi Lending integration for AI wallet system
**Researched:** 2026-02-26
**Confidence:** HIGH (design doc m29-00 shipped, existing ActionProvider patterns verified, Aave V3 ABI verified against official docs)

## Recommended Architecture

The Lending framework introduces **stateful position management** on top of the existing stateless ActionProvider pipeline. The key architectural insight: resolve() continues to produce ContractCallRequest objects flowing through the existing 6-stage pipeline, but new services (PositionTracker, HealthFactorMonitor, LendingPolicyEvaluator) wrap around the pipeline to manage position lifecycle.

```
                         [AI Agent / MCP / REST API]
                                    |
                     POST /v1/actions/aave_v3/{supply|borrow|repay|withdraw}
                                    |
                     [ActionProviderRegistry.executeResolve()]
                                    |
                     [AaveV3LendingProvider.resolve()]
                                    |
                         ContractCallRequest[]
                           (approve + action)
                                    |
                     [6-Stage Pipeline: validate -> policy -> ... -> confirm]
                           |                    |
              [LendingPolicyEvaluator]    [Stage 5: EvmAdapter]
              (step 4h: LTV + asset        (viem sendTransaction)
               whitelist evaluation)            |
                                    [PositionTracker (5-min sync)]
                                         |            |
                                  [defi_positions]  [HealthFactorMonitor]
                                         |            (adaptive polling)
                                  [REST API]              |
                                  [Admin UI]     [LIQUIDATION_WARNING]
```

### Component Boundaries

| Component | Package | Responsibility | Communicates With |
|-----------|---------|---------------|-------------------|
| ILendingProvider | @waiaas/core (interface) | Type contract: 4 actions + 3 query methods | ActionProviderRegistry, PositionTracker |
| IPositionProvider | @waiaas/core (interface) | Type contract: position data source for PositionTracker | PositionTracker |
| AaveV3LendingProvider | @waiaas/actions | Resolves supply/borrow/repay/withdraw to ContractCallRequest, queries positions/health-factor/markets via Aave V3 Pool ABI | ActionProviderRegistry, PositionTracker, REST API |
| AaveContractHelper | @waiaas/actions | ABI encoding + chain-specific Pool/Oracle address mapping | AaveV3LendingProvider |
| PositionTracker | @waiaas/daemon (service) | 5-min sync of defi_positions, PositionWriteQueue batch upsert | IPositionProvider implementations, SQLite |
| HealthFactorMonitor | @waiaas/daemon (service) | Adaptive polling (5min-5sec), LIQUIDATION_WARNING alerts | defi_positions table, NotificationService, EventBus |
| LendingPolicyEvaluator | @waiaas/daemon (pipeline) | LENDING_LTV_LIMIT + LENDING_ASSET_WHITELIST evaluation | DatabasePolicyEngine (step 4h), defi_positions table |
| DeFi Position Routes | @waiaas/daemon (routes) | GET /positions, GET /health-factor | defi_positions table, ILendingProvider.getHealthFactor() |
| Admin Portfolio View | @waiaas/admin | DeFi positions panel, health factor display | REST API |

### Data Flow

**Supply flow (happy path):**

```
1. Agent: POST /v1/actions/aave_v3/supply { params: { asset: "eip155:1/erc20:0xA0b8...3", amount: "1000" } }
2. ActionProviderRegistry.executeResolve("aave_v3/supply", params, context)
3. AaveV3LendingProvider.resolve("supply", params, context):
   a. Parse CAIP-19 asset -> token address 0xA0b8...
   b. Check ERC-20 allowance for Pool contract
   c. If allowance insufficient: return [approveReq, supplyReq]
   d. Else: return [supplyReq]
   e. supplyReq = ContractCallRequest {
        type: 'CONTRACT_CALL',
        to: POOL_ADDRESS,  // chain-specific
        calldata: encodeFunctionData('supply(address,uint256,address,uint16)', [token, amount, wallet, 0]),
        value: '0',
        actionProvider: 'aave_v3'  // auto-tagged by registry
      }
4. For each ContractCallRequest in array:
   a. Stage 1: Validate + INSERT PENDING tx
   b. Stage 2: Auth (session check)
   c. Stage 3: Policy evaluation:
      - Step 4d: CONTRACT_WHITELIST (Pool address must be whitelisted)
      - Step 4h-a: LENDING_ASSET_WHITELIST (asset must be in collateralAssets)
      - Step 4h-b: LENDING_LTV_LIMIT (N/A for supply, only borrow)
      - Step 5: SPENDING_LIMIT (USD amount evaluation)
   d. Stage 3.5: GasCondition (if specified)
   e. Stage 4: Wait (DELAY/APPROVAL tier)
   f. Stage 5: EvmAdapter signs + broadcasts
   g. Stage 6: Confirmation wait
5. PositionTracker (next 5-min cycle): syncs aToken balance -> defi_positions
```

**Borrow flow (policy integration):**

```
1. Agent: POST /v1/actions/aave_v3/borrow { params: { asset: "eip155:1/erc20:0xdAC1...", amount: "5000" } }
2. AaveV3LendingProvider.resolve("borrow", ...):
   -> ContractCallRequest { calldata: Pool.borrow(asset, amount, 2, 0, wallet) }
3. Policy evaluation at Stage 3:
   Step 4h-a: LENDING_ASSET_WHITELIST -> check asset in borrowAssets
   Step 4h-b: LENDING_LTV_LIMIT:
     a. Read defi_positions (PositionTracker cache)
     b. currentDebtUsd = sum of existing BORROW positions
     c. newBorrowUsd = amount * IPriceOracle.getPrice()
     d. projectedLtv = (currentDebtUsd + newBorrowUsd) / totalCollateralUsd
     e. if projectedLtv > maxLtv (0.75) -> DENY
     f. if projectedLtv > warningLtv (0.65) -> upgrade tier to DELAY
     g. else -> pass through
4. If borrow defaultTier=APPROVAL, owner must approve
5. After confirmation: PositionTracker syncs variableDebtToken balance
```

## New Components (detailed)

### 1. ILendingProvider extends IActionProvider (core interface)

**File:** `packages/core/src/interfaces/lending-provider.types.ts`

```typescript
export interface ILendingProvider extends IActionProvider {
  getPosition(walletId: string, context: ActionContext): Promise<LendingPositionSummary[]>;
  getHealthFactor(walletId: string, context: ActionContext): Promise<HealthFactor>;
  getMarkets(chain: string, network?: string): Promise<MarketInfo[]>;
}
```

ILendingProvider extends IActionProvider (not a separate interface) because:
- resolve() stays in the same class, feeding directly into the 6-stage pipeline
- ActionProviderRegistry.register() works unchanged (it accepts IActionProvider)
- Query methods (getPosition, getHealthFactor, getMarkets) are accessed via type narrowing when the route handler knows it has a lending provider

**IPositionProvider** is a separate interface (NOT extending IActionProvider) because PositionTracker needs pure read-only access without execution dependencies:

```typescript
export interface IPositionProvider {
  getPositions(walletId: string): Promise<PositionUpdate[]>;
  getProviderName(): string;
  getSupportedCategories(): PositionCategory[];
}
```

The same class implements both: `class AaveV3LendingProvider implements ILendingProvider, IPositionProvider`

### 2. AaveV3LendingProvider (actions package)

**File:** `packages/actions/src/providers/aave-v3/index.ts`

Follows the exact pattern of LidoStakingActionProvider:
- Constructor receives config (Pool addresses, thresholds)
- metadata: name='aave_v3', chains=['evm'], mcpExpose=true
- 4 actions: supply, borrow, repay, withdraw
- resolve() returns ContractCallRequest or ContractCallRequest[] (approve+action pattern)
- Additionally implements IPositionProvider for PositionTracker integration

**Key difference from existing providers:** Also implements 3 query methods (getPosition, getHealthFactor, getMarkets) that make on-chain RPC calls via viem publicClient. These are NOT called through the pipeline -- they are called directly by REST API route handlers and PositionTracker.

### 3. AaveContractHelper (actions package)

**File:** `packages/actions/src/providers/aave-v3/aave-contracts.ts`

Hardcoded chain-specific address mapping (same pattern as LidoStakingConfig addresses):

```typescript
const AAVE_V3_ADDRESSES: Record<string, AaveV3Addresses> = {
  'ethereum-mainnet': {
    pool: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
    poolDataProvider: '0x0a16f2FCC0D44FaE41cc54e079281D84A363bECD',
    oracle: '0x54586bE62E3c3580375aE3723C145253060Ca0C2',
  },
  'arbitrum-mainnet': {
    pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    poolDataProvider: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
    oracle: '0xb56c2F0B653B2e0b10C9b928C8580Ac5Df02C7C7',
  },
  'optimism-mainnet': {
    pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    poolDataProvider: '...',
    oracle: '...',
  },
  'base-mainnet': {
    pool: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
    poolDataProvider: '...',
    oracle: '...',
  },
  'polygon-mainnet': {
    pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    poolDataProvider: '...',
    oracle: '...',
  },
};
```

ABI encoding uses viem's `encodeFunctionData` -- no Aave SDK dependency needed. The Pool ABI for the 4 core functions:

```typescript
const POOL_ABI = [
  // supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)
  { name: 'supply', type: 'function', inputs: [...], outputs: [] },
  // borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf)
  { name: 'borrow', type: 'function', inputs: [...], outputs: [] },
  // repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf) returns (uint256)
  { name: 'repay', type: 'function', inputs: [...], outputs: [{ type: 'uint256' }] },
  // withdraw(address asset, uint256 amount, address to) returns (uint256)
  { name: 'withdraw', type: 'function', inputs: [...], outputs: [{ type: 'uint256' }] },
  // getUserAccountData(address user) returns (totalCollateralBase, totalDebtBase, availableBorrowsBase, currentLiquidationThreshold, ltv, healthFactor)
  { name: 'getUserAccountData', type: 'function', inputs: [...], outputs: [...] },
  // getReservesList() returns (address[])
  { name: 'getReservesList', type: 'function', inputs: [], outputs: [{ type: 'address[]' }] },
] as const;
```

### 4. PositionTracker (daemon service)

**File:** `packages/daemon/src/services/defi/position-tracker.ts`

Independent service with internal setInterval management (NOT using BackgroundWorkers, because it needs 4 different intervals for 4 categories). Follows BalanceMonitorService pattern.

```
Lifecycle:
  DaemonLifecycle Step 4c-10.5 (after AsyncPollingService)
  -> new PositionTracker({ sqlite, db, eventBus })
  -> positionTracker.registerProvider('aave_v3', aaveProvider)
  -> positionTracker.start()
  -> [4 category timers: LENDING=5min, STAKING=15min, YIELD=1hr, PERP=1min]

Shutdown:
  -> positionTracker.stop()
  -> clearInterval all timers
  -> writeQueue.flush() (drain remaining)
```

The PositionWriteQueue uses the IncomingTxQueue pattern:
- Map<string, PositionUpsert> for dedup (key: walletId:provider:assetId:category)
- flush() with BEGIN IMMEDIATE transaction
- ON CONFLICT(wallet_id, provider, asset_id, category) DO UPDATE for upsert
- MAX_BATCH=100

### 5. HealthFactorMonitor (daemon service)

**File:** `packages/daemon/src/services/defi/health-factor-monitor.ts`

Implements IDeFiMonitor interface. Uses adaptive polling (recursive setTimeout, not setInterval):

| Health Factor | Severity | Polling Interval | Notification |
|--------------|----------|-----------------|--------------|
| >= 2.0 | SAFE | 5 minutes | None |
| 1.5 - 2.0 | WARNING | 1 minute | LIQUIDATION_WARNING |
| 1.2 - 1.5 | DANGER | 15 seconds | LIQUIDATION_WARNING |
| < 1.2 | CRITICAL | 5 seconds | LIQUIDATION_IMMINENT |

Data source: reads from defi_positions table ONLY (DEC-MON-03). Never makes direct RPC calls. PositionTracker is responsible for data freshness.

When DANGER or CRITICAL is detected, requests on-demand PositionTracker sync via `positionTracker.syncCategory('LENDING')`.

### 6. LendingPolicyEvaluator (pipeline extension)

**File:** `packages/daemon/src/pipeline/database-policy-engine.ts` (modification)

Two new policy types added to DatabasePolicyEngine.evaluate() at step 4h:

**Step 4h-a: LENDING_ASSET_WHITELIST**
- Default-deny: no policy configured = all lending actions denied
- Checks ContractCallRequest.metadata.actionName to identify lending actions
- supply/withdraw: asset must be in collateralAssets
- borrow/repay: asset must be in borrowAssets

**Step 4h-b: LENDING_LTV_LIMIT**
- Only applies to borrow actions
- Reads current positions from defi_positions (cached, not live RPC)
- Calculates projectedLtv = (currentDebt + newBorrow) / totalCollateral
- maxLtv exceeded -> DENY
- warningLtv exceeded -> upgrade to DELAY tier

Identification mechanism: ContractCallRequest.metadata already exists as an extension point. The action route handler auto-tags metadata with `{ provider: 'aave_v3', action: 'borrow' }`. No new discriminatedUnion type needed -- preserves the 5-type pipeline invariant.

### 7. DB Migration: defi_positions table

**Schema version:** 24 -> 25

```sql
CREATE TABLE IF NOT EXISTS defi_positions (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK(category IN ('LENDING','YIELD','PERP','STAKING')),
  provider TEXT NOT NULL,
  chain TEXT NOT NULL CHECK(chain IN ('solana','evm')),
  network TEXT,
  asset_id TEXT,
  amount TEXT NOT NULL,
  amount_usd REAL,
  metadata TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','CLOSED','LIQUIDATED')),
  opened_at INTEGER NOT NULL,
  closed_at INTEGER,
  last_synced_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_defi_positions_wallet_category ON defi_positions(wallet_id, category);
CREATE INDEX idx_defi_positions_wallet_provider ON defi_positions(wallet_id, provider);
CREATE INDEX idx_defi_positions_status ON defi_positions(status);
CREATE UNIQUE INDEX idx_defi_positions_unique ON defi_positions(wallet_id, provider, asset_id, category);
```

Key design decisions:
- `defi_positions` (not `positions`) to avoid naming collision with wallet positions concept
- metadata is JSON string, parsed only at API response time (write path skips Zod validation)
- UNIQUE key on (wallet_id, provider, asset_id, category) for upsert
- Category discriminated (LENDING/YIELD/PERP/STAKING) -- future providers reuse same table
- CHECK constraints built from SSoT arrays via buildCheckSql()

## Modified Components (existing files)

### 1. SSoT Enum Extensions

| File | Changes |
|------|---------|
| `packages/core/src/enums/notification.ts` | +4 event types: LIQUIDATION_WARNING, MATURITY_WARNING, MARGIN_WARNING, LIQUIDATION_IMMINENT |
| `packages/core/src/enums/defi.ts` (NEW) | POSITION_CATEGORIES, POSITION_STATUSES arrays + types |
| `packages/core/src/enums/index.ts` | Re-export new enums |

### 2. Policy Engine Extension

| File | Changes |
|------|---------|
| `packages/daemon/src/pipeline/database-policy-engine.ts` | Add step 4h-a (LENDING_ASSET_WHITELIST) + step 4h-b (LENDING_LTV_LIMIT) |
| `packages/core/src/schemas/policy.schema.ts` (or equivalent) | Add LENDING_LTV_LIMIT, LENDING_ASSET_WHITELIST to PolicyTypeEnum |

### 3. Provider Registration

| File | Changes |
|------|---------|
| `packages/actions/src/index.ts` | Export AaveV3LendingProvider, add to registerBuiltInProviders() |
| `packages/daemon/src/lifecycle/daemon.ts` | Step 4c-10.5: Create PositionTracker, register provider, start() |

### 4. Notification System

| File | Changes |
|------|---------|
| `packages/daemon/src/services/notification/message-templates.ts` | +4 DeFi event message templates |
| `packages/daemon/src/services/notification/` (filter config) | EVENT_CATEGORY_MAP: new 'defi' category |

### 5. REST API + MCP

| File | Changes |
|------|---------|
| `packages/daemon/src/api/routes/defi-positions.ts` (NEW) | GET /v1/wallets/:id/positions, GET /v1/wallets/:id/health-factor |
| `packages/daemon/src/api/routes/wallets.ts` | Link to defi-positions sub-router |
| MCP tool registration | 5 new tools auto-generated from mcpExpose=true: waiaas_aave_supply, waiaas_aave_borrow, waiaas_aave_repay, waiaas_aave_withdraw, waiaas_aave_positions |

### 6. Admin UI

| File | Changes |
|------|---------|
| `packages/admin/src/components/` (NEW) | DeFiPortfolioPanel, HealthFactorGauge, PositionTable |
| `packages/admin/src/pages/` | Wallet detail: new DeFi tab or Portfolio section |
| Policy forms | 2 new policy type forms: LTV limit slider, asset whitelist picker |

### 7. DB Migration

| File | Changes |
|------|---------|
| `packages/daemon/src/infrastructure/database/schema.ts` | Add defiPositions Drizzle table definition |
| `packages/daemon/src/infrastructure/database/migrate.ts` | Add migration v25: CREATE TABLE defi_positions + indexes, LATEST_SCHEMA_VERSION 24->25 |
| Tests | Update LATEST_SCHEMA_VERSION assertions (24->25), add migration chain test |

## Patterns to Follow

### Pattern 1: Provider implements both ILendingProvider + IPositionProvider

**What:** Single class implements both the execution interface (resolve -> ContractCallRequest) and the read-only position query interface (getPositions -> PositionUpdate[]).

**When:** Every lending/yield/perp provider needs this dual interface pattern.

**Example:**
```typescript
class AaveV3LendingProvider implements ILendingProvider, IPositionProvider {
  // IActionProvider (inherited via ILendingProvider)
  readonly metadata: ActionProviderMetadata = { name: 'aave_v3', ... };
  readonly actions: readonly ActionDefinition[] = [/* supply, borrow, repay, withdraw */];
  async resolve(actionName, params, context) { /* -> ContractCallRequest[] */ }

  // ILendingProvider query methods
  async getPosition(walletId, context) { /* -> LendingPositionSummary[] */ }
  async getHealthFactor(walletId, context) { /* -> HealthFactor */ }
  async getMarkets(chain, network?) { /* -> MarketInfo[] */ }

  // IPositionProvider (for PositionTracker)
  async getPositions(walletId) { /* -> PositionUpdate[] */ }
  getProviderName() { return 'aave_v3'; }
  getSupportedCategories() { return ['LENDING']; }
}
```

### Pattern 2: Approve + Action multi-step resolve (existing pattern)

**What:** ERC-20 tokens require approve before Pool interaction. resolve() returns [approveReq, actionReq] array.

**When:** supply (approve token -> Pool), repay (approve token -> Pool).

**Example:** Same pattern as LidoStakingActionProvider.resolveUnstake() which returns [approveReq, withdrawReq].

### Pattern 3: PositionWriteQueue batch upsert (IncomingTxQueue pattern)

**What:** Buffer position updates in a Map, flush with BEGIN IMMEDIATE + ON CONFLICT upsert.

**When:** Every PositionTracker sync cycle.

**Why:** Prevents SQLite write contention. Same pattern proven in IncomingTxQueue (v27.1).

### Pattern 4: Adaptive polling (HealthFactorMonitor)

**What:** setTimeout-based polling where interval changes based on current state severity.

**When:** HealthFactorMonitor needs faster polling as health factor deteriorates.

**Contrast:** PositionTracker uses fixed setInterval (predictable load). HealthFactorMonitor uses recursive setTimeout (dynamic interval).

## Anti-Patterns to Avoid

### Anti-Pattern 1: Direct RPC calls from monitors

**What:** HealthFactorMonitor making its own RPC calls to fetch positions.
**Why bad:** (1) RPC rate limit saturation, (2) Data inconsistency with PositionTracker, (3) Timing coupling between monitoring and data freshness.
**Instead:** Monitors read from defi_positions table (PositionTracker's cache). PositionTracker is the single owner of RPC position queries (DEC-MON-03).

### Anti-Pattern 2: Adding new discriminatedUnion types for lending

**What:** Adding SUPPLY/BORROW/REPAY/WITHDRAW to the 5-type discriminatedUnion.
**Why bad:** Changes cascade through entire pipeline (validator, policy, signing, broadcast, confirmation). Every stage would need handling for new types.
**Instead:** Lending actions flow as CONTRACT_CALL type. ContractCallRequest.metadata identifies them as lending actions for policy evaluation (DEC-LEND-09).

### Anti-Pattern 3: Extending BackgroundWorkers for PositionTracker

**What:** Using daemon's BackgroundWorkers for PositionTracker timers.
**Why bad:** BackgroundWorkers provides worker-per-interval. PositionTracker needs 4 different intervals for 4 categories.
**Instead:** Internal setInterval management within PositionTracker (same pattern as BalanceMonitorService) (DEC-MON-02).

### Anti-Pattern 4: Aave SDK dependency

**What:** Adding @aave/aave-v3-core or @aave/aave-utilities as dependencies.
**Why bad:** Heavy dependency for 4 function calls. viem's encodeFunctionData handles ABI encoding natively.
**Instead:** Minimal ABI fragments + viem encoding. Same approach used for Lido (lido-contract.ts) and 0x (DEC m29-02 decision 3).

## DaemonLifecycle Integration Order

Current Step 4c sequence ends at 4c-10 (AsyncPollingService). New services slot in after:

```
Step 4c-10: AsyncPollingService (existing)
Step 4c-10.5: PositionTracker initialization (NEW)
  - Create PositionTracker instance
  - Register IPositionProvider implementations (aave_v3)
  - positionTracker.start() (begins category timers)
Step 4c-11: DeFiMonitorService (NEW)
  - Create DeFiMonitorService
  - Register HealthFactorMonitor
  - deFiMonitorService.start()
  - Depends on: PositionTracker (reads defi_positions), NotificationService
Step 5: HTTP server start (existing)
Step 6: Background workers (existing)
```

**Registration in registerBuiltInProviders():**

```typescript
// packages/actions/src/index.ts -- extended
{
  key: 'aave_v3',
  enabledKey: 'actions.aave_v3_enabled',
  factory: () => {
    const config: AaveV3Config = {
      enabled: true,
      healthFactorWarningThreshold: Number(settingsReader.get('actions.aave_v3_health_factor_warning_threshold')),
      positionSyncIntervalSec: Number(settingsReader.get('actions.aave_v3_position_sync_interval_sec')),
      maxLtvPct: Number(settingsReader.get('actions.aave_v3_max_ltv_pct')),
    };
    return new AaveV3LendingProvider(config);
  },
}
```

AaveV3LendingProvider is registered with BOTH:
1. ActionProviderRegistry (for resolve -> pipeline execution)
2. PositionTracker (for getPositions -> defi_positions sync)

## Suggested Build Order

Based on dependency analysis:

### Phase 1: SSoT Enum + DB Migration + Core Interfaces

**Dependencies:** None (foundation layer)

| Component | Details |
|-----------|---------|
| `packages/core/src/enums/defi.ts` | POSITION_CATEGORIES, POSITION_STATUSES |
| `packages/core/src/enums/notification.ts` | +4 DeFi notification events |
| `packages/core/src/interfaces/lending-provider.types.ts` | ILendingProvider interface |
| `packages/core/src/interfaces/position-provider.types.ts` | IPositionProvider interface |
| `packages/core/src/schemas/position.schema.ts` | Position Zod schemas |
| `packages/core/src/schemas/lending.schema.ts` | LendingPositionSummary, HealthFactor schemas |
| DB migration v25 | defi_positions table + indexes |
| schema.ts | Drizzle table definition |
| Tests | Migration chain test, LATEST_SCHEMA_VERSION assertion updates |

### Phase 2: Lending Framework (PositionTracker + HealthFactorMonitor)

**Dependencies:** Phase 1 (defi_positions table, IPositionProvider interface)

| Component | Details |
|-----------|---------|
| `packages/daemon/src/services/defi/position-tracker.ts` | PositionTracker service |
| `packages/daemon/src/services/defi/position-write-queue.ts` | Batch upsert queue |
| `packages/daemon/src/services/defi/health-factor-monitor.ts` | Adaptive polling monitor |
| `packages/daemon/src/services/defi/defi-monitor-service.ts` | IDeFiMonitor registry + lifecycle |
| Notification templates | +4 DeFi event message templates |
| DaemonLifecycle | Step 4c-10.5 + 4c-11 integration |
| Tests | PositionTracker sync, HealthFactorMonitor thresholds, notification firing |

### Phase 3: Aave V3 Provider + Contract Integration

**Dependencies:** Phase 1 (ILendingProvider), Phase 2 (PositionTracker registration)

| Component | Details |
|-----------|---------|
| `packages/actions/src/providers/aave-v3/aave-contracts.ts` | ABI + address mapping |
| `packages/actions/src/providers/aave-v3/schemas.ts` | Input Zod schemas |
| `packages/actions/src/providers/aave-v3/config.ts` | AaveV3Config type |
| `packages/actions/src/providers/aave-v3/market-data.ts` | Market data queries |
| `packages/actions/src/providers/aave-v3/index.ts` | AaveV3LendingProvider class |
| `packages/actions/src/index.ts` | registerBuiltInProviders() extension |
| Tests | resolve() unit tests for supply/borrow/repay/withdraw, ABI encoding verification |

### Phase 4: Policy Integration + REST API + MCP

**Dependencies:** Phase 3 (AaveV3LendingProvider), Phase 2 (defi_positions)

| Component | Details |
|-----------|---------|
| DatabasePolicyEngine | Step 4h-a LENDING_ASSET_WHITELIST + step 4h-b LENDING_LTV_LIMIT |
| PolicyTypeEnum | Add 2 new types |
| `packages/daemon/src/api/routes/defi-positions.ts` | GET /positions, GET /health-factor |
| MCP tools | Auto-generated from mcpExpose=true (5 tools) |
| SDK extension | executeAction('aave_supply', params) |
| Skill files update | actions.skill.md |
| Tests | Policy evaluation tests (LTV deny, asset whitelist deny), API integration tests |

### Phase 5: Admin UI + E2E

**Dependencies:** Phase 4 (REST API endpoints)

| Component | Details |
|-----------|---------|
| Admin DeFi portfolio panel | Position table, health factor gauge |
| Admin policy forms | LENDING_LTV_LIMIT slider, LENDING_ASSET_WHITELIST picker |
| Admin Settings | aave_v3.* settings entries |
| E2E scenarios | Full supply->position-sync->health-check flow |

## Scalability Considerations

| Concern | At 1 wallet | At 10 wallets | At 100+ wallets |
|---------|-------------|---------------|-----------------|
| Position sync RPC calls | 1 getUserAccountData / 5 min | 10 calls / 5 min | Rate limit concern -- batch with multicall |
| defi_positions rows | ~5-10 rows | ~50-100 rows | PositionWriteQueue handles batching |
| HealthFactorMonitor polling | 1 position check | 10 position checks | Read from DB cache, not RPC -- scales linearly |
| Admin UI portfolio render | Instant | Instant | Paginate positions query |

**RPC optimization for scale:** Aave V3 getUserAccountData() returns the full account summary in one call. Per-asset positions require additional aToken/debtToken balanceOf calls. For 10+ wallets, consider batching via viem's multicall (one RPC request for multiple balanceOf).

## Sources

- [Aave V3 Pool Documentation](https://aave.com/docs/aave-v3/smart-contracts/pool) -- function signatures verified (HIGH confidence)
- [Aave V3 Pool Contract on Etherscan](https://etherscan.io/address/0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2) -- Ethereum mainnet address verified (HIGH confidence)
- [Aave V3 Pool on Arbitrum](https://arbiscan.io/address/0x794a61358d6845594f94dc1db02a252b5b4814ad) -- Arbitrum address verified (HIGH confidence)
- [Aave V3 Pool on Polygon](https://polygonscan.com/address/0x794a61358D6845594F94dc1DB02A252b5b4814aD) -- Polygon address verified (HIGH confidence)
- [Aave Addresses Dashboard](https://aave.com/docs/resources/addresses) -- official deployment addresses (HIGH confidence)
- [@bgd-labs/aave-address-book](https://www.npmjs.com/package/@bgd-labs/aave-address-book) -- programmatic address lookup (HIGH confidence)
- m29-00 design document (shipped) -- ILendingProvider, PositionTracker, HealthFactorMonitor, LendingPolicyEvaluator complete specifications (HIGH confidence)
- m29-02 objective document -- Aave V3 integration scope and E2E scenarios (HIGH confidence)
- Existing codebase: IActionProvider, ActionProviderRegistry, LidoStakingActionProvider, DatabasePolicyEngine -- verified patterns (HIGH confidence)
