# Architecture Patterns: DeFi Protocol Integration into WAIaaS

**Domain:** DeFi Action Provider integration (Swap, Bridge, Staking, Gas Conditional Execution)
**Researched:** 2026-02-23
**Confidence:** HIGH (based on codebase analysis of existing patterns + protocol API documentation)

---

## Recommended Architecture

### High-Level Data Flow

```
AI Agent / MCP / SDK
        |
        v
POST /v1/actions/:provider/:action { params, walletId?, network? }
        |
        v
ActionProviderRegistry.executeResolve(actionKey, params, context)
  1. Input validation (action.inputSchema.parse)
  2. IActionProvider.resolve(actionName, params, context)
     - External API call (Jupiter/0x/LI.FI REST) or ABI encoding (Lido/Jito)
     - Returns ContractCallRequest
  3. Return value re-validation (ContractCallRequestSchema.parse)
        |
        v
6-Stage Pipeline (+ GAS_WAITING extension)
  Stage 1: Validate + DB INSERT (PENDING)
  Stage 2: Auth (sessionId)
  Stage 3: Policy (CONTRACT_WHITELIST + SPENDING_LIMIT + USD oracle)
  [NEW Stage 3.5: Gas Condition Evaluation] --- if gasCondition present
     -> GAS_WAITING state, halt pipeline
     -> GasConditionWorker polls RPC, resumes on condition met
  Stage 4: Wait (DELAY/APPROVAL tier)
  Stage 5: Execute (build -> simulate -> sign -> submit)
  Stage 6: Confirm (waitForConfirmation)
        |
        v
[Optional: Async Status Tracking]
  - Bridge: LI.FI /status polling (30s x 60 = 30min max)
  - Unstake: Lido/Jito status polling (5min x 288 = 24hr max)
  -> AsyncStatusTracker via BackgroundWorkers
```

### Component Topology

```
packages/actions/                    # NEW PACKAGE: @waiaas/actions
  src/
    index.ts                         # Built-in provider exports + registration helper
    common/
      action-api-client.ts           # Shared fetch wrapper (timeout, Zod validation)
      slippage.ts                    # Shared slippage clamping logic
    providers/
      jupiter-swap/                  # Solana DEX aggregator
        index.ts                     # JupiterSwapActionProvider : IActionProvider
        jupiter-api-client.ts        # Jupiter REST API wrapper
        schemas.ts                   # Input + response Zod schemas
        config.ts                    # JupiterSwapConfig type + defaults
      0x-swap/                       # EVM DEX aggregator
        index.ts                     # ZeroExSwapActionProvider : IActionProvider
        0x-api-client.ts             # 0x REST API wrapper
        schemas.ts                   # Input + response Zod schemas
        config.ts                    # ZeroExSwapConfig type + defaults
        permit2.ts                   # Permit2 approval helper
      lifi/                          # Cross-chain bridge + swap
        index.ts                     # LiFiActionProvider : IActionProvider
        lifi-api-client.ts           # LI.FI REST API wrapper
        schemas.ts                   # Input + response Zod schemas
        config.ts                    # LiFiConfig type + defaults
        status-tracker.ts            # Bridge status polling logic
      lido/                          # ETH liquid staking
        index.ts                     # LidoStakingActionProvider : IActionProvider
        lido-contract.ts             # ABI encodings (submit, requestWithdrawals)
        schemas.ts                   # Input Zod schemas
        config.ts                    # LidoConfig type + defaults
      jito/                          # SOL liquid staking
        index.ts                     # JitoStakingActionProvider : IActionProvider
        jito-stake-pool.ts           # SPL Stake Pool instruction builder
        schemas.ts                   # Input Zod schemas
        config.ts                    # JitoConfig type + defaults

packages/daemon/src/                 # MODIFIED: new services + pipeline extension
  pipeline/
    gas-condition-evaluator.ts       # NEW: evaluate gasCondition against RPC gas price
    stages.ts                        # MODIFIED: Stage 3.5 GAS_WAITING branch
  services/
    action/
      built-in-providers.ts          # MODIFIED: register new providers from @waiaas/actions
    async-status/                    # NEW: shared async tracking service
      async-status-tracker.ts        # IAsyncStatusTracker interface + implementation
      bridge-status-worker.ts        # LI.FI /status polling handler
      unstake-status-worker.ts       # Lido/Jito withdrawal polling handler
  lifecycle/
    workers.ts                       # EXISTING: register new background workers
    daemon.ts                        # MODIFIED: wire new services at startup

packages/core/src/                   # MODIFIED: schema + enum extensions
  enums/
    transaction.ts                   # MODIFIED: add GAS_WAITING to TRANSACTION_STATUSES
    notification.ts                  # MODIFIED: add TX_GAS_WAITING, TX_GAS_CONDITION_MET,
                                     #   BRIDGE_COMPLETED, BRIDGE_FAILED, UNSTAKE_COMPLETED
  schemas/
    transaction.schema.ts            # MODIFIED: add GasConditionSchema
  events/
    event-types.ts                   # MODIFIED: add bridge:status-changed, gas:condition-met
```

---

## Component Boundaries

| Component | Responsibility | Communicates With | Package |
|-----------|---------------|-------------------|---------|
| `IActionProvider` implementations (5) | Resolve user intent to `ContractCallRequest` via external API or ABI encoding | External REST APIs (Jupiter, 0x, LI.FI) or on-chain ABI data | `@waiaas/actions` |
| `ActionProviderRegistry` | Register/lookup/execute providers with schema validation | Providers, action routes, MCP tool converter | `daemon` (existing) |
| `ActionApiClient` (base) | Shared HTTP fetch with timeout + Zod response validation | External APIs | `@waiaas/actions` |
| `GasConditionEvaluator` | Compare current gas price against user threshold | `IChainAdapter` or raw RPC for gas price | `daemon` (new) |
| `GasConditionWorker` | Poll GAS_WAITING transactions, resume pipeline on condition met | DB (transactions), `GasConditionEvaluator`, pipeline stages 4-6 | `daemon` (new) |
| `AsyncStatusTracker` | Poll external APIs for bridge/unstake completion status | LI.FI `/status`, Lido Withdrawal Queue, Jito epoch status | `daemon` (new) |
| `BackgroundWorkers` | Schedule periodic tasks (gas polling, bridge status, unstake status) | Worker handlers | `daemon` (existing) |
| 6-Stage Pipeline | Execute validated `ContractCallRequest` through policy -> sign -> submit | `IChainAdapter`, `IPolicyEngine`, `LocalKeyStore` | `daemon` (existing) |

---

## Integration Points: New vs Modified Components

### NEW Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `@waiaas/actions` package | `packages/actions/` | All 5 ActionProvider implementations + common utilities |
| `ActionApiClient` base class | `packages/actions/src/common/` | Shared fetch wrapper: AbortController timeout, response Zod validation, error mapping |
| `SlippageHelper` | `packages/actions/src/common/` | Shared slippage clamping: `clamp(userValue, defaultValue, maxValue)` |
| `GasConditionEvaluator` | `packages/daemon/src/pipeline/` | Evaluate `gasCondition` against current RPC gas price |
| `GasConditionWorker` | `packages/daemon/src/services/` | Background worker polling GAS_WAITING transactions |
| `AsyncStatusTracker` | `packages/daemon/src/services/async-status/` | Common interface for bridge/unstake status polling |
| `BridgeStatusWorker` | `packages/daemon/src/services/async-status/` | LI.FI `/status` polling background handler |
| `UnstakeStatusWorker` | `packages/daemon/src/services/async-status/` | Lido Withdrawal Queue + Jito epoch polling |
| `GasConditionSchema` | `packages/core/src/schemas/` | Zod schema for `gasCondition` optional field |
| DB migration (next version) | `packages/daemon/src/infrastructure/database/` | `bridge_status` column + `GAS_WAITING` status extension |

### MODIFIED Components

| Component | Location | Change |
|-----------|----------|--------|
| `TRANSACTION_STATUSES` enum | `packages/core/src/enums/transaction.ts` | Add `'GAS_WAITING'` (10 -> 11 values) |
| `WaiaasEventMap` | `packages/core/src/events/event-types.ts` | Add `bridge:status-changed`, `gas:condition-met` event types |
| Notification events | `packages/core/src/enums/notification.ts` | Add `TX_GAS_WAITING`, `TX_GAS_CONDITION_MET`, `BRIDGE_COMPLETED`, `BRIDGE_FAILED`, `UNSTAKE_COMPLETED` |
| `TransactionRequestSchema` | `packages/core/src/schemas/transaction.schema.ts` | Add optional `gasCondition` field to all 5 types |
| `transactions` table schema | `packages/daemon/src/infrastructure/database/schema.ts` | Add `bridge_status` text column (nullable), update CHECK for GAS_WAITING |
| Pipeline `stages.ts` | `packages/daemon/src/pipeline/stages.ts` | Insert gas condition check between Stage 3 (policy) and Stage 4 (wait) |
| `built-in-providers.ts` | `packages/daemon/src/services/action/` | Load 5 new providers from `@waiaas/actions` based on config enabled flags |
| `daemon.ts` lifecycle | `packages/daemon/src/lifecycle/daemon.ts` | Wire `GasConditionWorker`, `BridgeStatusWorker`, `UnstakeStatusWorker` to `BackgroundWorkers` |
| Action route | `packages/daemon/src/api/routes/actions.ts` | Pass `gasCondition` from request body to pipeline context |
| MCP tools | `packages/mcp/src/tools/action-provider.ts` | No changes needed -- existing dynamic registration auto-discovers new providers |
| Admin Settings | `packages/admin/src/pages/settings.tsx` | Add Actions section (API keys), Gas Condition section |
| Skills files | `packages/skills/src/` | Update `transactions.skill.md` with DeFi action examples + gas conditions |

---

## Detailed Data Flow: Each Protocol

### 1. Jupiter Swap (Solana DEX)

```
User: { inputMint: "So11...", outputMint: "EPjFW...", amount: "1000000000", slippageBps: 50 }
  |
  v
JupiterSwapActionProvider.resolve('swap', params, ctx)
  1. Validate via JupiterSwapInputSchema.parse(params)
  2. GET https://api.jup.ag/swap/v1/quote
       ?inputMint=...&outputMint=...&amount=...&slippageBps=50
     -> QuoteResponse (routePlan, priceImpactPct, outAmount, otherAmountThreshold)
  3. Verify priceImpactPct <= maxPriceImpactPct (default 1%)
  4. POST https://api.jup.ag/swap/v1/swap-instructions
       body: { quoteResponse, userPublicKey }
     -> SwapInstructionsResponse {
          setupInstructions,
          computeBudgetInstructions,
          swapInstruction,
          cleanupInstruction,
          addressLookupTableAddresses
        }
  5. Convert to ContractCallRequest:
     {
       type: 'CONTRACT_CALL',
       to: swapInstruction.programId,
       programId: swapInstruction.programId,
       instructionData: swapInstruction.data,   // base64
       accounts: swapInstruction.accounts,       // { pubkey, isSigner, isWritable }[]
     }
  6. Return -> pipeline Stage 1-6
```

**Multi-instruction handling**: Jupiter's `/swap-instructions` returns multiple instructions (setup + compute budget + swap + cleanup + optional Jito tip). Two approaches:

- **Simple path**: Use only the `swapInstruction` in ContractCallRequest. Setup/compute budget are handled by the adapter's transaction builder.
- **Full path (recommended)**: Use BATCH type to include all instructions. The existing `buildBatch()` method in SolanaAdapter handles multi-instruction transactions. This ensures correct compute budget and ATA setup.

**Jito MEV protection**: When configured, add a Jito tip instruction to the batch. The tip instruction transfers a small amount (default 1000 lamports) to a Jito tip account, ensuring the transaction is routed through Jito's block engine rather than the public mempool.

### 2. 0x Swap (EVM DEX)

```
User: { sellToken: "0xA0b8...", buyToken: "0xdAC1...", sellAmount: "1000000000000000000" }
  |
  v
ZeroExSwapActionProvider.resolve('swap', params, ctx)
  1. Validate via ZeroExSwapInputSchema.parse(params)
  2. Check: is sellToken native ETH?
     - If ERC-20: need Permit2 approval (see below)
  3. GET https://api.0x.org/swap/permit2/price
       ?sellToken=...&buyToken=...&sellAmount=...
       Headers: { 0x-api-key: config.api_key, 0x-chain-id: chainId }
     -> PriceResponse (price, estimatedGas, sources)
  4. GET https://api.0x.org/swap/permit2/quote
       ?sellToken=...&buyToken=...&sellAmount=...&taker=walletAddress
       Headers: same
     -> QuoteResponse {
          to,              // 0x Exchange Proxy address
          data,            // hex calldata
          value,           // ETH value to send
          permit2: { eip712: {...} }  // Permit2 signature data
        }
  5. Sign Permit2 EIP-712 message (wallet signs via keyStore)
  6. Append signature to calldata:
     calldata = quote.data + signatureLength + signature
  7. Convert to ContractCallRequest:
     {
       type: 'CONTRACT_CALL',
       to: quoteResponse.to,
       calldata: appendedCalldata,
       value: quoteResponse.value,
     }
  8. Return -> pipeline Stage 1-6
```

**Permit2 two-step flow**: For ERC-20 token sells, the user must first approve the Permit2 contract (not the 0x contract). This is a one-time approval per token.

**Design decision for Permit2 orchestration**:
- Provider detects if Permit2 allowance is insufficient
- Returns a special `ACTION_REQUIRES_APPROVAL` error with the approve details
- The action route handler (`POST /v1/actions/:provider/:action`) recognizes this error
- Orchestrates: (1) execute approve pipeline, (2) wait for confirmation, (3) re-call resolve() for the swap
- This keeps `resolve()` pure -- it only returns ContractCallRequest, never signs or submits

**Chain routing**: 0x uses the same API structure for all 19+ EVM chains. The `0x-chain-id` header selects the target chain. The provider maps WAIaaS `NetworkType` to the appropriate chain ID.

### 3. LI.FI Bridge (Cross-chain)

```
User: {
  fromChain: "solana", toChain: "base",
  fromToken: "SOL", toToken: "USDC",
  fromAmount: "5000000000"
}
  |
  v
LiFiActionProvider.resolve('cross_swap', params, ctx)
  1. Validate via LiFiCrossSwapInputSchema.parse(params)
  2. POST https://li.quest/v1/quote
     Body: {
       fromChain, toChain, fromToken, toToken,
       fromAmount, fromAddress: ctx.walletAddress,
       slippage: 0.03
     }
     -> QuoteResponse {
          transactionRequest: { to, data, value, gasLimit },
          estimate: { toAmount, toAmountMin, executionDuration, gasCosts },
          includedSteps: [{ tool, type, estimate }],
          action: { fromChainId, toChainId }
        }
  3. Verify estimate.toAmountMin > 0 (valid route exists)
  4. Convert to ContractCallRequest:
     // For Solana origin:
     {
       type: 'CONTRACT_CALL',
       to: transactionRequest.to,
       programId: transactionRequest.programId,
       instructionData: transactionRequest.data,
       accounts: transactionRequest.accounts,
     }
     // For EVM origin:
     {
       type: 'CONTRACT_CALL',
       to: transactionRequest.to,
       calldata: transactionRequest.data,
       value: transactionRequest.value,
     }
  5. Store bridge metadata for async tracking:
     { tool, fromChainId, toChainId, estimatedDuration }
  6. Return -> pipeline Stage 1-6
        |
        v (after Stage 6 on-chain confirmation)
  7. BridgeStatusWorker picks up the transaction:
     GET https://li.quest/v1/status
       ?bridge={tool}&fromChain={fromChainId}&toChain={toChainId}&txHash={onChainTxHash}
     -> StatusResponse {
          status: 'PENDING' | 'DONE' | 'FAILED' | 'NOT_FOUND',
          receiving: { txHash, amount, token },
          sending: { txHash, amount, token }
        }
  8. Poll every 30 seconds (configurable), max 60 attempts (30 min)
  9. Terminal states:
     - DONE -> UPDATE bridge_status = 'COMPLETED', emit BRIDGE_COMPLETED notification
     - FAILED -> UPDATE bridge_status = 'FAILED', emit BRIDGE_FAILED notification
     - Timeout -> UPDATE bridge_status = 'TIMEOUT', emit warning notification
```

**Cross-chain policy evaluation**: Uses the **source chain wallet's policies** because funds leave from the source. The destination chain receives assets (incoming), so no outgoing policy applies. The `walletId` in ActionContext is the source wallet.

**Bridge metadata storage**: The `bridge_metadata` JSON column stores the LI.FI-specific tracking data (`tool`, `fromChainId`, `toChainId`). This avoids coupling the schema to LI.FI's data model.

### 4. Lido + Jito Staking

```
=== Lido Stake (ETH -> stETH) ===
User: { amount: "5000000000000000000" }  // 5 ETH in wei
  |
  v
LidoStakingActionProvider.resolve('stake', params, ctx)
  1. Validate via LidoStakeInputSchema.parse(params)
  2. ABI-encode with viem:
     encodeFunctionData({
       abi: [{ name: 'submit', type: 'function', inputs: [{ name: '_referral', type: 'address' }], outputs: [{ type: 'uint256' }] }],
       functionName: 'submit',
       args: ['0x0000000000000000000000000000000000000000']  // no referral
     })
  3. Return ContractCallRequest:
     {
       type: 'CONTRACT_CALL',
       to: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',  // Lido stETH
       calldata: encodedData,
       value: '5000000000000000000',
     }

=== Lido Unstake (stETH -> ETH via Withdrawal Queue) ===
User: { amount: "5000000000000000000" }  // 5 stETH
  |
  v
LidoStakingActionProvider.resolve('unstake', params, ctx)
  1. ABI-encode:
     encodeFunctionData({
       abi: WithdrawalQueueABI,
       functionName: 'requestWithdrawals',
       args: [[amount], ctx.walletAddress]  // amounts array, owner
     })
  2. Return ContractCallRequest:
     {
       type: 'CONTRACT_CALL',
       to: '0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B1',  // Withdrawal Queue
       calldata: encodedData,
     }
  3. After pipeline completion -> UnstakeStatusWorker tracks withdrawal:
     Check Withdrawal Queue for claimable status (1-5 days)

=== Jito Stake (SOL -> JitoSOL) ===
User: { amount: "10000000000" }  // 10 SOL in lamports
  |
  v
JitoStakingActionProvider.resolve('stake', params, ctx)
  1. Build SPL Stake Pool deposit instruction:
     - Program: SPoo1Ku8WFXoNDMHPsrGSTSG1Y47rzgn41SLUNakuHy
     - Pool: Jito4APyf642JPZPx3hGc6WWJ8zPKtRbRs4P815Awbb
     - JitoSOL Mint: J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn
  2. Return ContractCallRequest:
     {
       type: 'CONTRACT_CALL',
       to: 'Jito4APyf642JPZPx3hGc6WWJ8zPKtRbRs4P815Awbb',
       programId: 'SPoo1Ku8WFXoNDMHPsrGSTSG1Y47rzgn41SLUNakuHy',
       instructionData: base64EncodedData,
       accounts: [...poolAccounts],
     }

=== Jito Unstake (JitoSOL -> SOL) ===
  Similar pattern with SPL Stake Pool withdraw instruction.
  Unstake requires epoch boundary wait (~2 days).
```

**Key architectural advantage**: Staking providers use direct ABI/program encoding -- no external API calls. This makes them faster, more reliable, and immune to third-party API rate limits or outages. Lido uses viem's `encodeFunctionData`. Jito uses SPL Stake Pool instruction building.

**Contract addresses by environment**: The provider resolves mainnet vs testnet addresses based on the wallet's `EnvironmentType`. Config.toml provides mainnet defaults; testnet addresses are hardcoded constants that switch automatically.

### 5. Gas Conditional Execution (Pipeline Extension)

```
User: POST /v1/transactions/send
{
  "type": "CONTRACT_CALL",
  "to": "0x...",
  "calldata": "0x...",
  "gasCondition": {
    "maxGasPrice": "30000000000",   // 30 gwei
    "timeout": 3600                  // 1 hour
  }
}
  |
  v
Stage 1: Validate + INSERT PENDING (gasCondition stored in tx metadata)
Stage 2: Auth
Stage 3: Policy evaluation (full evaluation -- policy violations rejected immediately)
  |
  v
[Stage 3.5: Gas Condition Evaluation]
  GasConditionEvaluator.evaluate(gasCondition, adapter)
    - EVM: eth_gasPrice -> compare against maxGasPrice
           eth_maxPriorityFeePerGas -> compare against maxPriorityFee
    - Solana: getRecentPrioritizationFees -> compare against maxPriorityFee
    - If condition MET -> continue to Stage 4
    - If condition NOT MET:
      1. UPDATE transactions SET status = 'GAS_WAITING'
      2. Emit TX_GAS_WAITING notification
      3. throw PIPELINE_HALTED (same pattern as DELAY/APPROVAL)
  |
  v [if halted]
GasConditionWorker (registered in BackgroundWorkers)
  Interval: settings.gas_condition.poll_interval_sec * 1000 (default 30s)
  Handler:
    1. SELECT * FROM transactions WHERE status = 'GAS_WAITING'
    2. Group by chain:network (batch RPC optimization)
    3. For each network: query gas price once
    4. For each waiting tx on that network:
       - If condition MET: resume pipeline from Stage 4 (stage4Wait -> stage5Execute -> stage6Confirm)
       - If timeout exceeded: UPDATE status = 'CANCELLED', emit TX_CANCELLED
       - If RPC failure: skip this polling cycle, retry next interval
    5. Batch evaluation: O(networks) RPC calls, not O(transactions)
```

**Pipeline integration point**: GAS_WAITING inserts between Stage 3 (policy) and Stage 4 (wait/delay/approval). This ordering ensures:
1. Policy violations are caught immediately -- no wasted gas waiting for a transaction that will be denied
2. Gas condition is evaluated before any signing or nonce assignment
3. The existing `PIPELINE_HALTED` pattern (used by DELAY and APPROVAL tiers in Stage 4) is reused

**Nonce safety**: GAS_WAITING transactions do NOT receive a nonce until they resume execution. The nonce is assigned at Stage 5 (`buildTransaction()`). This prevents nonce conflicts when other transactions from the same wallet execute while one is gas-waiting.

**Daemon restart resilience**: GAS_WAITING state is persisted in the DB (`transactions.status = 'GAS_WAITING'`). On restart, the `GasConditionWorker` queries the DB and resumes polling for all waiting transactions. This matches the existing pattern where `DelayQueue` and `ApprovalWorkflow` recover from DB state.

---

## Patterns to Follow

### Pattern 1: ActionProvider resolve() Purity

**What:** Every `IActionProvider.resolve()` must return a `ContractCallRequest` and nothing else. No signing, no submitting, no side effects.

**When:** Always -- this is the core contract of the ActionProvider framework.

**Why:** The existing `ActionProviderRegistry.executeResolve()` re-validates the return value via `ContractCallRequestSchema.parse()`. This prevents policy bypass and ensures all transactions flow through the 6-stage pipeline.

```typescript
// CORRECT
async resolve(actionName: string, params: Record<string, unknown>, context: ActionContext): Promise<ContractCallRequest> {
  const quote = await this.apiClient.getQuote(params);
  return {
    type: 'CONTRACT_CALL',
    to: quote.contractAddress,
    calldata: quote.calldata,
    value: quote.value,
  };
}

// WRONG -- never sign or submit directly
async resolve(actionName: string, params: Record<string, unknown>, context: ActionContext): Promise<ContractCallRequest> {
  const txHash = await this.apiClient.executeSwap(params); // BAD: submits directly
  // ...
}
```

### Pattern 2: ActionApiClient with Zod Response Validation

**What:** All external API calls use a shared base client with timeout and Zod response validation, detecting API changes at runtime.

**When:** Every provider that calls an external REST API (Jupiter, 0x, LI.FI).

```typescript
export class ActionApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number = 10_000,
    private readonly headers: Record<string, string> = {},
  ) {}

  async get<T>(path: string, schema: z.ZodType<T>, params?: Record<string, string>): Promise<T> {
    const url = new URL(path, this.baseUrl);
    if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url.toString(), {
        signal: controller.signal,
        headers: this.headers,
      });
      if (!res.ok) {
        throw new WAIaaSError('ACTION_API_ERROR', {
          message: `API error ${res.status}: ${await res.text()}`,
        });
      }
      const data = await res.json();
      return schema.parse(data); // Runtime API contract validation
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async post<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
    // Similar with method: 'POST', body: JSON.stringify(body)
  }
}
```

### Pattern 3: Config-Driven Provider Registration

**What:** Providers are registered only when `[actions.{name}].enabled = true` in config.toml. Config follows the existing flat-section pattern.

**When:** Daemon startup (Step 4 in DaemonLifecycle).

```typescript
// built-in-providers.ts
export function registerBuiltInProviders(
  registry: ActionProviderRegistry,
  config: DaemonConfig,
  apiKeyStore: ApiKeyStore,
): { loaded: string[]; skipped: string[] } {
  const loaded: string[] = [];
  const skipped: string[] = [];

  const providers: Array<{ key: string; factory: () => IActionProvider }> = [
    { key: 'jupiter_swap', factory: () => new JupiterSwapActionProvider(config.actions?.jupiter_swap) },
    { key: '0x_swap', factory: () => new ZeroExSwapActionProvider(config.actions?.['0x_swap'], apiKeyStore) },
    { key: 'lifi', factory: () => new LiFiActionProvider(config.actions?.lifi, apiKeyStore) },
    { key: 'lido', factory: () => new LidoStakingActionProvider(config.actions?.lido) },
    { key: 'jito', factory: () => new JitoStakingActionProvider(config.actions?.jito) },
  ];

  for (const { key, factory } of providers) {
    if (config.actions?.[key]?.enabled) {
      try {
        registry.register(factory());
        loaded.push(key);
      } catch (err) {
        console.warn(`Built-in provider '${key}' registration failed:`, err);
        skipped.push(key);
      }
    } else {
      skipped.push(key);
    }
  }
  return { loaded, skipped };
}
```

### Pattern 4: AsyncStatusTracker Interface

**What:** Common interface for any operation that requires asynchronous completion tracking.

**When:** LI.FI bridge, Lido unstake, Jito unstake -- any operation completing asynchronously.

```typescript
export interface IAsyncStatusTracker {
  /** Check the current status of an async operation */
  checkStatus(txId: string, metadata: Record<string, unknown>): Promise<AsyncTrackingStatus>;
  /** Maximum polling attempts before timeout */
  readonly maxAttempts: number;
  /** Polling interval in milliseconds */
  readonly pollIntervalMs: number;
}

export interface AsyncTrackingStatus {
  state: 'PENDING' | 'COMPLETED' | 'FAILED';
  details?: Record<string, unknown>;
}

// Concrete: BridgeStatusTracker
export class BridgeStatusTracker implements IAsyncStatusTracker {
  readonly maxAttempts = 60;     // 30 min at 30s intervals
  readonly pollIntervalMs = 30_000;

  async checkStatus(txId: string, metadata: Record<string, unknown>): Promise<AsyncTrackingStatus> {
    const response = await this.lifiClient.getStatus({
      bridge: metadata.tool as string,
      fromChain: metadata.fromChainId as number,
      toChain: metadata.toChainId as number,
      txHash: metadata.txHash as string,
    });
    if (response.status === 'DONE') return { state: 'COMPLETED', details: response.receiving };
    if (response.status === 'FAILED') return { state: 'FAILED', details: { error: response.message } };
    return { state: 'PENDING' };
  }
}
```

The `BackgroundWorkers` existing infrastructure handles scheduling:

```typescript
workers.register('bridge-status', {
  interval: config.actions?.lifi?.status_poll_interval_sec * 1000 || 30_000,
  handler: () => bridgeStatusService.pollAll(),
});

workers.register('unstake-status', {
  interval: 5 * 60 * 1000,  // 5 minutes
  handler: () => unstakeStatusService.pollAll(),
});
```

### Pattern 5: Pipeline HALT + Worker Resume (Existing Pattern Extended)

**What:** When a pipeline stage needs to pause execution, it throws `PIPELINE_HALTED`. A background worker later resumes the pipeline.

**When:** GAS_WAITING (new), DELAY (existing), APPROVAL (existing).

The action route handler already catches `PIPELINE_HALTED`:

```typescript
// From packages/daemon/src/api/routes/actions.ts (existing code)
void (async () => {
  try {
    await stage2Auth(ctx);
    await stage3Policy(ctx);
    // [NEW: gas condition check would go here, before stage4Wait]
    await stage4Wait(ctx);
    await stage5Execute(ctx);
    await stage6Confirm(ctx);
  } catch (error) {
    // PIPELINE_HALTED is intentional -- transaction is QUEUED
    if (error instanceof WAIaaSError && error.code === 'PIPELINE_HALTED') {
      return;
    }
    // ... error handling
  }
})();
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Provider-Internal Pipeline Execution

**What:** An ActionProvider calling pipeline stages or adapter methods directly.

**Why bad:** Bypasses policy evaluation, audit logging, and notification triggers. The entire point of the ActionProvider framework is that `resolve()` produces a `ContractCallRequest` that flows through the standard pipeline.

**Instead:** Always return `ContractCallRequest` from `resolve()`. Let the existing action route handler manage pipeline execution.

### Anti-Pattern 2: External SDK Dependencies

**What:** Importing Jupiter SDK, 0x SDK, or LI.FI SDK as direct dependencies.

**Why bad:** Increases bundle size, version coupling, and attack surface. Each SDK brings transitive dependencies (often hundreds of packages). The REST APIs provide the same functionality with a single `fetch()` call.

**Instead:** Use native `fetch()` with `AbortController` timeout and Zod response validation. This is explicitly decided in m28-01 (tech decision #1). Jito staking is the one exception where `@solana/spl-stake-pool` may be needed for instruction building.

### Anti-Pattern 3: In-Memory-Only Async Tracking

**What:** Tracking bridge/unstake status only in memory (Map, Set, or singleton state).

**Why bad:** Daemon restart loses all tracking state. Self-hosted daemons restart during updates, system reboots, or crashes.

**Instead:** Store async tracking state in the SQLite `transactions` table (`bridge_status` column + `bridge_metadata` JSON). Workers recover from DB state on restart (validated in m28-05 test #8 for gas conditions).

### Anti-Pattern 4: Per-Transaction Gas Price Queries

**What:** Querying gas price individually for each GAS_WAITING transaction.

**Why bad:** 100 waiting transactions x 30-second interval = 200+ RPC calls per minute. Unnecessary since all EVM transactions on the same network share the same gas price.

**Instead:** Batch evaluation: query gas price once per network per polling cycle, then evaluate all waiting transactions for that network. This is O(networks) not O(transactions).

### Anti-Pattern 5: Mixing Slippage Units Across Providers

**What:** Using inconsistent slippage representations internally (some bps, some percentage, some decimal).

**Why bad:** Confusion leads to bugs. Jupiter uses bps (integer), 0x uses decimal percentage (0.01 = 1%), LI.FI uses decimal percentage (0.03 = 3%).

**Instead:** Each provider uses the external API's native unit for config keys (`_bps` suffix for Jupiter, `_pct` suffix for 0x/LI.FI) as specified in m28-00. The `SlippageHelper` handles clamping within each provider's unit system.

---

## DB Schema Changes

### Single Unified Migration (Applied in m28-03)

Per m28-00 design (DEFI-04), a single integrated migration adds both bridge status tracking and GAS_WAITING state.

```sql
-- Migration: Add bridge_status + bridge_metadata + GAS_WAITING state
-- Applied at: m28-03 (LI.FI bridge, first user of bridge_status)
-- Also used by: m28-04 (unstake tracking), m28-05 (GAS_WAITING)

-- 1. Add bridge_status column (nullable, only populated for bridge/unstake transactions)
ALTER TABLE transactions ADD COLUMN bridge_status TEXT;

-- 2. Add bridge tracking metadata column (JSON, nullable)
ALTER TABLE transactions ADD COLUMN bridge_metadata TEXT;

-- 3. GAS_WAITING is added to TRANSACTION_STATUSES in @waiaas/core
--    The SQLite CHECK constraint must be updated via schema push.
--    New TRANSACTION_STATUSES array: [...existing 10 values, 'GAS_WAITING']

-- 4. Indexes for polling queries
CREATE INDEX idx_transactions_bridge_status
  ON transactions(bridge_status)
  WHERE bridge_status IS NOT NULL;

CREATE INDEX idx_transactions_gas_waiting
  ON transactions(status)
  WHERE status = 'GAS_WAITING';
```

The `bridge_status` column values:
- `NULL` -- not a bridge/unstake transaction
- `'PENDING'` -- submitted on source chain, awaiting cross-chain completion
- `'COMPLETED'` -- successfully arrived on destination chain
- `'FAILED'` -- bridge failed (source chain tx succeeded but bridge failed)
- `'TIMEOUT'` -- max polling attempts exceeded

---

## Config.toml Pattern

Following the established flat-section convention (no nesting), each provider gets its own `[actions.{name}]` section:

```toml
# DeFi Action Provider configuration

[actions.jupiter_swap]
enabled = true
api_base_url = "https://api.jup.ag/swap/v1"
# api_key = ""                                 # Jupiter API key (optional)
default_slippage_bps = 50                      # 0.5%
max_slippage_bps = 500                         # 5%
max_price_impact_pct = 1.0                     # 1% price impact limit
jito_tip_lamports = 1000                       # Jito MEV protection tip
# jito_block_engine_url = ""                   # Jito block engine URL (optional)

[actions.0x_swap]
enabled = true
api_key = ""                                   # 0x API key (REQUIRED)
api_base_url = "https://api.0x.org"
default_slippage_pct = 0.01                    # 1%
max_slippage_pct = 0.05                        # 5%

[actions.lifi]
enabled = true
api_key = ""                                   # LI.FI API key (optional, rate limit)
api_base_url = "https://li.quest/v1"
default_slippage_pct = 0.03                    # 3% (cross-chain needs higher)
max_slippage_pct = 0.05                        # 5%
status_poll_interval_sec = 30                  # Bridge status polling interval
status_poll_max_attempts = 60                  # Max attempts (30 min)

[actions.lido]
enabled = true
steth_address = "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84"
withdrawal_queue_address = "0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B1"

[actions.jito]
enabled = true
stake_pool = "Jito4APyf642JPZPx3hGc6WWJ8zPKtRbRs4P815Awbb"
jitosol_mint = "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn"
```

Admin Settings exposes runtime-adjustable items: API keys, slippage defaults, poll intervals, gas condition parameters.

---

## Scalability Considerations

| Concern | At 10 wallets | At 100 wallets | At 1000 wallets |
|---------|--------------|----------------|-----------------|
| Gas condition polling | 1 RPC call/chain/interval (negligible) | Same -- batch evaluation | Same -- O(networks) not O(wallets) |
| Bridge status polling | Max ~10 concurrent bridge txs | Max ~100 bridge txs, 30s interval OK | Consider LI.FI batch status API |
| External API rate limits | Well within free tier | 0x may need paid plan | Dedicated API keys, request queuing |
| DB indexes for async queries | Fast (small table) | Fast (filtered indexes) | Consider archiving completed bridge records |
| Background workers | 3 new workers, minimal overhead | Same | Same -- interval-based, no per-wallet cost |

---

## Build Order (Dependency-Driven)

```
Phase 1: m28-00 (Design) -- Common patterns, no code
  - @waiaas/actions package structure
  - ActionApiClient base pattern
  - Policy integration rules
  - AsyncStatusTracker interface
  - Test strategy
  No code dependencies. All subsequent phases consume these design artifacts.

Phase 2: m28-01 (Jupiter Swap) -- FIRST PROVIDER
  Creates: @waiaas/actions package scaffolding (package.json, tsconfig, turbo)
  Creates: ActionApiClient base class, SlippageHelper
  Creates: JupiterSwapActionProvider + JupiterApiClient
  Modifies: built-in-providers.ts (registration loader)
  Solana-only, no async tracking, no DB migration.
  Establishes the pattern all subsequent providers follow.

Phase 3: m28-02 (0x Swap) -- SECOND PROVIDER, EVM VARIANT
  Creates: ZeroExSwapActionProvider + ZeroExApiClient + Permit2 helper
  Reuses: packages/actions/ structure, ActionApiClient, SlippageHelper
  Adds: Permit2 two-step orchestration in action route
  Tests: Cross-provider coexistence (Jupiter + 0x registered simultaneously)
  No DB migration. Depends on m28-01 for package structure.

Phase 4: m28-03 (LI.FI Bridge) -- FIRST ASYNC TRACKER + DB MIGRATION
  Creates: LiFiActionProvider + LiFiApiClient + BridgeStatusTracker
  Creates: AsyncStatusTracker interface + BridgeStatusWorker
  Runs: UNIFIED DB MIGRATION (bridge_status + bridge_metadata + GAS_WAITING state)
  Modifies: BackgroundWorkers (register bridge-status worker)
  Most complex provider. Depends on m28-01/02 for package structure.

Phase 5: m28-04 (Lido + Jito Staking) -- REUSES ASYNC TRACKER
  Creates: LidoStakingActionProvider + JitoStakingActionProvider
  Creates: UnstakeStatusWorker (reuses AsyncStatusTracker interface from m28-03)
  Creates: GET /v1/wallets/:id/staking API endpoint
  No external API dependency (direct ABI/program encoding).
  Can partially overlap with m28-03 if designed carefully.

Phase 6: m28-05 (Gas Conditional Execution) -- PIPELINE CORE EXTENSION
  Creates: GasConditionEvaluator + GasConditionWorker
  Modifies: Pipeline stages.ts (Stage 3.5 insertion)
  Modifies: TransactionRequestSchema (gasCondition optional field)
  Modifies: TRANSACTION_STATUSES enum (GAS_WAITING already in DB from m28-03)
  Last because: touches pipeline core, benefits from stable DeFi providers.
```

**Build order rationale:**
1. m28-00 first -- produces design artifacts consumed by all implementation phases
2. m28-01 first implementation -- simplest provider, creates package scaffolding
3. m28-02 after m28-01 -- reuses package structure, adds EVM-specific Permit2 pattern
4. m28-03 after m28-02 -- introduces async tracking (most complex new pattern), runs DB migration
5. m28-04 can partially overlap m28-03 -- no DB migration, uses async tracker interface
6. m28-05 last -- touches pipeline core (highest risk), benefits from all DeFi providers being stable

---

## Sources

- [Jupiter API Reference](https://dev.jup.ag/api-reference) -- HIGH confidence (official docs)
- [Jupiter Build Swap Transaction](https://dev.jup.ag/docs/swap-api/build-swap-transaction) -- HIGH confidence
- [0x Swap API Introduction](https://0x.org/docs/0x-swap-api/introduction) -- HIGH confidence (official docs)
- [0x Permit2 Guide](https://0x.org/docs/0x-swap-api/guides/swap-tokens-with-0x-swap-api-permit2) -- HIGH confidence
- [0x Upgrading to Swap API v2](https://0x.org/docs/upgrading/upgrading_to_swap_v2) -- HIGH confidence
- [0x Setting Token Allowances](https://0x.org/docs/0x-swap-api/advanced-topics/how-to-set-your-token-allowances) -- HIGH confidence
- [LI.FI Documentation](https://docs.li.fi/) -- HIGH confidence (official docs)
- [LI.FI Cross-Chain Status API](https://docs.li.fi/api-reference/check-the-status-of-a-cross-chain-transfer) -- HIGH confidence
- [LI.FI Solana Integration](https://docs.li.fi/li.fi-api/solana) -- HIGH confidence
- [Lido Contract Documentation](https://docs.lido.fi/contracts/lido/) -- HIGH confidence (official docs)
- [Lido stETH Etherscan](https://etherscan.io/address/0xae7ab96520de3a18e5e111b5eaab095312d7fe84) -- HIGH confidence
- [Lido Withdrawal Queue Etherscan](https://etherscan.io/address/0x889edc2edab5f40e902b864ad4d7ade8e412f9b1) -- HIGH confidence
- [Jito Staking Integration Docs](https://www.jito.network/docs/jitosol/jitosol-liquid-staking/for-developers/staking-integration/) -- HIGH confidence
- [Jito SPL Stake Pool Internals](https://www.jito.network/docs/stakenet/jito-steward/advanced/spl-stake-pool-internals/) -- HIGH confidence
- WAIaaS codebase analysis (direct code review) -- HIGH confidence:
  - `IActionProvider` interface: `packages/core/src/interfaces/action-provider.types.ts`
  - `ActionProviderRegistry`: `packages/daemon/src/infrastructure/action/action-provider-registry.ts`
  - Pipeline stages: `packages/daemon/src/pipeline/stages.ts`
  - Pipeline orchestrator: `packages/daemon/src/pipeline/pipeline.ts`
  - Action routes: `packages/daemon/src/api/routes/actions.ts`
  - MCP tool auto-conversion: `packages/mcp/src/tools/action-provider.ts`
  - BackgroundWorkers: `packages/daemon/src/lifecycle/workers.ts`
  - EventBus: `packages/core/src/events/event-bus.ts`
  - Transaction statuses: `packages/core/src/enums/transaction.ts`
  - ContractCallRequest schema: `packages/core/src/schemas/transaction.schema.ts`
  - AdapterPool: `packages/daemon/src/infrastructure/adapter-pool.ts`
  - IChainAdapter: `packages/core/src/interfaces/IChainAdapter.ts`
  - DB schema: `packages/daemon/src/infrastructure/database/schema.ts`
