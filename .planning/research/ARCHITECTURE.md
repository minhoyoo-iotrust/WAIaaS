# Architecture Patterns: Hyperliquid Ecosystem Integration

**Domain:** DeFi DEX (Perp/Spot) + Off-chain Order Signing + Sub-accounts
**Researched:** 2026-03-08
**Confidence:** MEDIUM (Hyperliquid API docs verified via official gitbook, phantom agent signing details from SDK analysis)

## Key Architectural Challenge

Hyperliquid L1 DEX orders are **NOT on-chain transactions**. They are EIP-712 signed payloads submitted to Hyperliquid's centralized REST API (`api.hyperliquid.xyz/exchange`). This fundamentally differs from all existing WAIaaS pipeline flows:

| Existing Pattern | Hyperliquid L1 |
|---|---|
| Build TX -> Sign -> Submit to chain | Build action -> Sign EIP-712 -> POST to API |
| txHash from chain submission | oid/status from API response |
| Confirmation via on-chain polling | No on-chain confirmation needed |
| Gas estimation/payment | No gas fees (L1 API is gasless) |
| IChainAdapter.buildTransaction() | Custom EIP-712 typed data construction |

HyperEVM (Chain ID 999/998) is a separate concern -- it is a standard EVM chain where the existing `EvmAdapter` works as-is for on-chain HyperEVM operations (token transfers, contract calls). The L1 DEX integration is the novel architectural problem.

---

## Recommended Architecture

### Decision: Extend IActionProvider with API-Direct Resolution

**Do NOT** create a new pipeline type or discriminatedUnion type. Instead, introduce a new return type variant for `IActionProvider.resolve()` that carries an "API-direct result" payload rather than `ContractCallRequest`.

**Rationale:**
1. Adding a 9th discriminatedUnion type (e.g., `DEX_ORDER`) would touch every pipeline stage, policy form, admin UI, test -- massive blast radius for a single provider.
2. The existing `SIGN` type (sign-message pipeline) is for raw message signing -- it does not go through policy evaluation, which Hyperliquid orders need.
3. The cleanest approach: action providers that produce **API-direct results** sign-and-submit within their own `resolve()`, returning a result object instead of `ContractCallRequest`. The pipeline stages 1-3 (validate, auth, policy) still run, but stage 5 (execute) is handled by the provider itself.

### Proposed Pattern: `ApiDirectResult`

```typescript
/**
 * Result from an API-direct action (no on-chain TX).
 * The provider handles signing + API submission internally.
 * Pipeline stages 1-4 (validate/auth/policy/delay) still apply.
 */
export interface ApiDirectResult {
  /** Discriminator: marks this as API-direct, not ContractCallRequest. */
  __apiDirect: true;
  /** Provider-specific order/action ID. */
  externalId: string;
  /** Human-readable status. */
  status: string;
  /** Provider-specific response data (order fills, etc). */
  data: Record<string, unknown>;
}

/**
 * Update IActionProvider.resolve() return type to support API-direct results.
 * Alternatively, introduce IApiDirectProvider as a sub-interface.
 */
export interface IActionProvider {
  resolve(
    actionName: string,
    params: Record<string, unknown>,
    context: ActionContext & { privateKey?: Hex },  // key access for signing
  ): Promise<ContractCallRequest | ContractCallRequest[] | ApiDirectResult>;
}
```

### Pipeline Integration: Stage 5 Branching

```
Stage 1 (Validate) -> Stage 2 (Auth) -> Stage 3 (Policy) -> Stage 4 (Delay/Approval)
  |
  v
Stage 5: Is result ApiDirectResult?
  YES -> Record in DB as COMPLETED (no txHash, store externalId + response in metadata)
  NO  -> Existing on-chain execution flow (build -> simulate -> sign -> submit)
```

**Critical:** Policy evaluation (stage 3) still runs. The `ActionProviderRegistry` extracts amount/asset info from the action params for policy evaluation BEFORE calling `resolve()`. This means:
- `HyperliquidPerpProvider` actions declare `riskLevel` and `defaultTier`
- Policy engine evaluates spending limits based on declared amount (size * price for position value)
- Only after policy passes does `resolve()` run, which internally signs EIP-712 and POSTs to Hyperliquid API

### Key Access for Signing

The provider needs the wallet's private key to sign EIP-712 typed data. Currently, `ActionContext` does not include the key. Options:

**Option A (recommended):** Pass decrypted key via extended `ActionContext` only when provider declares `requiresSigningKey: true` in metadata. The `ActionProviderRegistry` decrypts the key after policy passes (stage 4), passes it to `resolve()`, and releases it after.

**Option B:** Provider receives a `SigningDelegate` callback `(typedData) => Promise<Hex>` that internally handles key decryption. More encapsulated but adds async complexity.

Choose Option A because the existing sign-message pipeline already does `keyStore.decrypt -> use -> keyStore.release` inline, and the pattern is well-understood.

---

## Component Boundaries

### New Components

| Component | Package | Responsibility | Communicates With |
|---|---|---|---|
| `HyperliquidExchangeClient` | `packages/actions` | REST API wrapper for Exchange + Info endpoints, rate limiting | Hyperliquid API |
| `HyperliquidSigner` | `packages/actions` | EIP-712 typed data construction + phantom agent signing | viem signTypedData |
| `HyperliquidPerpProvider` | `packages/actions` | IPerpProvider for perp trading (open/close/modify/leverage/margin) | ExchangeClient, Signer, MarketData |
| `HyperliquidSpotProvider` | `packages/actions` | IActionProvider for spot trading (buy/sell market/limit) | ExchangeClient, Signer |
| `HyperliquidSubAccountService` | `packages/actions` | Sub-account CRUD + internal transfers | ExchangeClient |
| `HyperliquidMarketData` | `packages/actions` | Market info, funding rates, oracle prices from Info API | ExchangeClient |

### Modified Components

| Component | Change | Reason |
|---|---|---|
| `packages/core/src/enums/chain.ts` | Add `hyperevm-mainnet`, `hyperevm-testnet` to `NETWORK_TYPES` + `EVM_NETWORK_TYPES` + `ENVIRONMENT_NETWORK_MAP` | HyperEVM chain support |
| `packages/adapters/evm/src/evm-chain-map.ts` | Add viem chain imports to `EVM_CHAIN_MAP` | HyperEVM chain resolution |
| `packages/core/src/interfaces/action-provider.types.ts` | Add `ApiDirectResult` type, update resolve() return type | API-direct provider pattern |
| `ActionProviderRegistry` (daemon) | Handle `ApiDirectResult` return -- skip on-chain execution, record directly | Stage 5 branching |
| `packages/daemon/src/pipeline/stages.ts` | Stage 5 branch: if `ApiDirectResult`, update DB and skip chain submission | API-direct execution |
| `packages/daemon/src/infrastructure/database/migrate.ts` | v51: `hyperliquid_orders`, v52: `hyperliquid_sub_accounts` | Order history + sub-account mapping |

### Unmodified Components (Reuse As-Is)

| Component | Why No Change |
|---|---|
| `EvmAdapter` | HyperEVM is standard EVM -- existing adapter works |
| `LocalKeyStore` | Same key decryption for EIP-712 signing |
| `PolicyEngine` | Actions declare risk/tier, amounts extracted from params |
| `NotificationService` | Reuse existing event types (TRANSACTION_COMPLETED) |
| `SettingsService` | Standard Admin Settings pattern for config |
| `MCP tools / SDK methods` | Auto-generated from ActionProviderRegistry |
| `discriminatedUnion 8-type` | No new type -- API-direct actions are handled via ActionProvider, not pipeline types |

---

## EIP-712 Signing Flow

Hyperliquid uses **two distinct EIP-712 domains** depending on action category.

### Domain 1: L1 Trading Actions (Orders, Cancel, Leverage)

Uses the **Phantom Agent** mechanism -- does NOT sign the order directly:

```typescript
// Step 1: Normalize action (remove trailing zeros from price/size fields)
const normalizedAction = removeTrailingZeros(action);

// Step 2: MessagePack encode the normalized action
const encoded = msgpack.encode(normalizedAction);

// Step 3: Append nonce + optional vaultAddress metadata
const metadata = Buffer.concat([encoded, nonceBytes, vaultAddressBytes]);

// Step 4: Keccak256 hash -> connectionId
const connectionId = keccak256(metadata);

// Step 5: Build phantom agent
const phantomAgent = {
  source: isMainnet ? 'a' : 'b',
  connectionId,
};

// EIP-712 domain for ALL trading actions
const EXCHANGE_DOMAIN = {
  name: 'Exchange',
  version: '1',
  chainId: 1337,
  verifyingContract: '0x0000000000000000000000000000000000000000',
};

// Types: sign the phantom agent struct, not the order
const types = {
  Agent: [
    { name: 'source', type: 'string' },
    { name: 'connectionId', type: 'bytes32' },
  ],
};

// Sign using viem
const signature = await account.signTypedData({
  domain: EXCHANGE_DOMAIN,
  types,
  primaryType: 'Agent',
  message: phantomAgent,
});

// Parse into {r, s, v} for Hyperliquid API
const { r, s, v } = parseSignature(signature);
```

### Domain 2: User Actions (Transfers, Withdrawals, ApproveAgent)

Standard EIP-712 without phantom agent:

```typescript
const USER_ACTION_DOMAIN = {
  name: 'HyperliquidSignTransaction',
  version: '1',
  chainId: isMainnet ? 42161 : 421614,  // Arbitrum chain IDs
  verifyingContract: '0x0000000000000000000000000000000000000000',
};

// Types vary per action, e.g., UsdSend:
const types = {
  'HyperliquidTransaction:UsdSend': [
    { name: 'hyperliquidChain', type: 'string' },
    { name: 'destination', type: 'string' },
    { name: 'amount', type: 'string' },
    { name: 'time', type: 'uint64' },
  ],
};
```

### Key Points for WAIaaS Integration

1. **New dependency: `@msgpack/msgpack`** -- required for action serialization before hashing
2. **Keccak256** -- already available via viem
3. **Trailing zero removal** from price/size strings is CRITICAL for hash correctness
4. **`viem privateKeyToAccount().signTypedData()`** -- already used in `sign-message.ts`
5. The wallet's existing EVM private key signs both HyperEVM on-chain TXs and Hyperliquid L1 orders -- **no separate key management needed**
6. **Nonce = timestamp in milliseconds** (Date.now()) -- simple, no complex nonce tracking needed
7. **Signature format: `{r, s, v}`** -- Hyperliquid expects the decomposed ECDSA signature

---

## Sub-Account Model

### Hyperliquid Sub-Account Facts (from official docs)

- Sub-accounts **do not have private keys** -- the master account signs on behalf
- Operations include `vaultAddress` field set to sub-account address
- Nonces are tracked per signer (not per sub-account) -- parallel ops on multiple sub-accounts with same signer can collide
- Official recommendation: **separate API wallets (agents) for different sub-accounts** for parallel operations
- Info API: `type: "subAccounts"` returns all sub-accounts with balances/positions

### WAIaaS Mapping: 1 Wallet = Master Account, Sub-accounts as Metadata

**Do NOT** create separate WAIaaS wallets for sub-accounts. Instead:

```
WAIaaS Wallet (EVM, hyperevm-mainnet)
  |-- Master Hyperliquid account (wallet.publicKey)
  |-- Sub-account A (stored in hyperliquid_sub_accounts table)
  |-- Sub-account B (stored in hyperliquid_sub_accounts table)
```

**Rationale:**
1. Sub-accounts share the master key -- creating separate WAIaaS wallets would duplicate key storage and break the 1-key-1-wallet invariant
2. Sub-accounts are Hyperliquid-specific -- they don't map to blockchain addresses in the general sense
3. Action params include an optional `subAccount` field to target a specific sub-account
4. Policy evaluation applies to the master wallet -- spending limits aggregate across sub-accounts

---

## Data Flow

### Order Placement Flow

```
Agent/MCP -> POST /v1/actions/execute
  { provider: "hyperliquid_perp", action: "hl_open_position",
    params: { market: "ETH", direction: "LONG", size: "1.0",
              leverage: 10, orderType: "market" } }

1. ActionProviderRegistry.resolveAction()
   -> Validate params via Zod schema
   -> Extract amount info for policy: size * currentPrice (from HyperliquidMarketData)

2. Pipeline Stage 1-3: Validate, Auth, Policy
   -> Policy evaluates spending limit (notional value = size * price, in USD)
   -> Tier determined (defaultTier from action definition, override from Admin Settings)

3. Pipeline Stage 4: Wait/Approval (if tier requires)

4. Pipeline Stage 5: Execute
   -> Detect provider has requiresSigningKey: true
   -> keyStore.decrypt(walletId, masterPassword) -> privateKey
   -> HyperliquidPerpProvider.resolve(actionName, params, { ...context, privateKey })
     a. Build Hyperliquid order action { type: "order", orders: [...], grouping: "na" }
     b. HyperliquidSigner.signAction(action, nonce, privateKey, isMainnet)
        -> Normalize (trailing zero removal)
        -> MessagePack encode + append nonce
        -> Keccak256 -> connectionId
        -> EIP-712 signTypedData (phantom agent)
     c. HyperliquidExchangeClient.exchange({ action, nonce, signature, vaultAddress? })
     d. Parse response -> ApiDirectResult { externalId: oid, status: 'filled'|'resting', data }
   -> keyStore.release(walletId)

5. Pipeline records result:
   -> INSERT into hyperliquid_orders (oid, market, side, size, price, status, ...)
   -> UPDATE transactions SET status='COMPLETED', metadata={ externalId, hlResponse }

6. Stage 6: Notification
   -> TRANSACTION_COMPLETED event with Hyperliquid-specific metadata
```

### Info Query Flow (No Pipeline -- Read-Only)

```
Agent/MCP -> MCP tool: hl_get_positions / hl_get_open_orders
  -> HyperliquidExchangeClient.info({ type: 'clearinghouseState', user: walletAddress })
  -> Return formatted positions/orders (read-only, no pipeline, no DB write)
```

### Sub-Account Internal Transfer Flow

```
Agent/MCP -> POST /v1/actions/execute
  { provider: "hyperliquid_perp", action: "hl_internal_transfer",
    params: { subAccount: "0x...", amount: "1000", toPerp: true } }

  -> Policy evaluation (TRANSFER-like, amount is the transfer value)
  -> HyperliquidSigner.signUserAction("usdClassTransfer", action, privateKey)
     (uses HyperliquidSignTransaction domain, NOT phantom agent)
  -> HyperliquidExchangeClient.exchange({ action, signature })
  -> ApiDirectResult
```

---

## DB Schema Changes

### v51: Hyperliquid Order History

```sql
CREATE TABLE hyperliquid_orders (
  id TEXT PRIMARY KEY,                    -- UUID v7
  wallet_id TEXT NOT NULL REFERENCES wallets(id),
  sub_account_address TEXT,               -- NULL = master account
  oid INTEGER,                            -- Hyperliquid order ID (from response)
  cloid TEXT,                             -- Client order ID (128-bit hex, optional)
  transaction_id TEXT REFERENCES transactions(id),  -- Link to pipeline TX record
  market TEXT NOT NULL,                   -- e.g., 'ETH', 'BTC', 'PURR'
  asset_index INTEGER NOT NULL,           -- Hyperliquid asset index (perp: direct, spot: 10000+)
  side TEXT NOT NULL CHECK(side IN ('BUY', 'SELL')),
  order_type TEXT NOT NULL CHECK(order_type IN ('MARKET', 'LIMIT', 'STOP_MARKET', 'STOP_LIMIT', 'TAKE_PROFIT', 'TWAP')),
  size TEXT NOT NULL,                     -- Decimal string (no trailing zeros)
  price TEXT,                             -- Decimal string (NULL for market orders)
  trigger_price TEXT,                     -- For stop/TP orders
  tif TEXT CHECK(tif IN ('GTC', 'IOC', 'ALO')),
  reduce_only INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('PENDING', 'RESTING', 'FILLED', 'PARTIALLY_FILLED', 'CANCELLED', 'REJECTED', 'TRIGGERED')),
  filled_size TEXT,
  avg_fill_price TEXT,
  is_spot INTEGER NOT NULL DEFAULT 0,     -- 0=perp, 1=spot
  leverage INTEGER,                       -- Perp only
  margin_mode TEXT CHECK(margin_mode IN ('CROSS', 'ISOLATED')),
  response_data TEXT,                     -- JSON: full API response
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_hl_orders_wallet ON hyperliquid_orders(wallet_id);
CREATE INDEX idx_hl_orders_oid ON hyperliquid_orders(oid);
CREATE INDEX idx_hl_orders_market ON hyperliquid_orders(market);
CREATE INDEX idx_hl_orders_status ON hyperliquid_orders(status);
```

### v52: Hyperliquid Sub-accounts

```sql
CREATE TABLE hyperliquid_sub_accounts (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL REFERENCES wallets(id),
  sub_account_address TEXT NOT NULL,      -- 42-char hex
  name TEXT,                              -- User-assigned name
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(wallet_id, sub_account_address)
);
```

---

## Patterns to Follow

### Pattern 1: Drift-like Provider Structure

Follow the exact same file structure as `packages/actions/src/providers/drift/`:

```
packages/actions/src/providers/hyperliquid/
  config.ts              -- API endpoints, rate limits, defaults
  schemas.ts             -- Zod input schemas for all actions
  exchange-client.ts     -- HyperliquidExchangeClient (REST API wrapper)
  signer.ts              -- HyperliquidSigner (EIP-712 + phantom agent)
  market-data.ts         -- HyperliquidMarketData (Info API queries)
  perp-provider.ts       -- HyperliquidPerpProvider (IPerpProvider)
  spot-provider.ts       -- HyperliquidSpotProvider (IActionProvider)
  sub-account-service.ts -- Sub-account management
  index.ts               -- Re-exports
```

### Pattern 2: Action Definition with Risk Levels

```typescript
this.actions = [
  {
    name: 'hl_open_position',
    description: 'Open a leveraged perpetual position on Hyperliquid DEX with market or limit order',
    chain: 'ethereum',  // HyperEVM is EVM chain type
    inputSchema: HlOpenPositionInputSchema,
    riskLevel: 'high',
    defaultTier: 'APPROVAL',
  },
  {
    name: 'hl_close_position',
    description: 'Close a perpetual position on Hyperliquid DEX (full or partial)',
    chain: 'ethereum',
    inputSchema: HlClosePositionInputSchema,
    riskLevel: 'medium',
    defaultTier: 'DELAY',
  },
  {
    name: 'hl_place_order',
    description: 'Place a limit order on Hyperliquid DEX with optional stop-loss/take-profit',
    chain: 'ethereum',
    inputSchema: HlPlaceOrderInputSchema,
    riskLevel: 'high',
    defaultTier: 'APPROVAL',
  },
  {
    name: 'hl_cancel_order',
    description: 'Cancel an open order on Hyperliquid DEX',
    chain: 'ethereum',
    inputSchema: HlCancelOrderInputSchema,
    riskLevel: 'low',
    defaultTier: 'INSTANT',
  },
  {
    name: 'hl_set_leverage',
    description: 'Update leverage for a perpetual market on Hyperliquid',
    chain: 'ethereum',
    inputSchema: HlSetLeverageInputSchema,
    riskLevel: 'medium',
    defaultTier: 'DELAY',
  },
];
```

### Pattern 3: Admin Settings Keys

```
HYPERLIQUID_API_URL           -- default: https://api.hyperliquid.xyz
HYPERLIQUID_TESTNET_API_URL   -- default: https://api.hyperliquid-testnet.xyz
HYPERLIQUID_ENABLED           -- feature gate (default: true)
HYPERLIQUID_RATE_LIMIT_RPM    -- requests per minute (default: 600, conservative vs 1200 API limit)
HYPERLIQUID_DEFAULT_LEVERAGE  -- default leverage for new positions (default: 1)
HYPERLIQUID_BUILDER_ADDRESS   -- optional builder fee address
HYPERLIQUID_BUILDER_FEE       -- optional builder fee rate (tenths of basis points)
```

### Pattern 4: Rate Limiting (from existing RPC Pool pattern)

```typescript
class HyperliquidRateLimiter {
  private requestCount = 0;
  private windowStart = Date.now();
  private readonly maxRpm: number;

  constructor(maxRpm = 600) {
    this.maxRpm = maxRpm;
  }

  async throttle(): Promise<void> {
    const now = Date.now();
    if (now - this.windowStart > 60_000) {
      this.requestCount = 0;
      this.windowStart = now;
    }
    if (this.requestCount >= this.maxRpm) {
      const waitMs = 60_000 - (now - this.windowStart);
      await new Promise(resolve => setTimeout(resolve, waitMs));
      this.requestCount = 0;
      this.windowStart = Date.now();
    }
    this.requestCount++;
  }
}
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: New discriminatedUnion Type

**What:** Adding `DEX_ORDER` or `HYPERLIQUID_ORDER` as 9th type in TransactionRequestSchema.
**Why bad:** Every pipeline stage, policy type, admin UI form, MCP tool template, SDK type, test fixture -- hundreds of files would need updates. The discriminatedUnion is for on-chain TX types only.
**Instead:** Use `ApiDirectResult` pattern where the action provider encapsulates the entire API interaction.

### Anti-Pattern 2: Separate WAIaaS Wallets for Sub-accounts

**What:** Creating a new WAIaaS wallet for each Hyperliquid sub-account.
**Why bad:** Sub-accounts share the master key, creating wallets would duplicate encrypted keys and break the 1-key-1-wallet invariant. Policy enforcement would also be fragmented.
**Instead:** Sub-accounts are metadata within the Hyperliquid provider scope, stored in a dedicated table linked to the master wallet.

### Anti-Pattern 3: Real-time WebSocket in Initial Phases

**What:** Implementing WebSocket subscriptions for live order/position updates from day one.
**Why bad:** Adds significant complexity (connection management, reconnection, event routing) before the basic trading flow works.
**Instead:** Use REST polling via Info API initially. WebSocket can be added as a follow-up enhancement.

### Anti-Pattern 4: Manual EIP-712 Signing Outside Provider

**What:** Using the existing `executeSignMessage()` pipeline to sign Hyperliquid orders separately, then submitting via a different API call.
**Why bad:** Two separate pipeline invocations for one logical operation. Policy evaluation would run on the signing step but not know the trading context (market, leverage, size).
**Instead:** Sign and submit atomically within provider `resolve()` after policy has already evaluated the action params.

### Anti-Pattern 5: Building Own msgpack/EIP-712 from Scratch

**What:** Implementing MessagePack encoding or EIP-712 domain manually.
**Why bad:** The Hyperliquid signing docs explicitly warn: "It is recommended to use an existing SDK instead of manually generating signatures, as there are many potential ways in which signatures can be wrong." Field ordering in msgpack matters for hash correctness.
**Instead:** Use `@msgpack/msgpack` library and viem's `signTypedData` -- both battle-tested.

---

## Scalability Considerations

| Concern | Small (< 10 orders/min) | Medium (10-100/min) | Large (100+/min) |
|---|---|---|---|
| Rate Limiting | In-memory counter sufficient | Token bucket with Admin Setting | Multiple API wallets per master |
| Nonce Management | Date.now() (ms timestamp) | Monotonic counter | Per-API-wallet nonce tracking |
| Order History | SQLite table with indexes | Periodic cleanup/archival | External DB for order history |
| Sub-account Ops | Sequential per wallet | Separate API wallets per sub-account | Connection pooling |
| Info API Queries | On-demand REST calls | Cache with 5-10s TTL | WebSocket for streaming |

---

## Suggested Build Order (with Dependencies)

### Phase 1: HyperEVM Chain Addition (standalone, no deps)
- Add `hyperevm-mainnet`, `hyperevm-testnet` to chain enums
- Add viem chain imports to EVM_CHAIN_MAP
- Tests: existing EVM wallet creation/transfer works on HyperEVM
- **Pure config change -- no new components**

### Phase 2: Research + Design Document (depends on Phase 1 for chain verification)
- Verify viem chain exports (exact import names)
- Write design document with EIP-712 signing details, API types, DB schema
- Define `ApiDirectResult` interface and pipeline branching design
- Prototype phantom agent signing in isolation test

### Phase 3: Core Infrastructure + Perp (depends on Phase 2)
- `HyperliquidExchangeClient` (REST wrapper, rate limiter)
- `HyperliquidSigner` (EIP-712 + phantom agent + user action signing)
- `HyperliquidMarketData` (Info API: positions, orders, markets, funding)
- `ApiDirectResult` interface in `@waiaas/core`
- `ActionProviderRegistry` update for `ApiDirectResult` handling
- Stage 5 branching in `stages.ts`
- DB v51: `hyperliquid_orders` table
- `HyperliquidPerpProvider` (open/close/modify/set_leverage/update_margin + cancel)
- MCP tools + SDK methods (auto-generated from provider)
- Admin Settings (7 keys)
- **Largest phase -- builds all shared infrastructure**

### Phase 4: Spot Trading (depends on Phase 3)
- `HyperliquidSpotProvider` (buy/sell market/limit, cancel)
- Spot asset index handling (10000 + index)
- Reuses ExchangeClient, Signer, orders table (is_spot=1)
- MCP tools + SDK methods

### Phase 5: Sub-accounts (depends on Phase 3, parallel with Phase 4)
- DB v52: `hyperliquid_sub_accounts` table
- `HyperliquidSubAccountService` (create, list, internal transfer via sendAsset)
- `vaultAddress` propagation through signer
- Per-sub-account position/balance queries
- MCP tools + SDK methods

### Phase 6: Admin UI + Full Integration (depends on Phases 3-5)
- Admin UI: Hyperliquid positions/orders dashboard
- Admin UI: Sub-account management view
- Skill files update (transactions.skill.md, admin.skill.md)
- connect-info `hyperliquid` capability

**Dependency graph:**
```
Phase 1 (chain)
  |
Phase 2 (design)
  |
Phase 3 (core + perp) --------+
  |                            |
  +-- Phase 4 (spot)           +-- Phase 5 (sub-accounts)
  |                            |
  +----------------------------+
  |
Phase 6 (admin UI + integration)
```

---

## Sources

- [Hyperliquid Exchange Endpoint Docs](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint) -- HIGH confidence (official docs, all action types verified)
- [Hyperliquid Info Endpoint Docs](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint) -- HIGH confidence (official docs)
- [Hyperliquid Signing Docs](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/signing) -- HIGH confidence (official docs, warns against manual signing)
- [Hyperliquid Nonces and API Wallets](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/nonces-and-api-wallets) -- HIGH confidence (official docs)
- [Hyperliquid Rate Limits](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits) -- HIGH confidence (official docs, 1200 RPM IP limit, per-address volume-based)
- [Hyperliquid Order Types](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/order-types) -- HIGH confidence (official docs)
- [DeepWiki: Hyperliquid SDK Signing](https://deepwiki.com/nomeida/hyperliquid/6.1-authentication-and-signing) -- MEDIUM confidence (SDK reverse-engineering, not official spec; domain params verified against Turnkey blog)
- [Turnkey x Hyperliquid EIP-712](https://www.turnkey.com/blog/hyperliquid-secure-eip-712-signing) -- MEDIUM confidence (third-party integration, confirms domain params)
- [Chainstack Hyperliquid SubAccounts](https://docs.chainstack.com/reference/hyperliquid-info-subaccounts) -- MEDIUM confidence (third-party reference docs)
- Codebase: `packages/actions/src/providers/drift/index.ts` -- HIGH confidence (existing IPerpProvider pattern)
- Codebase: `packages/core/src/interfaces/action-provider.types.ts` -- HIGH confidence (IActionProvider resolve() contract)
- Codebase: `packages/daemon/src/pipeline/stages.ts` -- HIGH confidence (6-stage pipeline, PipelineContext)
- Codebase: `packages/daemon/src/pipeline/sign-message.ts` -- HIGH confidence (existing EIP-712 signTypedData usage)
- Codebase: `packages/core/src/enums/chain.ts` -- HIGH confidence (current network types, DB v50)
