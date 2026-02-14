# Architecture Patterns: Sign-Only Pipeline, Unsigned TX Parsing, Calldata Encoding, Default Deny Toggles, MCP Skill Resources

**Domain:** Self-hosted AI agent wallet daemon -- feature extension to existing 6-stage pipeline
**Researched:** 2026-02-14
**Confidence:** HIGH (based on direct codebase analysis, not external sources)

---

## 1. Current Architecture Baseline

### 1.1 Pipeline (6 Stages)

```
Stage 1: Validate + DB INSERT (PENDING)
    |
Stage 2: Auth (sessionId passthrough)
    |
Stage 3: Policy evaluate (4-tier classification + TOCTOU reserve)
    |
Stage 4: Wait (INSTANT/NOTIFY passthrough, DELAY/APPROVAL halt)
    |
Stage 5: Execute (build -> simulate -> sign -> submit + CONC-01 retry)
    |
Stage 6: Confirm (waitForConfirmation + DB CONFIRMED)
```

**Key design decisions in current pipeline:**
- POST /v1/transactions/send returns 201 after Stage 1 only (async stages 2-6)
- PipelineContext accumulates state across stages (txId, tier, unsignedTx, signedTx, submitResult)
- PIPELINE_HALTED error is intentional (DELAY/APPROVAL flow)
- Fire-and-forget notifications at each stage transition
- `buildByType()` dispatches to correct IChainAdapter method based on discriminatedUnion type

### 1.2 IChainAdapter Interface (20 methods)

Connection (4) + Balance (1) + Pipeline (4: build/simulate/sign/submit) + Confirm (1) + Assets (1) + Fee (1) + Token (2) + Contract (2) + Batch (1) + Utility (3)

**Critical for sign-only:** The 4-stage pipeline (build -> simulate -> sign -> submit) is already decomposed. `signTransaction()` returns `Uint8Array`. We can invoke build -> sign and stop before submit.

### 1.3 Policy Engine (11 PolicyTypes)

SPENDING_LIMIT, WHITELIST, ALLOWED_TOKENS, CONTRACT_WHITELIST, METHOD_WHITELIST, APPROVED_SPENDERS, APPROVE_AMOUNT_LIMIT, APPROVE_TIER_OVERRIDE, ALLOWED_NETWORKS, TIME_RESTRICTION, RATE_LIMIT

**Current behavior:** Missing default-deny policies (ALLOWED_TOKENS, CONTRACT_WHITELIST, APPROVED_SPENDERS) causes **automatic denial** for TOKEN_TRANSFER, CONTRACT_CALL, and APPROVE transaction types. This is undiscoverable -- AI agents get denied without understanding why.

### 1.4 MCP Layer (11 tools + 3 resources)

Resources are read-only contextual data URIs. Currently:
- `waiaas://wallet/balance` -- Current balance
- `waiaas://wallet/address` -- Public address + chain info
- `waiaas://system/status` -- Daemon status

---

## 2. Recommended Architecture: Sign-Only Pipeline

### 2.1 Core Insight: Fork, Don't Duplicate

The sign-only pipeline needs to reuse **Stage 1 (validate)** and **Stage 3 (policy)** but skip **Stage 4 (wait), Stage 5 (submit), Stage 6 (confirm)**. The key question: do we create a parallel pipeline class or add a mode flag?

**Recommendation: New `executeSignOnly()` method on TransactionPipeline + new `stage5SignOnly` function.**

Rationale:
- A separate `SignOnlyPipeline` class would duplicate wallet lookup, network resolution, adapter resolution, context building
- A `mode` flag in PipelineContext is cleaner -- Stage 5 checks `ctx.signOnly` and branches
- But the **response shape is fundamentally different** (returns signed bytes, not txId+status), so a separate entry point is clearer

### 2.2 Sign-Only Pipeline Flow

```
POST /v1/transactions/sign
    |
    v
[Route Handler]
    |-- Resolve wallet, network, adapter (SAME as /send)
    |-- Build PipelineContext with signOnly: true
    |
    v
Stage 1: Validate + DB INSERT (PENDING, type preserves original 5-type)
    |
    v
Stage 2: Auth (passthrough, SAME)
    |
    v
Stage 3: Policy (SAME -- all 11 PolicyTypes apply)
    |       SIGN_ONLY transactions SHOULD go through policy
    |       because signing IS authorization
    |
    v
Stage 5-Sign: Build -> Simulate -> Sign (NO submit)
    |       Returns { signedTx: hex, unsignedTx: hex, estimatedFee, metadata }
    |       DB status: SIGNED (new terminal status)
    |
    v
[Response: 200 with signed transaction bytes]
```

### 2.3 New Transaction Status: SIGNED

Add `'SIGNED'` to `TRANSACTION_STATUSES` enum in `@waiaas/core`:

```typescript
// packages/core/src/enums/transaction.ts
export const TRANSACTION_STATUSES = [
  'PENDING',
  'QUEUED',
  'EXECUTING',
  'SUBMITTED',
  'CONFIRMED',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
  'PARTIAL_FAILURE',
  'SIGNED',  // NEW: sign-only pipeline terminal state
] as const;
```

**DB migration required:** ALTER TABLE transactions CHECK constraint must include 'SIGNED'. This is migration v9 (current is v8 from v1.4.6).

### 2.4 PipelineContext Extension

```typescript
// New fields on PipelineContext
export interface PipelineContext {
  // ... existing fields ...

  /** Sign-only mode: skip submit/confirm stages */
  signOnly?: boolean;

  /** Sign-only result: hex-encoded signed transaction */
  signedTxHex?: string;

  /** Sign-only result: hex-encoded unsigned transaction (for inspection) */
  unsignedTxHex?: string;
}
```

### 2.5 Sign-Only Stage 5 (New Function)

```typescript
/**
 * Stage 5 variant for sign-only: Build -> Simulate -> Sign (no submit).
 * Returns signed bytes in ctx without submitting to chain.
 */
export async function stage5SignOnly(ctx: PipelineContext): Promise<void> {
  // Stage 5a: Build unsigned tx (reuse buildByType)
  ctx.unsignedTx = await buildByType(ctx.adapter, ctx.request, ctx.wallet.publicKey);

  // Stage 5b: Simulate (SAME -- still validate tx will succeed)
  const simResult = await ctx.adapter.simulateTransaction(ctx.unsignedTx);
  if (!simResult.success) {
    // Update DB, throw SIMULATION_FAILED (same as regular pipeline)
  }

  // Stage 5c: Sign (SAME key management)
  let privateKey: Uint8Array | null = null;
  try {
    privateKey = await ctx.keyStore.decryptPrivateKey(ctx.walletId, ctx.masterPassword);
    ctx.signedTx = await ctx.adapter.signTransaction(ctx.unsignedTx, privateKey);
  } finally {
    if (privateKey) ctx.keyStore.releaseKey(privateKey);
  }

  // Convert to hex for API response
  ctx.signedTxHex = Buffer.from(ctx.signedTx).toString('hex');
  ctx.unsignedTxHex = Buffer.from(ctx.unsignedTx.serialized).toString('hex');

  // Stage 5d: SKIP submit
  // Stage 6: SKIP confirm

  // Update DB status to SIGNED
  await ctx.db.update(transactions)
    .set({ status: 'SIGNED', metadata: JSON.stringify({
      signedTxHex: ctx.signedTxHex,
      estimatedFee: ctx.unsignedTx.estimatedFee.toString(),
    })})
    .where(eq(transactions.id, ctx.txId));

  // Fire-and-forget notification
  void ctx.notificationService?.notify('TX_SIGNED', ctx.walletId, {
    amount: getRequestAmount(ctx.request),
  }, { txId: ctx.txId });
}
```

### 2.6 API Endpoint Design

```
POST /v1/transactions/sign
  Auth: sessionAuth (Bearer wai_sess_*)
  Body: SAME as POST /v1/transactions/send (discriminatedUnion 5-type)

  Response 200:
  {
    id: string,           // Transaction record ID (for audit)
    status: "SIGNED",
    signedTx: string,     // Hex-encoded signed transaction bytes
    unsignedTx: string,   // Hex-encoded unsigned transaction bytes
    chain: string,
    network: string,
    estimatedFee: string,  // In smallest unit
    metadata: {            // Chain-specific metadata
      nonce?: number,      // EVM nonce
      chainId?: number,    // EVM chain ID
      // ... other chain-specific fields
    }
  }
```

**Synchronous execution:** Unlike `/send` (which returns 201 after Stage 1 and runs stages 2-6 async), `/sign` MUST be synchronous because the caller needs the signed bytes in the response. This means stages 1-5 run sequentially before returning.

### 2.7 Policy Consideration for Sign-Only

Sign-only transactions MUST go through the full policy engine because:
1. **Signing IS authorization** -- a signed transaction can be submitted externally
2. **SPENDING_LIMIT still applies** -- the signed tx has a specific amount
3. **CONTRACT_WHITELIST still applies** -- we should not sign calls to non-whitelisted contracts
4. **APPROVED_SPENDERS still applies** -- we should not sign approvals to unknown spenders

**However:** Stage 4 (DELAY/APPROVAL) behavior needs a decision:

**Recommendation: Skip Stage 4 for sign-only.** If policy evaluates to DELAY or APPROVAL tier, **deny** the sign-only request with a clear error: "Sign-only requests require INSTANT or NOTIFY tier. Current tier: DELAY."

Rationale:
- Sign-only is a power-user feature. If policy says DELAY, the user can wait and retry via `/send`.
- APPROVAL tier for sign-only doesn't make sense (you'd need owner approval to get signed bytes, but the owner could just sign themselves).
- Implementation is simpler: no polling for signed bytes after delay/approval.

### 2.8 Component Boundary Changes

```
packages/core/
  enums/transaction.ts     -- ADD 'SIGNED' status

packages/daemon/
  pipeline/stages.ts       -- ADD stage5SignOnly()
  pipeline/pipeline.ts     -- ADD executeSignOnly() method
  api/routes/transactions.ts  -- ADD POST /transactions/sign route
  api/routes/openapi-schemas.ts -- ADD SignResponse schema

packages/mcp/
  tools/sign-transaction.ts -- NEW tool: sign_transaction

packages/sdk/
  -- ADD signTransaction() method
```

---

## 3. Recommended Architecture: Unsigned Transaction Parsing

### 3.1 Purpose

Allow AI agents to **inspect** a built but unsigned transaction before deciding to sign and submit. This is a read-only operation that decodes chain-specific serialized bytes into human-readable fields.

### 3.2 Architecture Decision: Adapter Method vs Utility

**Recommendation: Add `parseUnsignedTransaction()` to IChainAdapter (method #21).** The adapter already has the chain context, and this maintains the principle that all chain-specific logic lives in adapters. Going from 20 to 21 methods is acceptable.

### 3.3 New IChainAdapter Method

```typescript
// IChainAdapter interface extension
/** Parse an unsigned transaction into human-readable fields. */
parseUnsignedTransaction(tx: UnsignedTransaction): ParsedTransaction;

// New type in chain-adapter.types.ts
export interface ParsedTransaction {
  chain: ChainType;
  type: 'native_transfer' | 'token_transfer' | 'contract_call' | 'approve';
  from: string;
  to: string;
  value: string;           // Native value in smallest unit
  data?: string;           // Hex calldata (EVM) or instruction data (Solana)
  nonce?: number;          // EVM nonce
  gasLimit?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  chainId?: number;
  // Decoded ABI info (if available)
  functionName?: string;   // e.g., 'transfer', 'approve'
  functionArgs?: unknown[];
  // Token info (if recognized)
  tokenAddress?: string;
  tokenSymbol?: string;
  tokenAmount?: string;
}
```

### 3.4 EVM Implementation

viem already provides `parseTransaction()` which deserializes EIP-1559 transactions. Combined with `decodeFunctionData()`, we can decode calldata into function name + args when ABI is available (or at minimum extract the 4-byte selector).

```typescript
// EvmAdapter.parseUnsignedTransaction()
parseUnsignedTransaction(tx: UnsignedTransaction): ParsedTransaction {
  const hex = toHex(tx.serialized);
  const parsed = parseTransaction(hex as TransactionSerializedEIP1559);

  const result: ParsedTransaction = {
    chain: 'ethereum',
    type: 'native_transfer',  // default, override below
    from: tx.metadata.from as string,
    to: parsed.to ?? '',
    value: (parsed.value ?? 0n).toString(),
    data: parsed.data,
    nonce: parsed.nonce,
    gasLimit: tx.metadata.gasLimit?.toString(),
    maxFeePerGas: tx.metadata.maxFeePerGas?.toString(),
    maxPriorityFeePerGas: tx.metadata.maxPriorityFeePerGas?.toString(),
    chainId: parsed.chainId,
  };

  // Detect type from calldata
  if (parsed.data && parsed.data !== '0x') {
    const selector = parsed.data.slice(0, 10);
    if (selector === '0xa9059cbb') {       // transfer(address,uint256)
      result.type = 'token_transfer';
      result.functionName = 'transfer';
    } else if (selector === '0x095ea7b3') { // approve(address,uint256)
      result.type = 'approve';
      result.functionName = 'approve';
    } else {
      result.type = 'contract_call';
    }
    result.tokenAddress = tx.metadata.tokenAddress as string | undefined;
  }

  return result;
}
```

### 3.5 API Endpoint

```
POST /v1/transactions/parse
  Auth: sessionAuth
  Body: { signedTx?: string, unsignedTx?: string }  // hex-encoded

  Response 200: ParsedTransaction
```

A separate endpoint allows parsing externally-constructed transactions too, not just those built by the daemon.

### 3.6 Integration Points

| Component | Change | Type |
|-----------|--------|------|
| `IChainAdapter` | +1 method: `parseUnsignedTransaction()` | Interface change |
| `EvmAdapter` | Implement parsing with viem `parseTransaction()` | New implementation |
| `SolanaAdapter` | Implement parsing with `@solana/kit` deserializer | New implementation |
| `chain-adapter.types.ts` | New `ParsedTransaction` type | New type |
| Transaction routes | New POST `/transactions/parse` | New route |
| MCP tools | New `parse_transaction` tool (optional) | New tool |

---

## 4. Recommended Architecture: EVM Calldata Encoding

### 4.1 Problem

AI agents calling `call_contract` currently must provide **pre-encoded hex calldata**. This is unusable for most AI agents because:
1. Agents would need to know the exact ABI
2. Agents would need to correctly encode parameters into hex calldata
3. No existing MCP tool provides encoding functionality

### 4.2 Architecture: Encoding Service as Daemon Utility Endpoint

**Recommendation: New REST endpoint + MCP tool that encodes function calls from human-readable params.**

```
POST /v1/utils/encode-calldata
  Auth: sessionAuth
  Body: {
    abi: AbiItem[],       // Function ABI fragment (JSON)
    functionName: string,  // e.g., 'transfer'
    args: unknown[],       // Function arguments
  }

  Response 200:
  {
    calldata: string,     // Hex-encoded calldata (0x...)
    selector: string,     // 4-byte function selector (0x...)
  }
```

### 4.3 Implementation: Leverage viem

viem's `encodeFunctionData()` is already imported in EvmAdapter. We expose it as a stateless utility.

```typescript
import { encodeFunctionData, type Abi } from 'viem';

export function encodeCalldata(
  abi: Abi,
  functionName: string,
  args: unknown[],
): { calldata: string; selector: string } {
  const calldata = encodeFunctionData({ abi, functionName, args });
  const selector = calldata.slice(0, 10);
  return { calldata, selector };
}
```

### 4.4 Complementary: Decode Calldata

```
POST /v1/utils/decode-calldata
  Auth: sessionAuth
  Body: {
    abi: AbiItem[],
    calldata: string,  // Hex-encoded
  }

  Response 200:
  {
    functionName: string,
    args: unknown[],
    selector: string,
  }
```

### 4.5 MCP Tool

```typescript
// New MCP tool: encode_calldata
server.tool('encode_calldata', 'Encode EVM function call into calldata hex', {
  abi: z.array(z.record(z.unknown())).describe('ABI fragment'),
  functionName: z.string().describe('Function name'),
  args: z.array(z.unknown()).describe('Function arguments'),
}, async (params) => {
  const result = await apiClient.post('/v1/utils/encode-calldata', params);
  return toToolResult(result);
});
```

### 4.6 AI Agent Workflow

The AI agent workflow becomes:
1. `encode_calldata` tool: encode function call into hex calldata
2. `call_contract` tool: submit with the encoded calldata
3. Optional: `parse_transaction` to verify before submission

This keeps call_contract simple (just takes hex calldata) while providing a helper for agents that need encoding.

### 4.7 Component Boundary Changes

```
packages/daemon/
  api/routes/utils.ts          -- NEW: encode/decode calldata routes
  api/routes/index.ts          -- ADD utils export

packages/mcp/
  tools/encode-calldata.ts     -- NEW: encode_calldata tool
  tools/decode-calldata.ts     -- NEW: decode_calldata tool (optional)
```

---

## 5. Recommended Architecture: Default Deny Policy Toggles

### 5.1 Problem

Three policy types use **default deny** when no policy is configured:
- `ALLOWED_TOKENS` -- TOKEN_TRANSFER denied if no policy exists
- `CONTRACT_WHITELIST` -- CONTRACT_CALL denied if no policy exists
- `APPROVED_SPENDERS` -- APPROVE denied if no policy exists

This is the correct security posture, but it's **invisible and confusing** for AI agents. An agent tries to send a token and gets "Token transfer not allowed: no ALLOWED_TOKENS policy configured" with no way to know what to configure.

### 5.2 Architecture: Settings-Based Toggle

**Recommendation: Add 3 boolean settings to the Settings DB that toggle default-deny behavior.**

```
security.token_transfer_default_allow  = false (default deny -- current behavior)
security.contract_call_default_allow   = false (default deny -- current behavior)
security.approve_default_allow         = false (default deny -- current behavior)
```

### 5.3 Implementation: Policy Engine Integration

```typescript
// DatabasePolicyEngine modifications

// Inject settings service (or a simple getter callback)
constructor(
  private readonly db: BetterSQLite3Database<typeof schema>,
  sqlite?: SQLiteDatabase,
  private readonly getDefaultAllowSetting?: (key: string) => boolean,  // NEW
) { ... }

// In evaluateAllowedTokens():
private evaluateAllowedTokens(
  resolved: PolicyRow[],
  transaction: TransactionParam,
): PolicyEvaluation | null {
  if (transaction.type !== 'TOKEN_TRANSFER') return null;

  const allowedTokensPolicy = resolved.find(p => p.type === 'ALLOWED_TOKENS');

  if (!allowedTokensPolicy) {
    // Check toggle: if default_allow=true, skip deny
    if (this.getDefaultAllowSetting?.('security.token_transfer_default_allow')) {
      return null; // Allow through
    }
    return {
      allowed: false,
      tier: 'INSTANT',
      reason: 'Token transfer not allowed: no ALLOWED_TOKENS policy configured',
    };
  }
  // ... rest of evaluation unchanged
}

// Same pattern for evaluateContractWhitelist() and evaluateApprovedSpenders()
```

### 5.4 Setting Definitions Extension

```typescript
// packages/daemon/src/infrastructure/settings/setting-keys.ts
// Add to SETTING_DEFINITIONS array, security category

{ key: 'security.token_transfer_default_allow', category: 'security',
  configPath: 'security.token_transfer_default_allow', defaultValue: 'false', isCredential: false },
{ key: 'security.contract_call_default_allow', category: 'security',
  configPath: 'security.contract_call_default_allow', defaultValue: 'false', isCredential: false },
{ key: 'security.approve_default_allow', category: 'security',
  configPath: 'security.approve_default_allow', defaultValue: 'false', isCredential: false },
```

### 5.5 Admin UI Integration

The Admin Settings panel already supports editing settings by category. The new security settings will appear automatically in the "security" category group. **No Admin UI code changes needed.**

### 5.6 API Exposure

Existing endpoint `PUT /v1/admin/settings/:key` handles setting updates. **No new endpoints needed.**

### 5.7 Migration Consideration

**No DB migration needed.** Settings use INSERT OR REPLACE semantics. New settings are initialized from `defaultValue` on first daemon boot after update (handled by existing settings initialization flow).

### 5.8 Component Boundary Changes

```
packages/daemon/
  infrastructure/settings/setting-keys.ts  -- ADD 3 new SettingDefinition entries
  pipeline/database-policy-engine.ts       -- MODIFY constructor + 3 evaluate*() methods
```

---

## 6. Recommended Architecture: MCP Skill Resources

### 6.1 Purpose

MCP Resources provide **contextual data** that AI agents can read without invoking tools. Currently 3 resources exist. Skill resources would expose the daemon's capabilities, policy configuration, and supported operations as structured data.

### 6.2 Architecture: Static + Dynamic Resources

| Resource URI | Type | Description | Data Source |
|-------------|------|-------------|-------------|
| `waiaas://skills/transactions` | Static | Transaction types, required fields, examples | Hardcoded from skill files |
| `waiaas://skills/policies` | Dynamic | Active policies for current wallet | `/v1/policies` |
| `waiaas://skills/supported-chains` | Static | Supported chains and networks | Core enums |
| `waiaas://skills/supported-tokens` | Dynamic | Token registry for current network | `/v1/tokens` |
| `waiaas://wallet/policies` | Dynamic | Current wallet's active policy summary | `/v1/policies` |

### 6.3 Key Design Decision: Skills as Resources, Not Prompts

MCP has three context mechanisms:
1. **Resources** -- data the application can inject (read-only, application-controlled)
2. **Prompts** -- pre-built templates for common interactions
3. **Tools** -- actions the model can invoke

Skill data is best as **Resources** because:
- It's contextual data, not an action
- The AI agent reads it to understand capabilities before acting
- It doesn't change per-request (or changes infrequently)
- Resources are cheaper than tool calls

### 6.4 Implementation Pattern

```typescript
// packages/mcp/src/resources/skill-transactions.ts
const RESOURCE_URI = 'waiaas://skills/transactions';

export function registerSkillTransactions(server: McpServer, walletContext?: WalletContext): void {
  server.resource(
    'Transaction Skills',
    RESOURCE_URI,
    {
      description: withWalletPrefix(
        'Transaction types and their required fields. Read this to understand what transactions you can send.',
        walletContext?.walletName,
      ),
      mimeType: 'application/json',
    },
    async () => ({
      contents: [{
        uri: RESOURCE_URI,
        text: JSON.stringify(TRANSACTION_SKILLS),
        mimeType: 'application/json',
      }],
    }),
  );
}

// Static skill data (derived from skill files + Zod schemas)
const TRANSACTION_SKILLS = {
  types: [
    {
      type: 'TRANSFER',
      description: 'Native token transfer (SOL/ETH)',
      requiredFields: ['type', 'to', 'amount'],
      optionalFields: ['memo', 'network'],
      example: { type: 'TRANSFER', to: '0x...', amount: '1000000000000000000' },
    },
    {
      type: 'TOKEN_TRANSFER',
      description: 'SPL/ERC-20 token transfer',
      requiredFields: ['type', 'to', 'amount', 'token'],
      optionalFields: ['memo', 'network'],
      notes: 'Requires ALLOWED_TOKENS policy or security.token_transfer_default_allow=true',
    },
    // ... CONTRACT_CALL, APPROVE, BATCH
  ],
  signOnly: {
    endpoint: '/v1/transactions/sign',
    description: 'Sign a transaction without submitting. Returns signed bytes.',
    notes: 'Only available for INSTANT/NOTIFY tier. DELAY/APPROVAL denied.',
  },
};
```

### 6.5 Dynamic Policy Resource

```typescript
// packages/mcp/src/resources/wallet-policies.ts
const RESOURCE_URI = 'waiaas://wallet/policies';

export function registerWalletPolicies(
  server: McpServer, apiClient: ApiClient, walletContext?: WalletContext,
): void {
  server.resource(
    'Wallet Policies',
    RESOURCE_URI,
    {
      description: withWalletPrefix(
        'Active policies for this wallet. Shows spending limits, whitelists, and default deny status.',
        walletContext?.walletName,
      ),
      mimeType: 'application/json',
    },
    async () => {
      const result = await apiClient.get('/v1/policies');
      return toResourceResult(RESOURCE_URI, result);
    },
  );
}
```

### 6.6 Component Boundary Changes

```
packages/mcp/
  resources/skill-transactions.ts  -- NEW: static transaction type info
  resources/skill-policies.ts      -- NEW: dynamic policy summary
  resources/skill-chains.ts        -- NEW: static chain/network support
  resources/skill-tokens.ts        -- NEW: dynamic token registry
  resources/wallet-policies.ts     -- NEW: wallet's active policies
  server.ts                        -- MODIFY: register new resources
```

**Total MCP changes:** 3 existing resources -> 8 resources (5 new).

---

## 7. Data Flow: Sign-Only vs Send Pipeline

### 7.1 Send Pipeline (existing)

```
Client -> POST /v1/transactions/send
  |
  [Stage 1: sync] -> 201 { id, status: PENDING }
  |
  [Stages 2-6: async, fire-and-forget]
     Stage 2: Auth
     Stage 3: Policy -> tier classification
     Stage 4: Wait -> DELAY/APPROVAL halts pipeline
     Stage 5: build -> simulate -> sign -> submit
     Stage 6: waitForConfirmation
  |
  Client polls GET /v1/transactions/:id for status
```

### 7.2 Sign-Only Pipeline (new)

```
Client -> POST /v1/transactions/sign
  |
  [ALL stages sync: must return signed bytes]
  |
  Stage 1: Validate + DB INSERT
  Stage 2: Auth
  Stage 3: Policy -> tier classification
    |-- INSTANT/NOTIFY: proceed
    |-- DELAY/APPROVAL: DENY (sign-only incompatible)
  Stage 5-Sign: build -> simulate -> sign (NO submit)
  |
  <- 200 { id, status: SIGNED, signedTx, unsignedTx, estimatedFee, metadata }
  |
  Client can submit externally or discard
```

### 7.3 Key Difference: Synchronous Response

The `/send` endpoint returns 201 immediately after Stage 1 and runs stages 2-6 async. The `/sign` endpoint MUST be synchronous because the response includes signed bytes. This has implications:

1. **Latency:** `/sign` blocks on RPC calls (build, simulate, sign). Expected 2-5 seconds.
2. **Timeout:** Must handle adapter timeouts gracefully (not hang the HTTP request).
3. **Error handling:** All errors surface as HTTP errors (not background DB updates).

---

## 8. Integration Matrix

### 8.1 New vs Modified Components

| Component | Status | What Changes |
|-----------|--------|-------------|
| `@waiaas/core` enums/transaction.ts | MODIFY | Add 'SIGNED' to TRANSACTION_STATUSES |
| `@waiaas/core` interfaces/IChainAdapter.ts | MODIFY | Add parseUnsignedTransaction() method |
| `@waiaas/core` interfaces/chain-adapter.types.ts | MODIFY | Add ParsedTransaction type |
| `packages/daemon` pipeline/stages.ts | MODIFY | Add stage5SignOnly() function |
| `packages/daemon` pipeline/pipeline.ts | MODIFY | Add executeSignOnly() method |
| `packages/daemon` api/routes/transactions.ts | MODIFY | Add POST /transactions/sign route |
| `packages/daemon` api/routes/utils.ts | NEW | Encode/decode calldata routes |
| `packages/daemon` infrastructure/settings/setting-keys.ts | MODIFY | Add 3 default-deny toggle settings |
| `packages/daemon` pipeline/database-policy-engine.ts | MODIFY | Inject settings for default-deny toggles |
| `packages/daemon` infrastructure/database/migrate.ts | MODIFY | Migration v9 (SIGNED status CHECK) |
| `packages/adapters/evm` adapter.ts | MODIFY | Add parseUnsignedTransaction() impl |
| `packages/adapters/solana` adapter.ts | MODIFY | Add parseUnsignedTransaction() impl |
| `packages/mcp` tools/sign-transaction.ts | NEW | sign_transaction MCP tool |
| `packages/mcp` tools/encode-calldata.ts | NEW | encode_calldata MCP tool |
| `packages/mcp` resources/skill-*.ts | NEW | 5 skill resource files |
| `packages/mcp` server.ts | MODIFY | Register new tools + resources |
| `packages/sdk` | MODIFY | Add signTransaction(), encodeCalldata() |
| `skills/transactions.skill.md` | MODIFY | Document /sign endpoint + calldata tools |

### 8.2 Dependency Graph

```
[1] @waiaas/core: Add SIGNED status + ParsedTransaction type + IChainAdapter method
      |
      |-- needed by all downstream packages
      |
[2] DB Migration v9: Add 'SIGNED' to CHECK constraint
      |
[3] Adapter implementations: parseUnsignedTransaction() in EvmAdapter + SolanaAdapter
      |
      |-- depends on [1]
      |
[4] Default deny toggles: setting-keys.ts + DatabasePolicyEngine modification
      |
      |-- no dependency on [1-3], independent
      |
[5] Sign-only pipeline: stage5SignOnly + executeSignOnly + route
      |
      |-- depends on [1] (SIGNED status), [2] (migration), [3] (parseUnsignedTx optional)
      |
[6] Calldata encoding: routes/utils.ts + encode_calldata tool
      |
      |-- independent, can be built in parallel with [5]
      |
[7] MCP skill resources: 5 new resource files
      |
      |-- depends on [5] sign-only being defined (transaction skills reference it)
      |-- depends on [4] default deny toggles (policy skills reference them)
      |
[8] SDK methods + skill file updates
      |
      |-- depends on [5], [6] routes being finalized
```

---

## 9. Anti-Patterns to Avoid

### Anti-Pattern 1: Duplicating the Pipeline
**What:** Creating a separate `SignOnlyPipeline` class that copies wallet lookup, network resolution, adapter resolution
**Why bad:** Code duplication, divergent behavior over time, double maintenance
**Instead:** Add `executeSignOnly()` to existing `TransactionPipeline` class, reusing `getWallet()` and all shared logic. Only the stage orchestration differs.

### Anti-Pattern 2: Making Sign-Only Async
**What:** Using the same async fire-and-forget pattern as `/send` for `/sign`
**Why bad:** The caller needs signed bytes in the response. Polling for bytes adds latency and complexity.
**Instead:** Run the entire sign-only pipeline synchronously within the HTTP request handler.

### Anti-Pattern 3: Skipping Policy for Sign-Only
**What:** Bypassing Stage 3 policy evaluation because "the transaction won't be submitted"
**Why bad:** Signing IS authorization. A signed transaction can be submitted by anyone. If we sign a tx that violates CONTRACT_WHITELIST, we've created a security hole.
**Instead:** Full policy evaluation. Only Stage 4 (DELAY/APPROVAL) is skipped/denied.

### Anti-Pattern 4: Hardcoding Skill Data in MCP
**What:** Embedding all skill documentation as string literals in MCP tool files
**Why bad:** Skill data drifts from actual API behavior, not testable, hard to maintain
**Instead:** Derive skill resource data from core schemas where possible. Static skill data in dedicated resource files that can be tested against actual API schemas.

### Anti-Pattern 5: Exposing Private Key in Sign-Only Response
**What:** Including any key material in the `/sign` response metadata
**Why bad:** Security violation. The signed bytes are the output; the key is never exposed.
**Instead:** Only return signedTx hex, unsignedTx hex, fee, and chain-specific metadata (nonce, chainId).

### Anti-Pattern 6: Toggle Default-Deny Per Wallet
**What:** Making the default-deny toggles per-wallet settings instead of global daemon settings
**Why bad:** Explodes the settings surface, complex interaction with per-wallet policies
**Instead:** Global daemon settings in the security category. Per-wallet granularity is achieved through actual ALLOWED_TOKENS/CONTRACT_WHITELIST/APPROVED_SPENDERS policies.

---

## 10. Scalability Considerations

| Concern | Current (1K wallets) | Future (10K wallets) |
|---------|---------------------|---------------------|
| Sign-only latency | ~2-5s (RPC bound) | Same (per-request) |
| Policy toggle cache | In-memory SettingsService | Same (hot-reload already exists) |
| Skill resources | Static JSON, negligible | Same (no scaling concern) |
| Calldata encoding | Pure CPU, instant | Same (no I/O) |
| DB migration (v9) | ALTER CHECK constraint, ~100ms | Same |

---

## 11. Suggested Build Order

Based on dependency analysis in Section 8.2:

1. **Phase A: Core Types + Migration** (foundation, all else depends on it)
   - `@waiaas/core`: SIGNED status, ParsedTransaction type, IChainAdapter method
   - DB migration v9
   - Adapter parseUnsignedTransaction() implementations

2. **Phase B: Default Deny Toggles** (independent, quick win, improves DX immediately)
   - Setting definitions + DatabasePolicyEngine modification
   - Admin UI gets toggles automatically via existing settings panel

3. **Phase C: Sign-Only Pipeline** (depends on Phase A)
   - stage5SignOnly + executeSignOnly + POST /transactions/sign route
   - MCP sign_transaction tool
   - POST /transactions/parse route (uses parseUnsignedTransaction from Phase A)

4. **Phase D: Calldata Encoding** (independent, can parallelize with C)
   - Encode/decode routes in routes/utils.ts
   - MCP encode_calldata tool

5. **Phase E: MCP Skill Resources + SDK + Skill Files** (depends on C and B being complete)
   - 5 new resource files (transactions, policies, chains, tokens, wallet-policies)
   - SDK methods: signTransaction(), encodeCalldata()
   - Update skills/transactions.skill.md

**Phase ordering rationale:**
- Phase A must come first because SIGNED status is needed by the sign-only pipeline and migration must precede any DB writes with SIGNED status
- Phase B is independent and a quick DX win
- Phases C and D can run in parallel since they share no dependencies except Phase A
- Phase E is last because it documents features from C and D, and references toggles from B

---

## Sources

### Codebase Analysis (HIGH confidence)
- Direct code reading of all referenced files in packages/core, packages/daemon, packages/mcp, packages/adapters

### Official Documentation
- [viem encodeFunctionData](https://viem.sh/docs/contract/encodeFunctionData.html) -- ABI encoding API
- [viem decodeFunctionData](https://viem.sh/docs/contract/decodeFunctionData.html) -- ABI decoding API
- [MCP Resources specification](https://modelcontextprotocol.io/specification/2025-06-18/server/tools) -- Resources vs Tools distinction
- [MCP Resources explained](https://medium.com/@laurentkubaski/mcp-resources-explained-and-how-they-differ-from-mcp-tools-096f9d15f767) -- Resources design patterns
- [MCP Features Guide (WorkOS)](https://workos.com/blog/mcp-features-guide) -- Tools vs Resources vs Prompts
