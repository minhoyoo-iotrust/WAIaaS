# Phase 117: Sign-Only Pipeline + REST API - Research

**Researched:** 2026-02-15
**Domain:** Sign-only transaction pipeline, REST API endpoint, policy engine integration, TOCTOU reservation
**Confidence:** HIGH

## Summary

Phase 117 builds a new sign-only pipeline and REST API endpoint (`POST /v1/transactions/sign`) that allows external dApps to submit unsigned transactions for policy evaluation and signing, without on-chain submission. This requires creating an `executeSignOnly()` function in a new `sign-only.ts` module, a `stage5SignOnly()` that signs the raw transaction instead of building/simulating/submitting, adding DELAY/APPROVAL tier immediate rejection, recording results as type='SIGN' + status='SIGNED' in the transactions table, and adding reserved_amount for SPENDING_LIMIT TOCTOU prevention.

Phase 115 has already delivered all prerequisites: SIGNED status and SIGN type in SSoT enums, DB migration v9 with updated CHECK constraints, ParsedTransaction/ParsedOperation/SignedTransaction types in @waiaas/core, parseTransaction() and signExternalTransaction() implementations in both SolanaAdapter and EvmAdapter, and 6 new error codes (INVALID_TRANSACTION, WALLET_NOT_SIGNER, UNSUPPORTED_TX_TYPE, CHAIN_ID_MISMATCH + 2 ChainErrorCodes). Phase 116 has delivered default deny toggles. All building blocks are in place.

The primary design challenge is mapping ParsedOperation[] to the existing policy engine's TransactionParam format, handling multi-operation transactions (Solana multi-instruction) with all-or-nothing evaluation, and ensuring DELAY/APPROVAL tiers are immediately rejected since sign-only is a synchronous API. The reserved_amount mechanism must be extended to include SIGNED status in the reservation sum query.

**Primary recommendation:** Create a separate `sign-only.ts` pipeline module (NOT modify existing `stages.ts`/`pipeline.ts`) that reuses the existing policy engine's `evaluateAndReserve()` for single-operation txs and `evaluateBatch()` for multi-operation txs. Add a new route in `transactions.ts` for `POST /v1/transactions/sign`. Keep the pipeline entirely synchronous -- all operations happen within the request lifecycle.

## Standard Stack

### Core (already in use -- no new dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @hono/zod-openapi | (workspace) | OpenAPI route definition for POST /v1/transactions/sign | Already used for all 44 existing REST endpoints |
| @waiaas/core | (workspace) | ParsedTransaction, SignedTransaction, ParsedOperation types, error codes | Phase 115 delivered all needed types |
| drizzle-orm | (workspace) | Transaction INSERT/UPDATE for SIGN records | Already used throughout daemon |
| better-sqlite3 | (workspace) | Raw SQLite for evaluateAndReserve IMMEDIATE transactions | Already used in DatabasePolicyEngine |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | (workspace via @hono/zod-openapi) | Request validation schema for sign endpoint | Validate { transaction, chain, network } body |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Separate sign-only.ts module | Extend existing stages.ts with signOnly flag | Separate module avoids polluting the 6-stage pipeline with branching, keeps concerns clean |
| evaluateAndReserve for reservation | evaluate + manual reservation | evaluateAndReserve is TOCTOU-safe with BEGIN IMMEDIATE; manual approach has race conditions |
| evaluateBatch for multi-op | Multiple evaluate calls in sequence | evaluateBatch already handles all-or-nothing and aggregate SPENDING_LIMIT logic |

**Installation:**
```bash
# No new packages needed -- all dependencies already present
```

## Architecture Patterns

### Recommended File Changes
```
packages/daemon/src/
  pipeline/
    sign-only.ts                 # NEW: executeSignOnly() function -- sign-only pipeline
  api/routes/
    transactions.ts              # MODIFY: Add POST /v1/transactions/sign route + OpenAPI schema
    openapi-schemas.ts           # MODIFY: Add TxSignRequestSchema, TxSignResponseSchema
  api/server.ts                  # NO CHANGE: /v1/transactions/* already has sessionAuth
  pipeline/
    database-policy-engine.ts    # MODIFY: evaluateAndReserve reservation SUM query includes 'SIGNED' status
  __tests__/
    sign-only-pipeline.test.ts   # NEW: Unit tests for executeSignOnly
    sign-only-api.test.ts        # NEW: Integration tests for POST /v1/transactions/sign
```

### Pattern 1: Sign-Only Pipeline (executeSignOnly)
**What:** A standalone async function that orchestrates: parse -> policy evaluate -> DELAY/APPROVAL check -> sign -> DB record
**When to use:** For POST /v1/transactions/sign requests
**Example:**
```typescript
// Source: New file packages/daemon/src/pipeline/sign-only.ts
import { WAIaaSError, type IChainAdapter, type IPolicyEngine, type ParsedTransaction, type SignedTransaction } from '@waiaas/core';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Database as SQLiteDatabase } from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { transactions } from '../infrastructure/database/schema.js';
import { generateId } from '../infrastructure/database/id.js';
import type { LocalKeyStore } from '../infrastructure/keystore/keystore.js';
import type * as schema from '../infrastructure/database/schema.js';
import { DatabasePolicyEngine } from './database-policy-engine.js';
import { downgradeIfNoOwner } from '../workflow/owner-state.js';
import type { NotificationService } from '../notifications/notification-service.js';
import { wallets } from '../infrastructure/database/schema.js';

export interface SignOnlyDeps {
  db: BetterSQLite3Database<typeof schema>;
  sqlite?: SQLiteDatabase;
  adapter: IChainAdapter;
  keyStore: LocalKeyStore;
  policyEngine: IPolicyEngine;
  masterPassword: string;
  notificationService?: NotificationService;
}

export interface SignOnlyRequest {
  transaction: string;  // base64 (Solana) or hex (EVM)
  chain: string;
  network?: string;
}

export interface SignOnlyResult {
  id: string;           // Transaction ID (UUID v7)
  signedTransaction: string;
  txHash?: string;
  operations: Array<{
    type: string;
    to?: string;
    amount?: string;
    token?: string;
    programId?: string;
    method?: string;
  }>;
  policyResult: {
    tier: string;
  };
}

export async function executeSignOnly(
  deps: SignOnlyDeps,
  walletId: string,
  request: SignOnlyRequest,
  sessionId?: string,
): Promise<SignOnlyResult> {
  // 1. Parse the unsigned transaction
  let parsed: ParsedTransaction;
  try {
    parsed = await deps.adapter.parseTransaction(request.transaction);
  } catch (err) {
    throw new WAIaaSError('INVALID_TRANSACTION', {
      message: err instanceof Error ? err.message : 'Failed to parse transaction',
    });
  }

  // 2. Convert ParsedOperation[] to TransactionParam[] for policy evaluation
  const txParams = parsed.operations.map(mapOperationToParam);

  // 3. Generate transaction ID
  const txId = generateId();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);

  // 4. INSERT transaction record (type='SIGN', status='PENDING' initially)
  const firstOp = parsed.operations[0];
  await deps.db.insert(transactions).values({
    id: txId,
    walletId,
    chain: request.chain,
    network: request.network ?? null,
    type: 'SIGN',
    status: 'PENDING',
    amount: firstOp?.amount?.toString() ?? null,
    toAddress: firstOp?.to ?? null,
    sessionId: sessionId ?? null,
    createdAt: now,
  });

  // 5. Policy evaluation (single op vs multi-op)
  let evaluation;
  if (txParams.length === 1 && deps.policyEngine instanceof DatabasePolicyEngine && deps.sqlite) {
    // Single operation: use evaluateAndReserve for TOCTOU safety
    evaluation = deps.policyEngine.evaluateAndReserve(walletId, txParams[0]!, txId);
  } else if (txParams.length > 1 && deps.policyEngine instanceof DatabasePolicyEngine) {
    // Multiple operations: use evaluateBatch
    evaluation = await deps.policyEngine.evaluateBatch(walletId, txParams);
    // For batch: manually set reserved_amount on the tx row
    if (evaluation.allowed && deps.sqlite) {
      const totalAmount = txParams.reduce((sum, p) => sum + BigInt(p.amount), 0n);
      deps.sqlite.prepare('UPDATE transactions SET reserved_amount = ? WHERE id = ?')
        .run(totalAmount.toString(), txId);
    }
  } else {
    evaluation = await deps.policyEngine.evaluate(walletId, txParams[0]!);
  }

  // 6. Check policy result
  if (!evaluation.allowed) {
    await deps.db.update(transactions)
      .set({ status: 'CANCELLED', error: evaluation.reason ?? 'Policy denied' })
      .where(eq(transactions.id, txId));
    throw new WAIaaSError('POLICY_DENIED', {
      message: evaluation.reason ?? 'Sign-only request denied by policy',
    });
  }

  // 7. DELAY/APPROVAL tier = immediate rejection for sign-only
  if (evaluation.tier === 'DELAY' || evaluation.tier === 'APPROVAL') {
    await deps.db.update(transactions)
      .set({ status: 'CANCELLED', tier: evaluation.tier, error: `Sign-only does not support ${evaluation.tier} tier` })
      .where(eq(transactions.id, txId));
    throw new WAIaaSError('POLICY_DENIED', {
      message: `Sign-only request requires ${evaluation.tier} tier which is not supported. Use POST /v1/transactions/send for high-value transactions.`,
    });
  }

  // 8. Update tier on transaction row
  await deps.db.update(transactions)
    .set({ tier: evaluation.tier })
    .where(eq(transactions.id, txId));

  // 9. Sign the transaction
  let signed: SignedTransaction;
  let privateKey: Uint8Array | null = null;
  try {
    privateKey = await deps.keyStore.decryptPrivateKey(walletId, deps.masterPassword);
    signed = await deps.adapter.signExternalTransaction(request.transaction, privateKey);
  } catch (err) {
    if (privateKey) deps.keyStore.releaseKey(privateKey);
    await deps.db.update(transactions)
      .set({ status: 'FAILED', error: err instanceof Error ? err.message : 'Signing failed' })
      .where(eq(transactions.id, txId));
    throw err instanceof WAIaaSError ? err : new WAIaaSError('CHAIN_ERROR', {
      message: err instanceof Error ? err.message : 'Failed to sign transaction',
    });
  } finally {
    if (privateKey) deps.keyStore.releaseKey(privateKey);
  }

  // 10. Update DB: status='SIGNED'
  const executedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
  await deps.db.update(transactions)
    .set({ status: 'SIGNED', executedAt })
    .where(eq(transactions.id, txId));

  // 11. Return result
  return {
    id: txId,
    signedTransaction: signed.signedTransaction,
    txHash: signed.txHash,
    operations: parsed.operations.map(op => ({
      type: op.type,
      to: op.to,
      amount: op.amount?.toString(),
      token: op.token,
      programId: op.programId,
      method: op.method,
    })),
    policyResult: {
      tier: evaluation.tier,
    },
  };
}
```

### Pattern 2: ParsedOperation to TransactionParam Mapping
**What:** Convert ParsedOperation (from adapter parser) to TransactionParam (for policy engine)
**When to use:** Before every sign-only policy evaluation
**Example:**
```typescript
// Source: packages/daemon/src/pipeline/sign-only.ts

interface TransactionParam {
  type: string;
  amount: string;
  toAddress: string;
  chain: string;
  network?: string;
  tokenAddress?: string;
  contractAddress?: string;
  selector?: string;
  spenderAddress?: string;
  approveAmount?: string;
}

function mapOperationToParam(op: ParsedOperation, chain: string, network?: string): TransactionParam {
  switch (op.type) {
    case 'NATIVE_TRANSFER':
      return {
        type: 'TRANSFER',
        amount: (op.amount ?? 0n).toString(),
        toAddress: op.to ?? '',
        chain,
        network,
      };

    case 'TOKEN_TRANSFER':
      return {
        type: 'TOKEN_TRANSFER',
        amount: (op.amount ?? 0n).toString(),
        toAddress: op.to ?? '',
        chain,
        network,
        tokenAddress: op.token,
      };

    case 'CONTRACT_CALL':
      return {
        type: 'CONTRACT_CALL',
        amount: '0',
        toAddress: op.programId ?? op.to ?? '',
        chain,
        network,
        contractAddress: op.programId ?? op.to,
        selector: op.method,
      };

    case 'APPROVE':
      return {
        type: 'APPROVE',
        amount: (op.amount ?? 0n).toString(),
        toAddress: op.to ?? '',
        chain,
        network,
        spenderAddress: op.to,
        approveAmount: (op.amount ?? 0n).toString(),
      };

    case 'UNKNOWN':
    default:
      // UNKNOWN operations are mapped to CONTRACT_CALL for CONTRACT_WHITELIST evaluation
      // If CONTRACT_WHITELIST is active (default), this will be denied unless the programId is whitelisted
      return {
        type: 'CONTRACT_CALL',
        amount: '0',
        toAddress: op.programId ?? op.to ?? '',
        chain,
        network,
        contractAddress: op.programId ?? op.to,
        selector: op.method,
      };
  }
}
```

### Pattern 3: REST API Route (POST /v1/transactions/sign)
**What:** OpenAPI route definition using @hono/zod-openapi createRoute pattern
**When to use:** Adding the sign-only endpoint to the existing transactions router
**Example:**
```typescript
// Source: packages/daemon/src/api/routes/transactions.ts (addition)

const signTransactionRoute = createRoute({
  method: 'post',
  path: '/transactions/sign',
  tags: ['Transactions'],
  summary: 'Sign an external unsigned transaction',
  description: 'Parse, evaluate against policies, and sign an unsigned transaction built by an external dApp. Returns the signed transaction synchronously.',
  request: {
    body: {
      content: {
        'application/json': { schema: TxSignRequestSchema },
      },
    },
  },
  responses: {
    200: {
      description: 'Transaction signed successfully',
      content: { 'application/json': { schema: TxSignResponseSchema } },
    },
    ...buildErrorResponses(['INVALID_TRANSACTION', 'WALLET_NOT_SIGNER', 'POLICY_DENIED', 'WALLET_NOT_FOUND']),
  },
});
```

### Pattern 4: OpenAPI Request/Response Schemas
**What:** Zod schemas for the sign endpoint
**When to use:** Defining the API contract in openapi-schemas.ts
**Example:**
```typescript
// Source: packages/daemon/src/api/routes/openapi-schemas.ts (addition)

export const TxSignRequestSchema = z
  .object({
    transaction: z.string().min(1).openapi({ description: 'Unsigned transaction (base64 for Solana, 0x-hex for EVM)' }),
    chain: z.string().optional().openapi({ description: 'Chain type (optional -- inferred from wallet)' }),
    network: z.string().optional().openapi({ description: 'Network (optional -- resolved from wallet defaults)' }),
  })
  .openapi('TxSignRequest');

export const TxSignResponseSchema = z
  .object({
    id: z.string().uuid(),
    signedTransaction: z.string(),
    txHash: z.string().nullable(),
    operations: z.array(z.object({
      type: z.string(),
      to: z.string().nullable().optional(),
      amount: z.string().nullable().optional(),
      token: z.string().nullable().optional(),
      programId: z.string().nullable().optional(),
      method: z.string().nullable().optional(),
    })),
    policyResult: z.object({
      tier: z.string(),
    }),
  })
  .openapi('TxSignResponse');
```

### Pattern 5: evaluateAndReserve reservation query extension
**What:** Include 'SIGNED' status in reserved_amount SUM query
**When to use:** When calculating pending reservations for SPENDING_LIMIT TOCTOU prevention
**Example:**
```typescript
// Source: packages/daemon/src/pipeline/database-policy-engine.ts (modification)
// Current L529-534:
const reservedRow = sqlite
  .prepare(
    `SELECT COALESCE(SUM(CAST(reserved_amount AS INTEGER)), 0) AS total
     FROM transactions
     WHERE wallet_id = ?
       AND status IN ('PENDING', 'QUEUED')
       AND reserved_amount IS NOT NULL`,
  )
  .get(walletId) as { total: number };

// Changed to include SIGNED:
const reservedRow = sqlite
  .prepare(
    `SELECT COALESCE(SUM(CAST(reserved_amount AS INTEGER)), 0) AS total
     FROM transactions
     WHERE wallet_id = ?
       AND status IN ('PENDING', 'QUEUED', 'SIGNED')
       AND reserved_amount IS NOT NULL`,
  )
  .get(walletId) as { total: number };
```

### Anti-Patterns to Avoid
- **Modifying existing `stages.ts` with signOnly branching:** Adding a `signOnly` flag to PipelineContext and branching in each stage creates coupling between two conceptually separate pipelines. Use a separate module.
- **Skipping stage4 for DELAY/APPROVAL instead of explicitly rejecting:** "Skipping" DELAY/APPROVAL silently is a policy bypass. Explicitly reject with clear error message explaining why sign-only doesn't support these tiers.
- **Using `evaluate()` instead of `evaluateAndReserve()` for sign-only:** Sign-only transactions with amounts must participate in SPENDING_LIMIT reservation to prevent double-spend. Always use evaluateAndReserve when sqlite is available.
- **Releasing key before finally block:** The `decryptPrivateKey -> signExternalTransaction -> releaseKey` pattern MUST use try/finally to ensure key release even on error. Existing stage5Execute demonstrates this pattern.
- **Forgetting to handle the case where adapter.parseTransaction or signExternalTransaction throws ChainError:** These throw ChainError (not WAIaaSError). Convert to WAIaaSError at the pipeline boundary for consistent API error responses.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Policy evaluation for parsed operations | Custom policy evaluation for sign-only | Existing `evaluateAndReserve()` / `evaluateBatch()` / `evaluate()` | Already handles 11 policy types, TOCTOU, network scoping, owner downgrade |
| Transaction ID generation | Manual UUID | `generateId()` from `infrastructure/database/id.js` | UUID v7 with ms-precision ordering, already used everywhere |
| Private key lifecycle | Manual key buffer management | `keyStore.decryptPrivateKey()` + `keyStore.releaseKey()` with try/finally | Secure key zeroing on release, existing pattern in stage5Execute |
| Network resolution | Custom network logic | `resolveNetwork()` from `pipeline/network-resolver.ts` | 3-level priority (request > wallet default > environment), environment-network validation |
| OpenAPI route definition | Manual Hono routes | `createRoute` + `router.openapi()` from @hono/zod-openapi | Automatic validation, OpenAPI doc generation, consistent error format |

**Key insight:** Phase 117 is primarily an integration/orchestration phase. Every building block (parsing, signing, policy evaluation, DB schema) already exists. The work is connecting them correctly in a new execution path.

## Common Pitfalls

### Pitfall 1: Reserved Amount Not Including SIGNED Status in SUM Query
**What goes wrong:** The existing `evaluateAndReserve()` sums `reserved_amount` only for `status IN ('PENDING', 'QUEUED')`. Sign-only transactions have status='SIGNED', so their reservations are excluded from the sum, defeating double-spend prevention.
**Why it happens:** Phase 115 added the SIGNED status but didn't modify the reservation query (that's Phase 117's job).
**How to avoid:** Add `'SIGNED'` to the `status IN (...)` clause in `evaluateAndReserve()` at line ~531 of `database-policy-engine.ts`. This is the single most critical change for SIGN-10 requirement compliance.
**Warning signs:** Two sign-only requests for the same wallet both pass SPENDING_LIMIT evaluation despite their sum exceeding the limit.

### Pitfall 2: DELAY/APPROVAL Tier Not Explicitly Rejected
**What goes wrong:** If sign-only uses the existing `stage4Wait()`, DELAY tier throws `PIPELINE_HALTED` (which is caught by the route handler's background error catcher). The client gets no signed transaction and no clear error message.
**Why it happens:** `PIPELINE_HALTED` is an internal signal, not a user-facing error. Sign-only must convert DELAY/APPROVAL to an explicit `POLICY_DENIED` error.
**How to avoid:** After policy evaluation returns `evaluation.tier`, check for DELAY/APPROVAL BEFORE attempting to sign. Throw `WAIaaSError('POLICY_DENIED')` with a message that explains why sign-only cannot process this tier and suggests using `/v1/transactions/send` instead.
**Warning signs:** sign-only requests for amounts in the DELAY range hang or return 500 errors instead of clear 403 POLICY_DENIED.

### Pitfall 3: Private Key Double-Release or Leak
**What goes wrong:** `decryptPrivateKey` returns a key buffer. If `signExternalTransaction` throws and the error handler doesn't call `releaseKey`, the key remains in memory. Alternatively, if both the catch block AND the finally block call `releaseKey`, it's a double-release.
**Why it happens:** Complex try/catch/finally flow with async operations.
**How to avoid:** Use the exact pattern from existing `stage5Execute` (stages.ts L557-565): declare `privateKey = null`, assign in try block, call `releaseKey` in finally block with null check. Never call releaseKey in catch blocks.
**Warning signs:** Memory leaks over time (key buffers not zeroed), or "key already released" errors.

### Pitfall 4: Multi-Operation Transaction Reservation Amount Mismatch
**What goes wrong:** For Solana multi-instruction transactions, `evaluateBatch()` evaluates per-instruction policies and aggregates NATIVE_TRANSFER amounts. But `evaluateBatch` does NOT call `evaluateAndReserve` (it doesn't set `reserved_amount` on the transaction row). Sign-only must manually set the reservation.
**Why it happens:** `evaluateBatch()` was designed for the send pipeline where reservation happens in stage3Policy via evaluateAndReserve for non-batch, but batch uses a different code path.
**How to avoid:** After `evaluateBatch()` returns allowed=true, manually set `reserved_amount` on the transaction row using raw SQLite. Calculate the total native amount from txParams the same way evaluateBatch does.
**Warning signs:** Multi-instruction sign-only transactions don't have `reserved_amount` set, causing SPENDING_LIMIT bypass for subsequent requests.

### Pitfall 5: SessionAuth Already Covers /v1/transactions/* But Chain Must Match Wallet
**What goes wrong:** `server.ts` applies sessionAuth to `/v1/transactions/*`, so `/v1/transactions/sign` is automatically protected. However, sign-only must also verify that the wallet's chain matches the unsigned transaction's chain.
**Why it happens:** The session JWT contains `walletId`, and the wallet has a `chain` field. If the wallet is Solana but the unsigned tx is EVM hex, the parser will fail with an unhelpful error.
**How to avoid:** After looking up the wallet, verify `wallet.chain` is compatible with the unsigned transaction format. For Solana: transaction starts with valid base64, for EVM: transaction starts with `0x`. Provide a clear error if mismatched: "Wallet chain 'solana' does not match transaction format (expected base64, got hex)".
**Warning signs:** Confusing `INVALID_RAW_TRANSACTION` errors when the real issue is chain mismatch.

### Pitfall 6: OpenAPI Route Path Conflict with Existing Routes
**What goes wrong:** The route `/transactions/sign` could conflict with `/transactions/:id` if Hono's router matches `:id = 'sign'` before matching the literal `sign` path.
**Why it happens:** Route registration order matters in Hono. If `getTransactionRoute` (path: `/transactions/{id}`) is registered before `signTransactionRoute` (path: `/transactions/sign`), the string "sign" might be captured as an `:id` parameter.
**How to avoid:** Register the `signTransactionRoute` BEFORE the `getTransactionRoute` in the router. This is the same pattern used for `/transactions/pending` which is already registered before `/transactions/:id`. Alternatively, since `getTransactionRoute` uses `z.string().uuid()` for the id param, "sign" would fail UUID validation and fall through to the next route -- but relying on validation order is fragile. Explicit ordering is safer.
**Warning signs:** GET /v1/transactions/sign returns "Transaction 'sign' not found" (404) or validation error instead of reaching the POST handler.

### Pitfall 7: Notification Events for Sign-Only
**What goes wrong:** The existing pipeline fires TX_REQUESTED, TX_SUBMITTED, TX_CONFIRMED notifications. Sign-only should fire TX_REQUESTED at the start and a new event type (or TX_SUBMITTED equivalent) when signing completes, but NOT TX_CONFIRMED (since WAIaaS doesn't know if the tx is submitted on-chain).
**Why it happens:** Reusing existing notification event types without considering the different lifecycle.
**How to avoid:** Fire `TX_REQUESTED` when the sign request arrives, and `TX_SUBMITTED` (or ideally a new `TX_SIGNED` event) when signing completes. Do NOT fire TX_CONFIRMED. Use `void notificationService?.notify(...)` pattern (fire-and-forget, never blocks pipeline).
**Warning signs:** Admin sees "Transaction Confirmed" notifications for transactions that were only signed, not submitted.

## Code Examples

Verified patterns from existing codebase:

### Route Handler Pattern (from existing POST /transactions/send)
```typescript
// Source: packages/daemon/src/api/routes/transactions.ts L240-370
// The sign endpoint follows the same pattern but is fully synchronous
router.openapi(signTransactionRoute, async (c) => {
  const walletId = c.get('walletId' as never) as string;
  const sessionId = c.get('sessionId' as never) as string | undefined;

  // Look up wallet
  const wallet = await deps.db.select().from(wallets).where(eq(wallets.id, walletId)).get();
  if (!wallet) {
    throw new WAIaaSError('WALLET_NOT_FOUND', { message: `Wallet '${walletId}' not found` });
  }

  // Resolve network (same pattern as send)
  const resolvedNetwork = resolveNetwork(
    request.network as NetworkType | undefined,
    wallet.defaultNetwork as NetworkType | null,
    wallet.environment as EnvironmentType,
    wallet.chain as ChainType,
  );

  // Resolve adapter from pool
  const rpcUrl = resolveRpcUrl(deps.config.rpc, wallet.chain, resolvedNetwork);
  const adapter = await deps.adapterPool.resolve(
    wallet.chain as ChainType,
    resolvedNetwork as NetworkType,
    rpcUrl,
  );

  // Execute sign-only pipeline (fully synchronous)
  const result = await executeSignOnly(
    { db: deps.db, sqlite: deps.sqlite, adapter, keyStore: deps.keyStore, policyEngine: deps.policyEngine, masterPassword: deps.masterPassword, notificationService: deps.notificationService },
    walletId,
    { transaction: body.transaction, chain: wallet.chain, network: resolvedNetwork },
    sessionId,
  );

  return c.json(result, 200);
});
```

### Key Release Pattern (from existing stage5Execute)
```typescript
// Source: packages/daemon/src/pipeline/stages.ts L557-565
// CRITICAL: key MUST be released in finally block
let privateKey: Uint8Array | null = null;
try {
  privateKey = await ctx.keyStore.decryptPrivateKey(ctx.walletId, ctx.masterPassword);
  ctx.signedTx = await ctx.adapter.signTransaction(ctx.unsignedTx, privateKey);
} finally {
  if (privateKey) {
    ctx.keyStore.releaseKey(privateKey);
  }
}
```

### Notification Pattern (from existing stage1Validate)
```typescript
// Source: packages/daemon/src/pipeline/stages.ts L215-219
// Fire-and-forget: notify TX_REQUESTED (never blocks pipeline)
void ctx.notificationService?.notify('TX_REQUESTED', ctx.walletId, {
  amount: amount ?? '0',
  to: toAddress ?? '',
  type: txType,
}, { txId: ctx.txId });
```

### evaluateAndReserve Usage (from existing stage3Policy)
```typescript
// Source: packages/daemon/src/pipeline/stages.ts L274-280
if (ctx.policyEngine instanceof DatabasePolicyEngine && ctx.sqlite) {
  evaluation = ctx.policyEngine.evaluateAndReserve(
    ctx.walletId,
    txParam,
    ctx.txId,
  );
} else {
  evaluation = await ctx.policyEngine.evaluate(ctx.walletId, txParam);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 6-stage send pipeline only | Send + sign-only pipelines | v1.4.7 (this phase) | Second execution path for external tx signing |
| reserved_amount only for PENDING/QUEUED | reserved_amount for PENDING/QUEUED/SIGNED | v1.4.7 (this phase) | Sign-only txs participate in SPENDING_LIMIT |
| DELAY/APPROVAL always supported | DELAY/APPROVAL rejected for sign-only | v1.4.7 (this phase) | Synchronous API incompatible with async workflows |

**Key architectural note:** The sign-only pipeline is intentionally a separate module, NOT an extension of the existing 6-stage pipeline. This keeps the send pipeline clean and avoids branching complexity. Both pipelines share the same policy engine, keystore, and DB.

## Open Questions

1. **Notification Event Type for Sign Completion**
   - What we know: Existing events are TX_REQUESTED, TX_SUBMITTED, TX_CONFIRMED, TX_FAILED, POLICY_VIOLATION. Sign-only has a different lifecycle.
   - What's unclear: Whether to reuse TX_SUBMITTED for the "signed" event or add a new TX_SIGNED event type.
   - Recommendation: Reuse TX_SUBMITTED for now (it's the closest semantic match -- "transaction was processed and is ready"). Adding a new event type would require modifying the NotificationEventType enum and all downstream consumers (admin UI, etc.). Phase 119 (notifications enhancement) can add TX_SIGNED if needed. For Phase 117, use TX_SUBMITTED with a metadata field indicating sign-only.

2. **Owner Downgrade for Sign-Only APPROVAL Tier**
   - What we know: Current stage3Policy calls `downgradeIfNoOwner()` when tier is APPROVAL. For sign-only, APPROVAL is immediately rejected.
   - What's unclear: Should we check `downgradeIfNoOwner()` before rejecting APPROVAL? If owner is not registered, APPROVAL downgrades to DELAY, which is also rejected.
   - Recommendation: Skip `downgradeIfNoOwner()` for sign-only. Both DELAY and APPROVAL are rejected, so the downgrade result doesn't matter. Simpler code, same outcome.

3. **Batch Reservation for Multi-Op Sign-Only**
   - What we know: `evaluateBatch()` doesn't set `reserved_amount`. Single-op uses `evaluateAndReserve()`.
   - What's unclear: Whether multi-op (Solana multi-instruction) sign-only should sum all native amounts for reservation.
   - Recommendation: Yes, sum all `NATIVE_TRANSFER` operation amounts (matching evaluateBatch's Phase B logic) and manually set `reserved_amount` on the tx row via raw SQLite after evaluateBatch succeeds. This is consistent with how the send pipeline handles batch reservations.

## Sources

### Primary (HIGH confidence)
- Codebase: `packages/daemon/src/pipeline/stages.ts` -- Current 6-stage pipeline, PipelineContext, stage5Execute key handling pattern, stage3Policy evaluation pattern
- Codebase: `packages/daemon/src/pipeline/database-policy-engine.ts` -- evaluateAndReserve() L442-583, evaluateBatch() L261-363, reservation SUM query L529-534
- Codebase: `packages/daemon/src/api/routes/transactions.ts` -- Route registration pattern, TransactionRouteDeps, async pipeline execution
- Codebase: `packages/daemon/src/api/routes/openapi-schemas.ts` -- Schema definition pattern, buildErrorResponses
- Codebase: `packages/daemon/src/api/server.ts` -- sessionAuth on /v1/transactions/*, route registration with deps
- Codebase: `packages/core/src/interfaces/chain-adapter.types.ts` -- ParsedTransaction, ParsedOperation, SignedTransaction types (L195-237)
- Codebase: `packages/core/src/enums/transaction.ts` -- TRANSACTION_STATUSES includes 'SIGNED', TRANSACTION_TYPES includes 'SIGN'
- Phase 115 VERIFICATION.md -- Confirms all prerequisites (types, parsers, adapters, migration) are implemented and verified
- Phase 115 RESEARCH.md -- Adapter implementation patterns, instruction identification, error handling

### Secondary (MEDIUM confidence)
- Milestone doc: `objectives/v1.4.7-arbitrary-transaction-signing.md` -- Full design spec with API request/response format, policy evaluation flow, DB changes
- Research: `.planning/research/v1.7-sign-only-PITFALLS.md` -- C-02 (reserved_amount), C-03 (DELAY/APPROVAL), H-04 (policy mapping), H-05 (state model)

### Tertiary (LOW confidence)
- None -- all findings are based on direct codebase analysis

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all APIs verified in codebase
- Architecture: HIGH -- direct analysis of existing pipeline (stages.ts, database-policy-engine.ts, transactions.ts), clear separation pattern
- Pitfalls: HIGH -- identified from actual codebase patterns (evaluateAndReserve query, stage4Wait PIPELINE_HALTED, key release pattern)
- Policy mapping: HIGH -- existing TransactionParam interface and buildTransactionParam function analyzed, ParsedOperation mapping is straightforward

**Research date:** 2026-02-15
**Valid until:** 2026-03-15 (stable -- internal codebase patterns, locked dependency versions)

## Detailed Findings for Planner

### 1. Files to Create/Modify

| File | Action | Lines | Complexity |
|------|--------|-------|------------|
| `packages/daemon/src/pipeline/sign-only.ts` | CREATE | ~200 | HIGH -- main pipeline orchestration |
| `packages/daemon/src/api/routes/transactions.ts` | MODIFY | ~60 | MEDIUM -- new route handler |
| `packages/daemon/src/api/routes/openapi-schemas.ts` | MODIFY | ~30 | LOW -- new Zod schemas |
| `packages/daemon/src/pipeline/database-policy-engine.ts` | MODIFY | ~3 | LOW -- add 'SIGNED' to reservation query |
| `packages/daemon/src/__tests__/sign-only-pipeline.test.ts` | CREATE | ~300 | MEDIUM -- unit tests |
| `packages/daemon/src/__tests__/sign-only-api.test.ts` | CREATE | ~400 | MEDIUM -- integration tests |

### 2. Sign-Only Pipeline Flow (10 Steps)

```
1. Parse unsigned tx:        adapter.parseTransaction(rawTx) -> ParsedTransaction
2. Map to policy params:     ParsedOperation[] -> TransactionParam[]
3. Generate tx ID:           generateId() -> UUID v7
4. INSERT DB record:         type='SIGN', status='PENDING'
5. Evaluate policy:          evaluateAndReserve (single) or evaluateBatch (multi)
6. Check policy result:      if !allowed -> CANCELLED + throw POLICY_DENIED
7. Check tier:               if DELAY/APPROVAL -> CANCELLED + throw POLICY_DENIED
8. Update tier:              tier set on tx row
9. Sign:                     keyStore.decrypt -> adapter.signExternalTransaction -> keyStore.release
10. Update status:           status='SIGNED' + return result
```

### 3. Policy Mapping Table

| ParsedOperationType | Maps to TransactionParam.type | Evaluated by |
|---------------------|-------------------------------|--------------|
| NATIVE_TRANSFER | TRANSFER | WHITELIST, SPENDING_LIMIT |
| TOKEN_TRANSFER | TOKEN_TRANSFER | WHITELIST, ALLOWED_TOKENS, SPENDING_LIMIT |
| CONTRACT_CALL | CONTRACT_CALL | CONTRACT_WHITELIST, METHOD_WHITELIST |
| APPROVE | APPROVE | APPROVED_SPENDERS, APPROVE_AMOUNT_LIMIT, APPROVE_TIER_OVERRIDE |
| UNKNOWN | CONTRACT_CALL | CONTRACT_WHITELIST (default deny for unknown) |

### 4. Error Code Usage

| Error | When | HTTP |
|-------|------|------|
| INVALID_TRANSACTION | rawTx cannot be decoded by adapter parser | 400 |
| WALLET_NOT_SIGNER | Solana: wallet pubkey not in signer list | 400 |
| WALLET_NOT_FOUND | walletId from session not in DB | 404 |
| POLICY_DENIED | Any policy evaluation failure or DELAY/APPROVAL tier | 403 |
| CHAIN_ERROR | Signing operation failure | 500 |

### 5. Test Strategy

**Unit tests (sign-only-pipeline.test.ts):**
- Parse success -> policy INSTANT -> sign -> SIGNED record
- Parse failure -> INVALID_TRANSACTION error
- Policy denial -> CANCELLED + POLICY_DENIED
- DELAY tier -> immediate rejection with clear message
- APPROVAL tier -> immediate rejection with clear message
- NOTIFY tier -> sign proceeds (same as INSTANT)
- Multi-operation tx -> evaluateBatch + all-or-nothing
- reserved_amount set after successful evaluation
- Key release on signing error (verify cleanup)

**Integration tests (sign-only-api.test.ts):**
- POST /v1/transactions/sign with valid Solana base64 tx -> 200 + signedTransaction
- POST /v1/transactions/sign with valid EVM hex tx -> 200 + signedTransaction
- POST /v1/transactions/sign with SPENDING_LIMIT DELAY amount -> 403 POLICY_DENIED
- POST /v1/transactions/sign with CONTRACT_WHITELIST denial -> 403 POLICY_DENIED
- POST /v1/transactions/sign without sessionAuth -> 401
- POST /v1/transactions/sign with invalid rawTx -> 400 INVALID_TRANSACTION
- DB record verification: type='SIGN', status='SIGNED'
- reserved_amount accumulation: sign 5 SOL -> evaluateAndReserve includes it

### 6. server.ts Auth Coverage

**No changes needed to server.ts.** The existing sessionAuth middleware covers:
```typescript
app.use('/v1/transactions', sessionAuth);    // Covers GET /v1/transactions
app.use('/v1/transactions/*', sessionAuth);  // Covers POST /v1/transactions/sign
```

`POST /v1/transactions/sign` is under `/v1/transactions/*`, so sessionAuth is automatically applied. The `walletId` and `sessionId` are extracted from the JWT and set on the Hono context, available via `c.get('walletId')` and `c.get('sessionId')`.

### 7. Transaction Response Format

The sign endpoint returns a richer response than the send endpoint (which returns only `{ id, status: 'PENDING' }`). Sign-only is synchronous, so it can return the full result:

```json
{
  "id": "019...",
  "signedTransaction": "base64-or-hex-signed-tx",
  "txHash": null,
  "operations": [
    { "type": "NATIVE_TRANSFER", "to": "9bKrTD...", "amount": "1000000000" }
  ],
  "policyResult": {
    "tier": "INSTANT"
  }
}
```

This format matches the milestone document's API specification (objectives/v1.4.7-arbitrary-transaction-signing.md, "응답 (성공)" section).
