# Architecture Patterns: Advanced DeFi Protocol Integration (Lending/Yield/Perp)

**Domain:** ILendingProvider/IYieldProvider/IPerpProvider integration into existing WAIaaS IActionProvider architecture
**Researched:** 2026-02-26
**Confidence:** HIGH (architecture decisions grounded in existing codebase analysis, 5 existing providers as precedent)

---

## 1. Existing Architecture Inventory

Before defining new components, here is what already exists and must NOT be duplicated.

### 1.1 IActionProvider + ActionProviderRegistry (packages/core, packages/daemon)

```typescript
// Existing contract -- ALL DeFi actions resolve to ContractCallRequest
interface IActionProvider {
  readonly metadata: ActionProviderMetadata;
  readonly actions: readonly ActionDefinition[];
  resolve(actionName: string, params: Record<string, unknown>, context: ActionContext):
    Promise<ContractCallRequest | ContractCallRequest[]>;
}
```

**Registry flow:** `register() -> executeResolve() -> inputSchema.parse() -> resolve() -> ContractCallRequestSchema.parse() -> actionProvider tag`

**5 existing providers:** JupiterSwap, ZeroExSwap, LiFi, LidoStaking, JitoStaking -- all follow this exact pattern.

### 1.2 6-Stage Pipeline (packages/daemon/src/pipeline)

```
Stage 1: Validate request + INSERT PENDING
Stage 2: Auth (sessionId)
Stage 3: Policy evaluation (evaluateAndReserve)
Stage 3.5: Gas condition check (optional, GAS_WAITING)
Stage 4: Wait (DELAY queue / APPROVAL workflow)
Stage 5: On-chain execution (build -> simulate -> sign -> submit)
Stage 6: Confirmation
```

All 5 existing providers produce `ContractCallRequest[]` that flows through this unchanged pipeline.

### 1.3 IAsyncStatusTracker + AsyncPollingService (packages/actions, packages/daemon)

```typescript
interface IAsyncStatusTracker {
  checkStatus(txId: string, metadata: Record<string, unknown>): Promise<AsyncTrackingResult>;
  readonly name: string;
  readonly maxAttempts: number;
  readonly pollIntervalMs: number;
  readonly timeoutTransition: 'TIMEOUT' | 'BRIDGE_MONITORING' | 'CANCELLED';
}
```

**AsyncPollingService** queries DB for `bridge_status IN ('PENDING', 'BRIDGE_MONITORING') OR status = 'GAS_WAITING'`, calls registered trackers.

**3 existing trackers:** BridgeStatusTracker, LidoWithdrawalTracker, JitoEpochTracker -- all use `transactions.bridgeStatus` + `transactions.bridgeMetadata` JSON.

### 1.4 EventBus + Notification System (packages/core, packages/daemon)

```typescript
// 7 event types in WaiaasEventMap
'transaction:completed' | 'transaction:failed' | 'transaction:incoming' |
'transaction:incoming:suspicious' | 'wallet:activity' |
'kill-switch:state-changed' | 'approval:channel-switched'
```

**35 notification event types** already defined in `EVENT_CATEGORY_MAP`. DeFi-specific: BRIDGE_COMPLETED, BRIDGE_FAILED, STAKING_UNSTAKE_COMPLETED, etc.

### 1.5 BalanceMonitorService (packages/daemon)

```typescript
// 5-min interval, per-wallet polling, chain-specific thresholds, 24h cooldown
class BalanceMonitorService {
  start(): void;                      // setInterval
  stop(): void;                       // clearInterval
  checkAllWallets(): Promise<void>;   // query ACTIVE wallets, check balance
  updateConfig(config): void;         // hot-reload from Admin Settings
}
```

### 1.6 DB Schema (17 tables, v24 migration)

**transactions table** already has: `bridgeStatus`, `bridgeMetadata` (JSON text) for async tracking. No `positions` table exists yet.

### 1.7 discriminatedUnion 7-type

```
TRANSFER | TOKEN_TRANSFER | CONTRACT_CALL | APPROVE | BATCH | SIGN | X402_PAYMENT
```

All DeFi actions resolve to `CONTRACT_CALL` type. No new type needed.

---

## 2. Architecture Decision: Extend IActionProvider, Not Replace It

### Decision: ILendingProvider/IYieldProvider/IPerpProvider are NOT new interfaces

**Rationale:** The existing IActionProvider already handles the transaction production lifecycle perfectly. Every DeFi protocol operation (supply, borrow, deposit into vault, open perp position) ultimately produces one or more `ContractCallRequest` objects that flow through the 6-stage pipeline.

Creating separate `ILendingProvider`, `IYieldProvider`, `IPerpProvider` interfaces would:
- Bypass the existing policy engine evaluation
- Require a parallel pipeline
- Break MCP auto-tool generation
- Duplicate the register/execute/validate pattern

### What to do instead

Create **new IActionProvider implementations** that expose protocol-specific actions:

```typescript
// packages/actions/src/providers/aave-lending/index.ts
class AaveLendingActionProvider implements IActionProvider {
  metadata = { name: 'aave_lending', chains: ['ethereum'], mcpExpose: true, ... };
  actions = [
    { name: 'supply', ... },
    { name: 'borrow', ... },
    { name: 'repay', ... },
    { name: 'withdraw', ... },
  ];
  resolve(actionName, params, context): Promise<ContractCallRequest[]> { ... }
}
```

This means the agent calls `POST /v1/actions/aave_lending/supply` the same way it calls `POST /v1/actions/jupiter_swap/jupiter_swap`. Zero new API endpoints needed.

---

## 3. New Component: PositionTracker

### 3.1 Why PositionTracker Cannot Be IAsyncStatusTracker

IAsyncStatusTracker is designed for **fire-and-forget async operations with terminal states** (PENDING -> COMPLETED/FAILED/TIMEOUT). DeFi positions are fundamentally different:

| Aspect | IAsyncStatusTracker | PositionTracker |
|--------|---------------------|-----------------|
| Lifecycle | Finite (tx completes) | Indefinite (position persists) |
| Terminal state | COMPLETED/FAILED/TIMEOUT | Only on explicit close |
| Data scope | Single transaction metadata | Multi-metric (health factor, APY, PnL) |
| Polling target | `transactions` table | New `positions` table |
| Key metric | Bridge/staking completion status | Health factor, margin ratio, maturity date |

### 3.2 PositionTracker Architecture

```
                 PositionTracker
                 (new service in packages/daemon)
                       |
          +-----------+-----------+
          |           |           |
    IPositionReader  DB positions  EventBus
    (per-protocol)   (new table)   (existing)
```

```typescript
// packages/core/src/interfaces/position.types.ts (NEW)

interface IPositionReader {
  /** Protocol identifier matching ActionProvider name */
  readonly protocolName: string;
  /** Supported chains for this reader */
  readonly chains: readonly ChainType[];
  /**
   * Read current position state from chain.
   * Returns null if no position exists.
   */
  readPosition(
    walletAddress: string,
    chain: ChainType,
    network: NetworkType,
    metadata: Record<string, unknown>,
  ): Promise<PositionSnapshot | null>;
}

interface PositionSnapshot {
  protocol: string;
  positionType: 'lending' | 'yield' | 'perp';
  /** Protocol-specific metrics */
  metrics: Record<string, unknown>;
  /** Human-readable summary for AI agent */
  summary: string;
  /** Risk score 0-100 (0=safe, 100=liquidation imminent) */
  riskScore: number;
  /** When this snapshot was taken */
  timestamp: number;
}
```

### 3.3 Relationship: PositionTracker alongside IAsyncStatusTracker

```
AsyncPollingService                    PositionTracker
(existing, 30s interval)              (new, configurable interval)
     |                                      |
     |-- BridgeStatusTracker               |-- AavePositionReader
     |-- LidoWithdrawalTracker             |-- YearnPositionReader
     |-- JitoEpochTracker                  |-- GmxPositionReader
     |-- GasConditionTracker               |
     |                                      |
     v                                      v
transactions.bridgeStatus              positions table (NEW)
transactions.bridgeMetadata            positions.metrics (JSON)
```

**Key:** PositionTracker is a **separate BackgroundWorker** (not registered with AsyncPollingService). It queries the new `positions` table for open positions and calls the appropriate `IPositionReader` for each.

### 3.4 positions DB Table (NEW - DB v25 migration)

```sql
CREATE TABLE positions (
  id TEXT PRIMARY KEY,                    -- UUID v7
  wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  protocol TEXT NOT NULL,                 -- 'aave_lending', 'yearn_vault', 'gmx_perp'
  position_type TEXT NOT NULL,            -- 'lending', 'yield', 'perp'
  chain TEXT NOT NULL,
  network TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',    -- OPEN | CLOSED | LIQUIDATED
  -- Protocol-specific identifiers
  external_id TEXT,                       -- Protocol position ID (e.g., Aave user address, vault address)
  -- Tracking metadata (JSON, updated by PositionTracker)
  metrics TEXT,                           -- Latest PositionSnapshot.metrics as JSON
  risk_score INTEGER,                     -- 0-100 from latest snapshot
  summary TEXT,                           -- Human-readable from latest snapshot
  -- Timestamps
  opened_at INTEGER NOT NULL,             -- Unix epoch seconds
  closed_at INTEGER,
  last_checked_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  -- Indexes
  CHECK (status IN ('OPEN', 'CLOSED', 'LIQUIDATED')),
  CHECK (position_type IN ('lending', 'yield', 'perp'))
);
CREATE INDEX idx_positions_wallet_status ON positions(wallet_id, status);
CREATE INDEX idx_positions_protocol ON positions(protocol);
CREATE INDEX idx_positions_risk_score ON positions(risk_score);
```

### 3.5 Position Lifecycle

```
Agent calls: POST /v1/actions/aave_lending/supply
    |
    v
AaveLendingActionProvider.resolve()
    |
    v
ContractCallRequest[] -> 6-stage pipeline
    |
    v
Transaction CONFIRMED
    |
    v (EventBus: transaction:completed listener)
PositionTracker.onTransactionCompleted()
    |
    v
INSERT INTO positions (protocol='aave_lending', status='OPEN', ...)
    |
    v
BackgroundWorker polls PositionTracker every N minutes
    |
    v
AavePositionReader.readPosition() -> PositionSnapshot
    |
    v
UPDATE positions SET metrics=..., risk_score=..., last_checked_at=...
```

---

## 4. DeFi Monitoring: 3 Monitor Types via EventBus Integration

### 4.1 Architecture: DeFiMonitorService (Single Service, Multiple Rules)

Do NOT create 3 separate services. Create one `DeFiMonitorService` that runs as a BackgroundWorker and evaluates multiple monitor rules against the positions table.

```typescript
// packages/daemon/src/services/monitoring/defi-monitor-service.ts (NEW)

interface IDeFiMonitorRule {
  /** Rule name for logging and settings */
  readonly name: string;
  /** Position types this rule applies to */
  readonly appliesTo: PositionType[];
  /**
   * Evaluate a position snapshot and return alert events if thresholds breached.
   * Returns empty array if everything is fine.
   */
  evaluate(
    position: PositionRow,
    snapshot: PositionSnapshot,
  ): DeFiAlert[];
}

interface DeFiAlert {
  eventType: string;           // New notification event type
  severity: 'warning' | 'critical';
  walletId: string;
  details: Record<string, unknown>;
}
```

### 4.2 Three Built-in Monitor Rules

```
DeFiMonitorService (BackgroundWorker, 2-min interval)
     |
     +-- HealthFactorRule       (applies to: 'lending')
     |     threshold_warning: 1.5
     |     threshold_critical: 1.2
     |     -> DEFI_HEALTH_FACTOR_WARNING
     |     -> DEFI_HEALTH_FACTOR_CRITICAL
     |
     +-- MaturityRule           (applies to: 'yield')
     |     warn_before_hours: 24
     |     -> DEFI_MATURITY_APPROACHING
     |
     +-- MarginRule             (applies to: 'perp')
           threshold_warning: 0.15   (15% margin ratio)
           threshold_critical: 0.08  (8% margin ratio)
           -> DEFI_MARGIN_WARNING
           -> DEFI_MARGIN_CRITICAL
```

### 4.3 EventBus Integration

New notification event types to add to the existing `WaiaasEventMap` and `EVENT_CATEGORY_MAP`:

```typescript
// Additions to packages/core/src/events/event-types.ts

interface DeFiPositionEvent {
  walletId: string;
  positionId: string;
  protocol: string;
  positionType: string;
  riskScore: number;
  details: Record<string, unknown>;
  timestamp: number;
}

// Add to WaiaasEventMap:
'defi:position-alert': DeFiPositionEvent;

// New notification event types:
DEFI_HEALTH_FACTOR_WARNING   -> category: 'security_alert'
DEFI_HEALTH_FACTOR_CRITICAL  -> category: 'security_alert'
DEFI_MATURITY_APPROACHING    -> category: 'transaction'
DEFI_MARGIN_WARNING          -> category: 'security_alert'
DEFI_MARGIN_CRITICAL         -> category: 'security_alert'
DEFI_POSITION_OPENED         -> category: 'transaction'
DEFI_POSITION_CLOSED         -> category: 'transaction'
DEFI_POSITION_LIQUIDATED     -> category: 'security_alert'
```

### 4.4 Notification Flow (Reuses Existing NotificationService)

```
DeFiMonitorService.checkAllPositions()
     |
     v (for each OPEN position)
IPositionReader.readPosition()
     |
     v
UPDATE positions SET metrics, risk_score
     |
     v (for each applicable rule)
IDeFiMonitorRule.evaluate(position, snapshot)
     |
     v (if alerts returned)
NotificationService.notify(alert.eventType, alert.walletId, alert.details)
     |
     v (existing 4-channel pipeline)
Telegram / Discord / ntfy / Slack
```

**Cooldown:** Reuse the existing per-wallet per-event cooldown in NotificationService. No new cooldown mechanism needed.

---

## 5. Intent Pattern + EIP-712 Signing

### 5.1 Problem Statement

Some DeFi protocols (GMX V2, CoW Swap, 1inch Fusion) use an **intent/order pattern** instead of direct contract calls:
1. User signs a typed message (EIP-712) off-chain
2. Keeper/relayer executes the order on-chain
3. No direct `ContractCallRequest` is produced by the user

This pattern does NOT fit the current `resolve() -> ContractCallRequest[]` model.

### 5.2 Decision: Add signTypedData to IChainAdapter (EVM Only)

The existing `IChainAdapter.signExternalTransaction()` signs raw transaction bytes. EIP-712 requires signing **structured typed data**, which is a fundamentally different operation.

```typescript
// Addition to IChainAdapter (packages/core)
interface IChainAdapter {
  // ... existing 22 methods ...

  /**
   * Sign EIP-712 typed structured data.
   * Returns the signature string (65 bytes, hex-encoded).
   * Only applicable to EVM chains.
   */
  signTypedData?(
    domain: TypedDataDomain,
    types: Record<string, TypedDataField[]>,
    value: Record<string, unknown>,
    privateKey: Uint8Array,
  ): Promise<string>;
}
```

### 5.3 How Intent Pattern Coexists with ContractCallRequest Pipeline

```
Option A: Protocol produces ContractCallRequest
  resolve() -> ContractCallRequest[] -> 6-stage pipeline
  (Aave supply, Lido stake, Jupiter swap, etc.)

Option B: Protocol produces Intent/Order (EIP-712 sign)
  resolve() returns EMPTY ContractCallRequest[] (dummy marker)
  + resolveIntent() returns IntentRequest (NEW method)
  -> sign-only-like pipeline variant
  -> tracks via positions table (not transactions)
```

**Recommended approach:** Add an optional `resolveIntent()` method to IActionProvider:

```typescript
// Extension to IActionProvider (packages/core)
interface IntentRequest {
  /** EIP-712 domain */
  domain: TypedDataDomain;
  /** EIP-712 types */
  types: Record<string, TypedDataField[]>;
  /** EIP-712 value to sign */
  value: Record<string, unknown>;
  /** Human-readable summary for approval display */
  displayMessage: string;
  /** Expected outcome description for AI agent */
  expectedOutcome: string;
}

interface IActionProvider {
  // ... existing methods ...

  /**
   * Optional: resolve action to an EIP-712 intent request.
   * When this returns non-null, the pipeline uses sign-typed-data instead of submit.
   * The signed intent is returned to the caller (or submitted to a relayer).
   */
  resolveIntent?(
    actionName: string,
    params: Record<string, unknown>,
    context: ActionContext,
  ): Promise<IntentRequest | null>;
}
```

### 5.4 Intent Pipeline Flow

```
POST /v1/actions/gmx_perp/open_position
    |
    v
ActionProviderRegistry.executeResolve()
    |
    v (checks if provider has resolveIntent)
GmxPerpActionProvider.resolveIntent('open_position', params, context)
    |
    v
IntentRequest { domain, types, value, displayMessage }
    |
    v
Policy evaluation (custom: evaluate intent value/risk)
    |
    v
IChainAdapter.signTypedData(domain, types, value, privateKey)
    |
    v
INSERT INTO transactions (type='SIGN', metadata={ intent: true, protocol: 'gmx_perp' })
    |
    v
Return signed intent to caller
    |
    v (optional: relayer submission)
Track outcome via PositionTracker
```

### 5.5 Sign-Only Pipeline Reuse

The existing sign-only pipeline (`executeSignOnly()`) already handles the pattern of "sign but don't submit." The intent pipeline is a **variant** that:
1. Uses `signTypedData` instead of `signExternalTransaction`
2. Records with `type='SIGN'` in transactions table
3. Creates a position entry for ongoing tracking

This avoids creating a 3rd pipeline variant. The sign-only infrastructure can be extended.

---

## 6. Component Boundaries

### 6.1 New Components Summary

| Component | Package | Type | Responsibility |
|-----------|---------|------|----------------|
| AaveLendingActionProvider | packages/actions | IActionProvider impl | Produce ContractCallRequest for supply/borrow/repay/withdraw |
| KaminoLendingActionProvider | packages/actions | IActionProvider impl | Solana lending (supply/borrow/repay/withdraw) |
| YearnVaultActionProvider | packages/actions | IActionProvider impl | ERC-4626 vault deposit/withdraw |
| GmxPerpActionProvider | packages/actions | IActionProvider impl | Perp long/short/close + resolveIntent() |
| IPositionReader | packages/core | Interface | Read position state from chain |
| AavePositionReader | packages/actions | IPositionReader impl | Read Aave position (health factor, collateral, debt) |
| KaminoPositionReader | packages/actions | IPositionReader impl | Read Kamino position |
| YearnPositionReader | packages/actions | IPositionReader impl | Read vault share value |
| GmxPositionReader | packages/actions | IPositionReader impl | Read perp position (margin, PnL, liquidation price) |
| PositionTracker | packages/daemon | Service | Poll open positions, update metrics, detect state changes |
| DeFiMonitorService | packages/daemon | Service (BackgroundWorker) | Evaluate monitor rules, emit alerts |
| HealthFactorRule | packages/daemon | IDeFiMonitorRule impl | Lending health factor thresholds |
| MaturityRule | packages/daemon | IDeFiMonitorRule impl | Yield maturity date warnings |
| MarginRule | packages/daemon | IDeFiMonitorRule impl | Perp margin ratio thresholds |
| positions table | packages/daemon | DB table (v25 migration) | Position state persistence |

### 6.2 Modified Components

| Component | Package | Change |
|-----------|---------|--------|
| IActionProvider | packages/core | Add optional `resolveIntent()` method |
| IChainAdapter | packages/core | Add optional `signTypedData()` method |
| EvmAdapter | packages/adapter-evm | Implement `signTypedData()` via viem |
| WaiaasEventMap | packages/core | Add `defi:position-alert` event |
| NotificationEventType enum | packages/core | Add 8 DEFI_* event types |
| EVENT_CATEGORY_MAP | packages/core | Map new events to categories |
| DaemonLifecycle | packages/daemon | Register PositionTracker + DeFiMonitorService |
| BackgroundWorkers | packages/daemon | Register defi-position-check worker |
| registerBuiltInProviders() | packages/actions | Add new provider factories |
| Admin Settings | packages/admin | DeFi monitor thresholds UI |

### 6.3 Unchanged Components

| Component | Why Unchanged |
|-----------|---------------|
| ActionProviderRegistry | Generic register/execute works for all new providers |
| 6-stage pipeline | ContractCallRequest flows through unchanged |
| Sign-only pipeline | Reused for intent signing with minor extension |
| AsyncPollingService | Not used for positions (separate PositionTracker) |
| BalanceMonitorService | Separate concern (native balance vs DeFi positions) |
| MCP action-provider tools | Auto-discovery via mcpExpose=true works |
| REST /v1/actions/:provider/:action | Generic handler works for all new providers |
| SDK/Python SDK | Use existing action execution API |
| Policy engine | Existing CONTRACT_WHITELIST + SPENDING_LIMIT apply |

---

## 7. Data Flow Diagrams

### 7.1 Lending Protocol (Aave): Supply Flow

```
AI Agent: "Supply 1 ETH to Aave"
    |
    v
POST /v1/actions/aave_lending/supply { amount: "1.0" }
    |
    v
AaveLendingActionProvider.resolve('supply', { amount: "1.0" }, ctx)
    |
    ├── Encode: Pool.supply(asset, amount, onBehalfOf, referralCode)
    v
[ContractCallRequest { to: PoolAddress, calldata: "0x...", value: "1000000000000000000" }]
    |
    v
6-stage pipeline: validate -> policy -> sign -> submit -> confirm
    |
    v
transaction:completed event
    |
    v (PositionTracker listener)
INSERT INTO positions (protocol='aave_lending', position_type='lending', status='OPEN')
    |
    v (BackgroundWorker, every 2 min)
AavePositionReader.readPosition(walletAddress, chain, network)
    -> Pool.getUserAccountData() -> { healthFactor, totalCollateral, totalDebt }
    |
    v
UPDATE positions SET metrics = { healthFactor: 2.1, ... }, risk_score = 15
    |
    v (DeFiMonitorService)
HealthFactorRule.evaluate() -> no alert (HF 2.1 > 1.5 threshold)
```

### 7.2 Lending Protocol (Aave): Health Factor Alert Flow

```
(Market crash: ETH price drops 30%)
    |
    v (BackgroundWorker polls)
AavePositionReader.readPosition()
    -> { healthFactor: 1.3, totalCollateral: ..., totalDebt: ... }
    |
    v
UPDATE positions SET risk_score = 72, metrics = { healthFactor: 1.3, ... }
    |
    v
HealthFactorRule.evaluate()
    -> [{ eventType: 'DEFI_HEALTH_FACTOR_WARNING', severity: 'warning' }]
    |
    v
EventBus.emit('defi:position-alert', { walletId, positionId, riskScore: 72 })
    |
    v
NotificationService.notify('DEFI_HEALTH_FACTOR_WARNING', walletId, {
  protocol: 'aave_lending',
  healthFactor: '1.3',
  threshold: '1.5',
  message: 'Health factor dropped to 1.3. Consider adding collateral or repaying debt.'
})
    |
    v
Telegram / Discord / ntfy / Slack (existing 4-channel pipeline)
```

### 7.3 Perp Protocol (GMX): Intent-Based Order Flow

```
AI Agent: "Open 2x long ETH/USD with 0.5 ETH collateral"
    |
    v
POST /v1/actions/gmx_perp/open_long { ... }
    |
    v
GmxPerpActionProvider.resolveIntent('open_long', params, ctx)
    -> IntentRequest { domain: { name: 'GMX', ... }, types: { Order: [...] }, value: { ... } }
    |
    v (ActionProviderRegistry detects resolveIntent)
Policy evaluation (amount check on collateral value)
    |
    v
EvmAdapter.signTypedData(domain, types, value, privateKey)
    -> "0x..." (EIP-712 signature)
    |
    v
INSERT INTO transactions (type='SIGN', metadata={ intent: true, protocol: 'gmx_perp' })
    |
    v
Return { signedIntent, signature } to agent
    |
    v (Agent or auto-relay submits to GMX keeper network)
    |
    v (PositionTracker detects)
INSERT INTO positions (protocol='gmx_perp', position_type='perp', status='OPEN')
    |
    v (BackgroundWorker, every 2 min)
GmxPositionReader -> { marginRatio: 0.25, unrealizedPnl: "+$120", liquidationPrice: "$2,100" }
```

### 7.4 Yield Protocol (ERC-4626): Vault Deposit Flow

```
AI Agent: "Deposit 1000 USDC into Yearn vault"
    |
    v
POST /v1/actions/yearn_vault/deposit { amount: "1000", vault: "0x..." }
    |
    v
YearnVaultActionProvider.resolve('deposit', params, ctx)
    |
    ├── Step 1: approve(vault, amount) -- ERC-20 approval
    ├── Step 2: vault.deposit(amount, receiver) -- ERC-4626 deposit
    v
[ContractCallRequest (approve), ContractCallRequest (deposit)]
    |
    v
6-stage pipeline (sequential: approve first, then deposit)
    |
    v
transaction:completed
    |
    v
INSERT INTO positions (protocol='yearn_vault', position_type='yield', status='OPEN')
    -> metrics: { shareBalance, pricePerShare, depositedAmount, maturityDate }
```

---

## 8. REST API Extensions

### 8.1 Position Endpoints (NEW)

```
GET  /v1/positions                       -- List positions (filterable by protocol, type, status)
GET  /v1/positions/:id                   -- Position detail with latest snapshot
GET  /v1/wallet/positions                -- Positions for current wallet
POST /v1/positions/:id/refresh           -- Force refresh position state
```

These are new REST routes in packages/daemon. They query the `positions` table directly. No pipeline involvement.

### 8.2 MCP Tools (NEW, auto-generated)

All new ActionProvider actions automatically become MCP tools (via existing `mcpExpose: true`):
- `aave_lending/supply`, `aave_lending/borrow`, `aave_lending/repay`, `aave_lending/withdraw`
- `yearn_vault/deposit`, `yearn_vault/withdraw`
- `gmx_perp/open_long`, `gmx_perp/open_short`, `gmx_perp/close`

Additional manual MCP tools:
- `list_positions` -- queries positions table
- `check_position` -- force-refresh a position

### 8.3 Admin UI Extensions

- New "DeFi" menu section (or extend "Tokens" to "Assets & DeFi")
- Position viewer: table of open positions with risk scores, protocol, metrics
- DeFi monitor settings: health factor/margin/maturity thresholds (Admin Settings)
- Position detail modal: metrics history, alert history

---

## 9. Scalability Considerations

| Concern | 1-5 positions | 50 positions | 500+ positions |
|---------|---------------|--------------|----------------|
| Position polling | Serial, 2-min interval fine | Serial OK, increase interval to 5 min | Batch per-protocol calls, stagger wallets |
| DB queries | Single SELECT | Indexed on (wallet_id, status) | Partition by protocol, archive CLOSED |
| RPC calls | 1 per position | 50 per cycle = 25/min | Rate limit risk; use AdapterPool + RPC Pool |
| Memory | Negligible | ~50KB snapshots | Cap in-memory cache, rely on DB |
| Notifications | Immediate | Batch by wallet (existing) | Existing cooldown handles dedup |

---

## 10. Patterns to Follow

### Pattern 1: ActionProvider per Protocol (Consistent with Existing)

```typescript
// CORRECT: One ActionProvider per protocol, matching existing pattern
class AaveLendingActionProvider implements IActionProvider {
  metadata = { name: 'aave_lending', ... };
  actions = [supply, borrow, repay, withdraw];
}

// WRONG: Generic "lending" provider for all protocols
class GenericLendingProvider { ... }  // DON'T DO THIS
```

**Rationale:** Each protocol has unique contract ABIs, safety checks, and configuration. Jupiter/0x/LiFi/Lido/Jito are each separate providers. Continue this pattern.

### Pattern 2: ABI Encoding in Dedicated Module (Like lido-contract.ts)

```typescript
// packages/actions/src/providers/aave-lending/aave-contracts.ts
export function encodeSupplyCalldata(asset: string, amount: bigint, onBehalfOf: string): string;
export function encodeRepayCalldata(asset: string, amount: bigint, onBehalfOf: string): string;
```

### Pattern 3: PositionReader Separate from ActionProvider

```typescript
// ActionProvider: writes (produces transactions)
// PositionReader: reads (queries on-chain state)
// Keep these separate -- different concerns, different lifecycle
```

### Pattern 4: Metrics as JSON in DB (Like bridgeMetadata)

```typescript
// CORRECT: flexible JSON for protocol-specific metrics
positions.metrics = JSON.stringify({ healthFactor: 1.8, totalCollateral: "2.5", ... })

// WRONG: individual columns per metric
positions.health_factor REAL  // Too rigid for diverse protocols
```

---

## 11. Anti-Patterns to Avoid

### Anti-Pattern 1: Separate Pipeline for DeFi

**What:** Creating a "DeFi pipeline" alongside the 6-stage pipeline.
**Why bad:** Duplicates policy engine, signing, notification logic. Doubles maintenance burden.
**Instead:** All DeFi operations resolve to ContractCallRequest[], flow through existing pipeline.

### Anti-Pattern 2: PositionTracker Inside AsyncPollingService

**What:** Registering position readers as IAsyncStatusTracker.
**Why bad:** AsyncPollingService assumes transactions table with bridgeStatus. Positions are perpetual, not transactional. Terminal state semantics don't apply.
**Instead:** Separate BackgroundWorker for position polling.

### Anti-Pattern 3: Hardcoded Protocol Addresses in Core

**What:** Putting Aave Pool address, GMX ExchangeRouter address in @waiaas/core.
**Why bad:** Core should be protocol-agnostic. Addresses change per network.
**Instead:** Protocol addresses in config.ts per provider (same pattern as LidoStakingConfig).

### Anti-Pattern 4: Polling Chain State Without Position Table

**What:** Querying Aave getUserAccountData() for every wallet on every cycle.
**Why bad:** O(wallets * protocols) RPC calls. Most wallets have no DeFi positions.
**Instead:** Only poll wallets with OPEN positions in the positions table.

### Anti-Pattern 5: Intent Signing Bypassing Policy Engine

**What:** EIP-712 signing without policy evaluation.
**Why bad:** Agent could sign unlimited orders without spending limits or owner approval.
**Instead:** Intent requests go through policy evaluation (amount/value assessment) before signing.

---

## 12. Suggested Build Order

The build order considers dependencies and delivers incremental value.

### Phase 1: Position Infrastructure (Foundation)

Build the positions table + PositionTracker service + IPositionReader interface FIRST, because all 3 frameworks depend on it.

**New:**
- `positions` table (DB v25 migration)
- IPositionReader interface in packages/core
- PositionTracker service in packages/daemon
- DeFiPositionEvent in EventBus
- GET /v1/positions REST endpoints
- list_positions MCP tool

**Modified:**
- DaemonLifecycle (register PositionTracker)
- BackgroundWorkers (register defi-position-check)
- WaiaasEventMap (add defi:position-alert)

**Zero protocol implementation yet.** This phase is pure infrastructure.

### Phase 2: DeFi Monitor Service (Before Any Protocol)

Build the monitoring rules engine so that when protocols are added, monitoring works immediately.

**New:**
- DeFiMonitorService (BackgroundWorker)
- IDeFiMonitorRule interface
- HealthFactorRule, MaturityRule, MarginRule
- 8 DEFI_* notification event types
- Admin Settings for thresholds

**Modified:**
- NotificationEventType enum (add 8 types)
- EVENT_CATEGORY_MAP (map new events)
- EVENT_DESCRIPTIONS (add descriptions)

### Phase 3: Lending Framework (Aave + Kamino)

First actual protocol implementation. Lending is the simplest -- supply/borrow/repay/withdraw all produce ContractCallRequest.

**New:**
- AaveLendingActionProvider + AavePositionReader
- KaminoLendingActionProvider + KaminoPositionReader (Solana)
- aave-contracts.ts (ABI encodings)
- kamino-client.ts (program instruction builders)

**Modified:**
- registerBuiltInProviders() (add aave_lending, kamino_lending)
- Admin Settings (protocol-specific config)

### Phase 4: Yield Framework (ERC-4626 Vaults)

ERC-4626 standardization makes this relatively straightforward.

**New:**
- YearnVaultActionProvider + YearnPositionReader
- erc4626-helpers.ts (standardized ABI for deposit/withdraw/previewRedeem)

**Modified:**
- registerBuiltInProviders() (add yearn_vault)

### Phase 5: Perp Framework (GMX V2) + Intent Pattern

Most complex due to intent/EIP-712 signing. Depends on signTypedData in EvmAdapter.

**New:**
- GmxPerpActionProvider + GmxPositionReader
- resolveIntent() on IActionProvider
- signTypedData() on IChainAdapter + EvmAdapter implementation
- Intent pipeline extension to sign-only flow
- gmx-contracts.ts (order encoding, position reading)

**Modified:**
- IActionProvider interface (add optional resolveIntent)
- IChainAdapter interface (add optional signTypedData)
- EvmAdapter (implement signTypedData via viem)
- ActionProviderRegistry (handle resolveIntent flow)

### Phase 6: Admin UI + DX Polish

**New:**
- DeFi positions viewer page
- Position detail modal
- Monitor settings UI
- Skill file updates (defi.skill.md)

**Modified:**
- Admin menu (add DeFi section)
- MCP tools (add position management tools)
- SDK types (add position types)

---

## 13. Sources

### Codebase Analysis (PRIMARY - HIGH confidence)
- `/packages/core/src/interfaces/action-provider.types.ts` -- IActionProvider interface
- `/packages/daemon/src/infrastructure/action/action-provider-registry.ts` -- Registry pattern
- `/packages/actions/src/common/async-status-tracker.ts` -- IAsyncStatusTracker interface
- `/packages/daemon/src/services/async-polling-service.ts` -- AsyncPollingService
- `/packages/core/src/events/event-bus.ts` -- EventBus
- `/packages/core/src/events/event-types.ts` -- WaiaasEventMap, 7 events
- `/packages/core/src/schemas/signing-protocol.ts` -- SignRequest/SignResponse, 35 notification events
- `/packages/daemon/src/services/monitoring/balance-monitor-service.ts` -- Monitor pattern
- `/packages/daemon/src/services/incoming/incoming-tx-monitor-service.ts` -- Monitor pattern
- `/packages/daemon/src/pipeline/pipeline.ts` -- 6-stage pipeline
- `/packages/daemon/src/pipeline/sign-only.ts` -- Sign-only pipeline
- `/packages/daemon/src/infrastructure/database/schema.ts` -- 17 tables
- `/packages/actions/src/providers/lido-staking/index.ts` -- Provider pattern (2-step resolve)
- `/packages/actions/src/providers/lifi/index.ts` -- Provider pattern (API client)
- `/packages/actions/src/index.ts` -- registerBuiltInProviders()
- `/packages/daemon/src/lifecycle/daemon.ts` -- Service registration lifecycle
- `/packages/daemon/src/lifecycle/workers.ts` -- BackgroundWorkers

### Web Research (MEDIUM confidence)
- [Aave V3 TypeScript SDK](https://aave.com/docs/aave-v3/getting-started/typescript) -- AaveKit modular SDK
- [Aave Health Factor Architecture](https://updraft.cyfrin.io/courses/aave-v3/contract-architecture/health-factor) -- HF calculation
- [ERC-4626 Tokenized Vault Standard](https://eco.com/support/en/articles/12068953-understanding-erc-4626) -- Vault interface
- [GMX Contract Architecture](https://updraft.cyfrin.io/courses/gmx-perpetuals-trading/foundation/gmx-contract-architecture) -- ExchangeRouter + DataStore
- [EIP-712 viem signTypedData](https://viem.sh/docs/actions/wallet/signTypedData.html) -- TypeScript signing
- [Kamino Finance Architecture](https://medium.com/@Scoper/solana-defi-deep-dives-kamino-late-2025-080f6f52fa29) -- Solana lending
- [Event-Driven DeFi Portfolio Tracker (AWS)](https://aws.amazon.com/blogs/web3/implementing-an-event-driven-defi-portfolio-tracker-on-aws/) -- Monitoring architecture
