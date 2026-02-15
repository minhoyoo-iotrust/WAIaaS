# Architecture Patterns: x402 Client Integration

**Domain:** x402 HTTP-native payment protocol client support for WAIaaS daemon
**Researched:** 2026-02-15
**Confidence:** MEDIUM-HIGH (protocol spec verified via official docs; integration design based on thorough codebase analysis)

## Protocol Context

x402 is an open payment protocol (originally by Coinbase, now governed by the x402 Foundation) that uses the HTTP 402 "Payment Required" status code to enable stablecoin payments over HTTP. The protocol flow:

1. Client sends HTTP request to a paid API endpoint
2. Server responds with HTTP 402 + `PAYMENT-REQUIRED` header (base64 PaymentRequired object)
3. Client parses PaymentRequirements, selects scheme/network, constructs PaymentPayload (EIP-3009 signed authorization for EVM, equivalent for SVM)
4. Client resends request with `PAYMENT-SIGNATURE` header containing the PaymentPayload
5. Server verifies payment via facilitator, fulfills request, settles on-chain
6. Response includes `PAYMENT-RESPONSE` header with settlement confirmation

**Key insight for WAIaaS:** WAIaaS acts as the **client** (buyer) in this protocol. The daemon receives a request from an AI agent to fetch a paid resource, handles the 402 handshake with its wallet's signing capability, and returns the resource to the agent. This is fundamentally a **proxy with payment capability**.

---

## Recommended Architecture

### Q1: Should x402 use the existing 6-stage pipeline or create a separate flow?

**Recommendation: Create a separate x402 pipeline module, like sign-only.**

The existing 6-stage pipeline (validate -> auth -> policy -> wait -> execute -> confirm) is designed for wallet-initiated outbound transactions where WAIaaS builds, signs, and submits a transaction to the blockchain. The x402 flow is fundamentally different:

1. The daemon does NOT build or submit a blockchain transaction. The x402 facilitator handles settlement.
2. The payment is an EIP-3009 `transferWithAuthorization` signature -- gasless, off-chain signing only.
3. The flow is synchronous (agent waits for the HTTP response from the external API).
4. The "transaction" is actually the payment authorization embedded in the PAYMENT-SIGNATURE header.

**However**, the x402 pipeline should **reuse policy evaluation** from the existing infrastructure. The flow:

```
POST /v1/x402/fetch
    |
    v
[1. Validate request (URL, method, headers)]
    |
    v
[2. SSRF guard (URL domain/IP validation)]
    |
    v
[3. Domain allowlist check (x402.allowed_domains via SettingsService)]
    |
    v
[4. Preflight: fetch target URL to get 402 response]
    |  (if no 402, return response directly -- free endpoint)
    v
[5. Parse PAYMENT-REQUIRED header, select scheme/network]
    |
    v
[6. Create DB transaction record (type=X402_PAYMENT, status=PENDING)]
    |
    v
[7. Policy evaluation (SPENDING_LIMIT via evaluateAndReserve)]
    |
    v
[8. Sign payment (EIP-3009 authorization via wallet key)]
    |
    v
[9. Retry request with PAYMENT-SIGNATURE header]
    |
    v
[10. Parse PAYMENT-RESPONSE, update DB (CONFIRMED), return response]
```

This is structurally analogous to `sign-only.ts` -- a standalone pipeline module in `packages/daemon/src/pipeline/x402-fetch.ts` that imports and reuses `DatabasePolicyEngine.evaluateAndReserve()` for policy checking, but does NOT use stages.ts or the 6-stage pipeline.

**Rationale vs alternatives:**

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| Extend 6-stage pipeline | Reuse all stages | Every stage needs x402 branching; Stage 5 (on-chain exec) is completely wrong for x402 | Rejected |
| Separate module (like sign-only) | Clean separation, reuse evaluateAndReserve, testable | Some code duplication (DB insert, key management) | **Selected** |
| New 8-stage x402 pipeline | Maximum structure | Over-engineering for a single endpoint | Rejected |

### Q2: How does X402_PAYMENT fit as a 6th TransactionType in discriminatedUnion?

**Recommendation: Add `'X402_PAYMENT'` as a transaction type for audit/DB records, but NOT in the API-facing discriminatedUnion request schema.**

The discriminatedUnion 5-type (`TransactionRequestSchema`) is for API request validation on `POST /v1/transactions/send`. x402 payments arrive via `POST /v1/x402/fetch`, not via the transaction send endpoint. Therefore:

1. **Add `'X402_PAYMENT'` to `TRANSACTION_TYPES` enum** in `@waiaas/core/enums/transaction.ts` (makes it a 7th type alongside SIGN). This ensures the DB `CHECK` constraint allows storing x402 payment records.

2. **Do NOT add X402PaymentRequestSchema to `TransactionRequestSchema`** -- the x402 endpoint has its own request schema (URL, method, headers, body).

3. **Create a DB transaction record** with `type: 'X402_PAYMENT'` for every x402 payment that passes policy evaluation. This provides:
   - Audit trail (who paid what, to whom, when)
   - SPENDING_LIMIT reservation (TOCTOU prevention via `evaluateAndReserve`)
   - Transaction history in GET /v1/transactions list

```typescript
// In TRANSACTION_TYPES:
export const TRANSACTION_TYPES = [
  'TRANSFER',
  'TOKEN_TRANSFER',
  'CONTRACT_CALL',
  'APPROVE',
  'BATCH',
  'SIGN',
  'X402_PAYMENT',  // NEW
] as const;
```

The DB record uses existing columns:
- `type`: 'X402_PAYMENT'
- `amount`: payment amount from PaymentRequirements
- `toAddress`: `payTo` address from PaymentRequirements
- `chain`/`network`: mapped from CAIP-2 network identifier
- `metadata`: JSON with x402-specific fields (URL, scheme, asset, settlement hash)

### Q3: Where does X402_ALLOWED_DOMAINS check fit in the pipeline?

**Recommendation: Domain allowlist evaluates in the x402 pipeline module, BEFORE policy engine evaluation, using SettingsService (not a new PolicyType).**

The policy evaluation order in `DatabasePolicyEngine.evaluate()` is well-established for transaction-level policy (WHITELIST, ALLOWED_NETWORKS, SPENDING_LIMIT, etc.). X402_ALLOWED_DOMAINS is a **service-level access control** -- it determines whether the x402 feature itself is available for a given target, not a transaction property. It belongs at the handler level, not in the policy engine.

**Implementation approach:** Use `SettingsService` with key `x402.allowed_domains` (JSON array of domain patterns). The x402 pipeline reads this before any HTTP request or policy evaluation.

```typescript
// In x402-fetch.ts, step 3:
const allowedDomainsJson = settingsService.get('x402.allowed_domains');
if (!allowedDomainsJson) {
  throw new WAIaaSError('POLICY_DENIED', {
    message: 'x402 disabled: no x402.allowed_domains configured (default deny)',
  });
}
const allowedDomains: string[] = JSON.parse(allowedDomainsJson);
const targetDomain = new URL(targetUrl).hostname;
if (!allowedDomains.some(d => targetDomain === d || targetDomain.endsWith('.' + d))) {
  throw new WAIaaSError('POLICY_DENIED', {
    message: `Domain '${targetDomain}' not in x402 allowed domains`,
  });
}
```

**Why not a new PolicyType:**
1. Domain allowlists are x402-specific, not applicable to TRANSFER/TOKEN_TRANSFER/CONTRACT_CALL/APPROVE/BATCH
2. PolicyTypes are evaluated per-wallet with 4-level override priority -- overkill for a global domain list
3. Keeping it in SettingsService enables hot-reload via Admin UI without modifying the policy engine
4. Consistent with the default deny pattern (no config = no x402)

**Why before SPENDING_LIMIT:** To fail fast. If the domain is not allowed, there is no reason to compute reserved amounts or evaluate spending limits. The order in the x402 pipeline is:

```
SSRF guard -> allowed_domains -> [preflight HTTP] -> evaluateAndReserve(SPENDING_LIMIT)
```

### Q4: How should the x402 handler coordinate with the pipeline?

**Recommendation: x402 pipeline creates a transaction record and uses `evaluateAndReserve` for SPENDING_LIMIT, following the sign-only pattern.**

The full flow with pipeline coordination:

```typescript
// pipeline/x402-fetch.ts

export interface X402FetchDeps {
  db: BetterSQLite3Database<typeof schema>;
  sqlite?: SQLiteDatabase;
  keyStore: LocalKeyStore;
  policyEngine: IPolicyEngine;
  masterPassword: string;
  settingsService?: SettingsService;
  notificationService?: NotificationService;
  priceOracle?: IPriceOracle;
}

export interface X402FetchRequest {
  url: string;               // target URL (must be HTTPS)
  method?: string;           // default GET
  headers?: Record<string, string>;  // custom headers (forwarded to target)
  body?: string;             // request body (for POST/PUT)
  maxPayment?: string;       // optional max payment in raw units (agent safety cap)
}

export interface X402FetchResult {
  status: number;            // proxied HTTP status
  headers: Record<string, string>;  // proxied response headers
  body: string;              // proxied response body
  payment?: {
    txId: string;            // WAIaaS transaction ID
    amount: string;          // amount paid
    asset: string;           // payment asset (USDC address)
    network: string;         // CAIP-2 network
    txHash: string | null;   // settlement hash from facilitator
  };
}

export async function executeX402Fetch(
  deps: X402FetchDeps,
  walletId: string,
  wallet: { publicKey: string; chain: string; environment: string },
  request: X402FetchRequest,
  sessionId?: string,
): Promise<X402FetchResult> {

  // Step 1-2: Validate URL + SSRF guard
  await ssrfGuard(request.url);

  // Step 3: Check x402.allowed_domains
  checkAllowedDomains(deps.settingsService, request.url);

  // Step 4: Preflight fetch
  const preflightResponse = await safeFetch(request.url, {
    method: request.method ?? 'GET',
    headers: request.headers,
    body: request.body,
  });

  // No payment required -- return response directly
  if (preflightResponse.status !== 402) {
    return buildFreeResponse(preflightResponse);
  }

  // Step 5: Parse PAYMENT-REQUIRED header
  const paymentRequired = parsePaymentRequired(
    preflightResponse.headers.get('PAYMENT-REQUIRED')
  );
  const selected = selectPaymentRequirement(paymentRequired, wallet);

  // Step 5a: Agent safety cap
  if (request.maxPayment && BigInt(selected.amount) > BigInt(request.maxPayment)) {
    throw new WAIaaSError('POLICY_DENIED', {
      message: `Payment amount ${selected.amount} exceeds agent max ${request.maxPayment}`,
    });
  }

  // Step 6: Create DB transaction record
  const txId = generateId();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  const chain = mapCaipToChain(selected.network);
  const network = mapCaipToNetwork(selected.network);

  await deps.db.insert(transactions).values({
    id: txId,
    walletId,
    type: 'X402_PAYMENT',
    status: 'PENDING',
    amount: selected.amount,
    toAddress: selected.payTo,
    chain,
    network,
    sessionId: sessionId ?? null,
    metadata: JSON.stringify({
      x402Url: request.url,
      x402Scheme: selected.scheme,
      x402Network: selected.network,
      x402Asset: selected.asset,
      x402MaxTimeout: selected.maxTimeoutSeconds,
    }),
    createdAt: now,
  });

  // Step 7: Policy evaluation (SPENDING_LIMIT with TOCTOU reservation)
  const txParam = {
    type: 'X402_PAYMENT',
    amount: selected.amount,
    toAddress: selected.payTo,
    chain,
    network,
  };

  let evaluation;
  if (deps.policyEngine instanceof DatabasePolicyEngine && deps.sqlite) {
    evaluation = deps.policyEngine.evaluateAndReserve(walletId, txParam, txId);
  } else {
    evaluation = await deps.policyEngine.evaluate(walletId, txParam);
  }

  if (!evaluation.allowed) {
    await deps.db.update(transactions)
      .set({ status: 'CANCELLED', error: evaluation.reason ?? 'Policy denied' })
      .where(eq(transactions.id, txId));
    throw new WAIaaSError('POLICY_DENIED', {
      message: evaluation.reason ?? 'x402 payment denied by policy',
    });
  }

  // DELAY/APPROVAL tier -> immediate rejection (synchronous flow)
  if (evaluation.tier === 'DELAY' || evaluation.tier === 'APPROVAL') {
    await deps.db.update(transactions)
      .set({
        status: 'CANCELLED',
        tier: evaluation.tier,
        error: `x402 does not support ${evaluation.tier} tier`,
      })
      .where(eq(transactions.id, txId));
    throw new WAIaaSError('POLICY_DENIED', {
      message: `x402 payment requires ${evaluation.tier} tier. ` +
               'Adjust spending limits or use standard transactions for high-value payments.',
    });
  }

  // Update tier
  await deps.db.update(transactions)
    .set({ tier: evaluation.tier })
    .where(eq(transactions.id, txId));

  // Step 8: Sign payment (EIP-3009 authorization)
  let privateKey: Uint8Array | null = null;
  let paymentPayload: string;
  try {
    privateKey = await deps.keyStore.decryptPrivateKey(walletId, deps.masterPassword);
    paymentPayload = await signX402Payment(selected, privateKey, wallet);
  } catch (err) {
    await deps.db.update(transactions)
      .set({ status: 'FAILED', error: 'Payment signing failed' })
      .where(eq(transactions.id, txId));
    throw err;
  } finally {
    if (privateKey) deps.keyStore.releaseKey(privateKey);
  }

  // Step 9: Retry request with PAYMENT-SIGNATURE header
  const paidResponse = await safeFetch(request.url, {
    method: request.method ?? 'GET',
    headers: {
      ...request.headers,
      'PAYMENT-SIGNATURE': paymentPayload,
    },
    body: request.body,
  });

  // Step 10: Parse PAYMENT-RESPONSE header
  const paymentResponse = parsePaymentResponse(
    paidResponse.headers.get('PAYMENT-RESPONSE')
  );

  // Update DB: CONFIRMED
  const executedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
  await deps.db.update(transactions)
    .set({
      status: paymentResponse?.success ? 'CONFIRMED' : 'FAILED',
      txHash: paymentResponse?.transaction ?? null,
      executedAt,
    })
    .where(eq(transactions.id, txId));

  // Fire-and-forget notifications
  void deps.notificationService?.notify('TX_CONFIRMED', walletId, {
    txHash: paymentResponse?.transaction ?? '',
    amount: selected.amount,
    to: selected.payTo,
  }, { txId });

  return {
    status: paidResponse.status,
    headers: Object.fromEntries(paidResponse.headers.entries()),
    body: await paidResponse.text(),
    payment: {
      txId,
      amount: selected.amount,
      asset: selected.asset,
      network: selected.network,
      txHash: paymentResponse?.transaction ?? null,
    },
  };
}
```

### Q5: SSRF guard placement -- middleware level or handler level?

**Recommendation: Handler level, NOT middleware.**

Rationale:
1. SSRF validation is x402-specific. Other endpoints do not accept user-provided URLs.
2. Placing it in middleware would require URL extraction from the request body (not a header/path pattern), which is awkward.
3. The host-guard middleware pattern is for daemon access control (inbound), not outbound request validation.
4. The SSRF check needs to happen AFTER request validation but BEFORE the preflight fetch.

**Implementation:**

```typescript
// pipeline/x402-ssrf.ts

import { isIP } from 'node:net';
import dns from 'node:dns/promises';
import { WAIaaSError } from '@waiaas/core';

const BLOCKED_IP_RANGES = [
  /^127\./,                         // loopback
  /^10\./,                          // RFC1918 Class A
  /^172\.(1[6-9]|2\d|3[01])\./,    // RFC1918 Class B
  /^192\.168\./,                    // RFC1918 Class C
  /^0\./,                           // current network
  /^169\.254\./,                    // link-local (cloud metadata!)
  /^::1$/,                          // IPv6 loopback
  /^fc00:/i,                        // IPv6 unique local
  /^fe80:/i,                        // IPv6 link-local
];

export async function ssrfGuard(urlString: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
      message: 'Invalid URL',
    });
  }

  // Block non-HTTPS
  if (url.protocol !== 'https:') {
    throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
      message: 'x402 fetch requires HTTPS',
    });
  }

  // Block IP addresses as hostnames
  if (isIP(url.hostname)) {
    throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
      message: 'x402 fetch does not allow IP address URLs',
    });
  }

  // DNS resolution check -- block private IPs
  try {
    const addresses = await dns.resolve4(url.hostname);
    for (const addr of addresses) {
      if (BLOCKED_IP_RANGES.some(r => r.test(addr))) {
        throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
          message: `x402 fetch blocked: '${url.hostname}' resolves to private IP`,
        });
      }
    }
  } catch (err) {
    if (err instanceof WAIaaSError) throw err;
    throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
      message: `DNS resolution failed for '${url.hostname}'`,
    });
  }
}
```

### Q6: How to handle DELAY tier timeout within synchronous HTTP proxy flow?

**Recommendation: Reject DELAY and APPROVAL tiers immediately, same as sign-only.**

The x402 flow is **synchronous** -- the AI agent is waiting for the HTTP response from the external API. The agent expects a response within seconds (x402 typical flow is ~1.5-2 seconds end-to-end). Supporting DELAY/APPROVAL tiers would require:

1. Holding the HTTP connection open for minutes (impractical, connections time out)
2. Converting to async with polling (breaks the proxy pattern, adds complexity)
3. Pre-approval workflows (out of scope for initial implementation)

**Decision: x402 payments only support INSTANT and NOTIFY tiers.**

- **INSTANT**: Payment proceeds immediately, no notification.
- **NOTIFY**: Payment proceeds immediately, fire-and-forget notification sent to owner.
- **DELAY**: Immediate rejection with guidance to adjust spending limits.
- **APPROVAL**: Immediate rejection with same guidance.

This is exactly the pattern established by `sign-only.ts` (lines 269-281), which also rejects DELAY/APPROVAL because the flow is synchronous.

### Q7: DB schema changes needed

**Recommendation: No new tables. Minimal changes.**

| Change | Location | Description |
|--------|----------|-------------|
| Add `'X402_PAYMENT'` to TRANSACTION_TYPES | `@waiaas/core/enums/transaction.ts` | Enables DB storage + CHECK constraint |
| Add x402 error codes | `@waiaas/core/errors/error-codes.ts` | X402_FETCH_FAILED, X402_DOMAIN_NOT_ALLOWED |
| DB migration v12 | `daemon/infrastructure/database/migrate.ts` | Update CHECK constraint on transactions.type |

**No new table needed** because:
- The existing `transactions` table has all required columns (type, amount, toAddress, chain, network, metadata, txHash, status, tier)
- The `metadata` TEXT column stores x402-specific data as JSON (URL, scheme, asset, settlement info)
- SPENDING_LIMIT reservation uses the existing `reserved_amount` column via evaluateAndReserve()
- Transaction history (GET /v1/transactions) already includes all types

**Migration v12 approach:**

SQLite doesn't support ALTER TABLE to modify CHECK constraints directly. However, the CHECK constraint was baked at CREATE TABLE time. Options:

1. **Table recreation** (safest, most complex) -- CREATE new table, copy data, drop old, rename
2. **Accept SSoT-only enforcement** -- The TRANSACTION_TYPES array update ensures all new inserts use valid types via Zod validation; the CHECK constraint in existing DBs won't enforce the new value but won't block it either (SQLite CHECK is not enforced on pre-existing rows, and new rows go through Drizzle which doesn't trigger CHECK on text columns with non-standard values in practice)
3. **Pragmatic approach** -- SQLite actually does enforce CHECK constraints on INSERT. The migration must update the constraint.

**Recommended: Table recreation migration** (same pattern as v6b environment model migration):

```sql
-- v12: Add X402_PAYMENT to transactions.type CHECK constraint
CREATE TABLE transactions_v12 (...same columns, updated CHECK...);
INSERT INTO transactions_v12 SELECT * FROM transactions;
DROP TABLE transactions;
ALTER TABLE transactions_v12 RENAME TO transactions;
-- Recreate indexes
UPDATE schema_version SET version = 12;
```

### Q8: How does the x402 fetch endpoint differ from normal transaction endpoints architecturally?

**Key architectural differences:**

| Aspect | POST /v1/transactions/send | POST /v1/x402/fetch |
|--------|---------------------------|---------------------|
| **Response model** | Async (201 + txId, fire-and-forget stages 2-6) | Sync (200 + proxied response body) |
| **Blockchain interaction** | WAIaaS builds + signs + submits tx via IChainAdapter | WAIaaS only signs EIP-3009 auth; facilitator settles |
| **Pipeline** | 6-stage pipeline (stages.ts) | Standalone x402 pipeline (x402-fetch.ts) |
| **Transaction type** | TRANSFER/TOKEN_TRANSFER/CONTRACT_CALL/APPROVE/BATCH | X402_PAYMENT |
| **External HTTP calls** | None (only RPC to blockchain) | Two outbound calls (preflight + payment retry) to user-specified URL |
| **SSRF risk** | None (WAIaaS controls all URLs) | High (user provides target URL) -- requires SSRF guard |
| **Auth** | sessionAuth | sessionAuth |
| **Chain adapter** | Required (build/sign/submit) | NOT required (signing uses @x402/evm, not IChainAdapter) |
| **Tier support** | All 4 tiers (INSTANT/NOTIFY/DELAY/APPROVAL) | INSTANT + NOTIFY only |
| **Policy evaluation** | evaluateAndReserve (SPENDING_LIMIT + all other policies) | evaluateAndReserve (SPENDING_LIMIT) + domain allowlist |
| **Key management** | decrypt -> sign tx -> release | decrypt -> sign EIP-3009 -> release |
| **Error recovery** | CONC-01 retry (TRANSIENT/STALE ChainError) | No retry (HTTP errors from target propagated) |

The x402 endpoint is architecturally more similar to an **Action Provider resolve** than a transaction send:
- It makes outbound HTTP requests to external services
- It has SSRF concerns (like any server-side proxy)
- The "payment" is a side effect of accessing the resource, not the primary purpose

---

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `x402-fetch.ts` (new pipeline module) | Orchestrates the 10-step x402 fetch flow | PolicyEngine, KeyStore, SettingsService |
| `x402-schemas.ts` (new Zod schemas) | X402FetchRequest/Response validation, PaymentRequired parsing | Route handler |
| `x402-ssrf.ts` (new utility) | URL validation, DNS resolution, private IP blocking | x402-fetch.ts |
| `x402-signer.ts` (new module) | EIP-3009/SVM payment signing using wallet key | x402-fetch.ts, KeyStore |
| `routes/x402.ts` (new route) | POST /v1/x402/fetch endpoint | x402-fetch.ts, sessionAuth |
| `DatabasePolicyEngine` (existing) | evaluateAndReserve for SPENDING_LIMIT | x402-fetch.ts |
| `SettingsService` (existing) | x402.allowed_domains, x402.facilitator_url, x402.enabled | x402-fetch.ts |
| `transactions` table (existing) | Audit trail for X402_PAYMENT records | x402-fetch.ts |
| `NotificationService` (existing) | Fire-and-forget payment notifications | x402-fetch.ts |

### New files (5-6):

```
packages/daemon/src/
  pipeline/
    x402-fetch.ts           # 10-step x402 pipeline (main module)
    x402-signer.ts          # Payment signing (EIP-3009 for EVM, SVM equivalent)
    x402-ssrf.ts            # SSRF guard utility
  api/routes/
    x402.ts                 # POST /v1/x402/fetch route + OpenAPI
    x402-schemas.ts         # Zod schemas for x402 request/response
packages/core/src/
  enums/transaction.ts      # Add 'X402_PAYMENT' to TRANSACTION_TYPES (modify)
```

### Modified files (4-5):

```
packages/core/src/enums/transaction.ts     # Add X402_PAYMENT
packages/core/src/errors/error-codes.ts    # Add X402 domain errors
packages/daemon/src/api/routes/index.ts    # Export x402Routes
packages/daemon/src/api/index.ts           # Mount x402 routes
packages/daemon/src/infrastructure/database/migrate.ts  # v12 migration
```

---

## Data Flow

```
AI Agent (via SDK/MCP)
    |
    | POST /v1/x402/fetch { url, method?, headers?, body?, maxPayment? }
    | Authorization: Bearer wai_sess_<token>
    v
[WAIaaS Daemon - sessionAuth middleware]
    |
    v
[x402 Route Handler]
    |
    | 1. Validate request schema (Zod)
    | 2. SSRF guard (DNS resolve, private IP block, HTTPS only)
    | 3. Check x402.allowed_domains (SettingsService, default deny)
    |
    v
[Preflight Fetch: GET https://api.example.com/paid-endpoint]
    |
    | HTTP 402 + PAYMENT-REQUIRED header
    | (if not 402: return response directly, no payment)
    v
[Parse PaymentRequired, select compatible scheme/network]
    |
    | Optional: check maxPayment agent safety cap
    v
[Create transactions row (type=X402_PAYMENT, status=PENDING)]
    |
    v
[PolicyEngine.evaluateAndReserve(walletId, txParam, txId)]
    |--- denied? -> CANCELLED, throw POLICY_DENIED
    |--- DELAY/APPROVAL? -> CANCELLED, throw POLICY_DENIED (sync flow)
    |--- INSTANT/NOTIFY? -> proceed
    v
[Sign payment (EIP-3009 transferWithAuthorization)]
    |
    | KeyStore.decryptPrivateKey -> @x402/evm sign -> releaseKey
    v
[Retry Fetch with PAYMENT-SIGNATURE header]
    |
    | HTTP 200 + PAYMENT-RESPONSE header
    v
[Parse PAYMENT-RESPONSE, extract settlement txHash]
    |
    v
[Update transactions: status=CONFIRMED, txHash from settlement]
    |
    v
[Return proxied response to AI Agent]
    | {
    |   status: 200,
    |   headers: { ... },
    |   body: "...",
    |   payment: { txId, amount, asset, network, txHash }
    | }
```

---

## Patterns to Follow

### Pattern 1: Standalone Pipeline Module (like sign-only.ts)

**What:** A self-contained async function that orchestrates the full x402 flow, imported by the route handler.
**When:** For flows that don't fit the 6-stage pipeline but need policy evaluation.
**Why:** sign-only.ts (line 191) proves this pattern works well. It reuses evaluateAndReserve() without coupling to the pipeline stages.

```typescript
// Same signature pattern as sign-only.ts
export async function executeX402Fetch(
  deps: X402FetchDeps,
  walletId: string,
  wallet: WalletInfo,
  request: X402FetchRequest,
  sessionId?: string,
): Promise<X402FetchResult> {
  // 10-step flow...
}
```

### Pattern 2: Default Deny for New Domain (like CONTRACT_WHITELIST)

**What:** x402 is denied by default unless x402.allowed_domains is configured in SettingsService.
**When:** For any new capability that involves outbound requests to user-specified URLs.
**Why:** Consistent with WAIaaS security posture (CLAUDE.md: "default deny"). Prevents accidental fund drainage to unknown APIs.

### Pattern 3: TOCTOU-safe Reservation (existing evaluateAndReserve)

**What:** Use evaluateAndReserve() with BEGIN IMMEDIATE for x402 payments.
**When:** Any payment flow where SPENDING_LIMIT applies.
**Why:** Two concurrent x402 fetch requests could both pass under the same spending limit without reservation. The existing reserved_amount mechanism prevents this.

### Pattern 4: Key Management (decrypt -> use -> release in finally)

**What:** Always release private key material in a finally block.
**When:** Any flow that accesses wallet private keys for signing.
**Why:** Memory safety. Pattern is established in sign-only.ts (line 290-310) and stage5Execute.

```typescript
let privateKey: Uint8Array | null = null;
try {
  privateKey = await deps.keyStore.decryptPrivateKey(walletId, deps.masterPassword);
  paymentPayload = await signX402Payment(selected, privateKey, wallet);
} finally {
  if (privateKey) deps.keyStore.releaseKey(privateKey);
}
```

### Pattern 5: Fire-and-forget Notifications (existing pattern)

**What:** Send payment notifications without blocking the x402 flow.
**When:** After successful payment or policy violation.
**Why:** The agent is waiting synchronously; notification delivery should not delay the response.

```typescript
// Never blocks the pipeline
void deps.notificationService?.notify('TX_CONFIRMED', walletId, { ... }, { txId });
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Extending the 6-stage pipeline for x402

**What:** Adding x402 as a 7th stage or special-casing it within existing stages.
**Why bad:** The 6-stage pipeline assumes outbound blockchain transactions. x402 is HTTP-native with facilitator settlement. Mixing them creates unclear responsibilities, makes testing harder, and adds conditional branches to every stage. Stage 5 (build -> simulate -> sign -> submit) is entirely wrong for x402.
**Instead:** Separate pipeline module with shared infrastructure (PolicyEngine, KeyStore, DB).

### Anti-Pattern 2: Proxying arbitrary URLs without SSRF protection

**What:** Allowing the agent to specify any URL without domain/IP validation.
**Why bad:** SSRF allows the agent to scan the internal network, access cloud metadata (169.254.169.254), or probe localhost services through the daemon. This is especially dangerous for a self-hosted daemon.
**Instead:** HTTPS-only, no IP addresses as hostnames, DNS resolution with private IP blocking, domain allowlist via SettingsService.

### Anti-Pattern 3: Holding HTTP connections open for DELAY tier

**What:** Waiting for a delay timer to expire while the agent's HTTP request is pending.
**Why bad:** HTTP connections have timeouts (typically 30-60s). DELAY can be 15+ minutes. The connection will drop, the agent will retry, creating duplicate payment attempts.
**Instead:** Reject DELAY/APPROVAL immediately. Only INSTANT/NOTIFY supported.

### Anti-Pattern 4: Using IChainAdapter for x402 signing

**What:** Routing x402 payment signing through SolanaAdapter or EvmAdapter.
**Why bad:** IChainAdapter (22 methods) is for building/signing/submitting on-chain transactions. x402 payment signing is EIP-3009 `transferWithAuthorization` -- an off-chain EIP-712 typed data signature. The adapter has no method for this. Adding one would pollute the chain adapter interface.
**Instead:** Use @x402/evm (or viem's signTypedData directly) for EVM, @x402/svm for Solana. Create a dedicated x402-signer.ts module.

### Anti-Pattern 5: Storing x402 payment details in a separate table

**What:** Creating a new `x402_payments` table.
**Why bad:** Fragments the audit trail. SPENDING_LIMIT evaluation already queries the transactions table for reserved amounts. A separate table would require modifying the reservation query in evaluateAndReserve() to SUM across two tables.
**Instead:** Use `transactions` table with `type='X402_PAYMENT'` and `metadata` JSON column for x402-specific fields.

### Anti-Pattern 6: Using wrapFetchWithPayment() directly from @x402/fetch

**What:** Using the high-level wrapped fetch that handles the full 402 flow automatically.
**Why bad:** WAIaaS needs to intercept BETWEEN the preflight and payment retry for:
  - Policy evaluation (evaluateAndReserve)
  - Key management (decrypt/release pattern)
  - DB record creation
  - SSRF validation
  - Domain allowlist check
The wrapped fetch is a black box that provides no insertion points.
**Instead:** Use the lower-level x402Client API (createPaymentPayload) with manual control of the preflight and retry steps.

---

## x402 Library Integration Decision

**Use `@x402/evm` and optionally `@x402/svm` for payment signing. Do NOT use `@x402/fetch` wrapper.**

WAIaaS needs fine-grained control over the payment flow:

```typescript
import { x402Client } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";

// In x402-signer.ts:
export async function signX402Payment(
  requirement: PaymentRequirement,
  privateKey: Uint8Array,
  wallet: WalletInfo,
): Promise<string> {
  // Create a viem account from the raw private key
  const account = privateKeyToAccount(`0x${Buffer.from(privateKey).toString('hex')}`);

  // Create x402 client with this account as signer
  const client = new x402Client();
  registerExactEvmScheme(client, { signer: account });

  // Use client to create payment payload for the selected requirement
  const paymentPayload = await client.createPaymentPayload(
    { x402Version: 2, accepts: [requirement], resource: { url: requirement.resource } },
    requirement,
  );

  // Base64 encode for PAYMENT-SIGNATURE header
  return btoa(JSON.stringify(paymentPayload));
}
```

This approach:
- Leverages @x402/evm for correct EIP-3009 signing (no need to implement typed data signing from scratch)
- Keeps WAIaaS in control of key management (decrypt/release lifecycle)
- Allows policy evaluation between preflight and payment
- Supports future SVM extension by adding @x402/svm registration

---

## CAIP-2 to WAIaaS Chain/Network Mapping

x402 uses CAIP-2 network identifiers (e.g., `eip155:8453` for Base). WAIaaS uses `ChainType` + `NetworkType` enums. A mapping utility is needed:

```typescript
// pipeline/x402-fetch.ts (or x402-schemas.ts)

const CAIP_TO_WAIAAS: Record<string, { chain: ChainType; network: NetworkType }> = {
  'eip155:1':     { chain: 'ethereum', network: 'ethereum-mainnet' },
  'eip155:11155111': { chain: 'ethereum', network: 'ethereum-sepolia' },
  'eip155:8453':  { chain: 'ethereum', network: 'base-mainnet' },
  'eip155:84532': { chain: 'ethereum', network: 'base-sepolia' },
  'eip155:137':   { chain: 'ethereum', network: 'polygon-mainnet' },
  'eip155:80002': { chain: 'ethereum', network: 'polygon-amoy' },
  'eip155:42161': { chain: 'ethereum', network: 'arbitrum-mainnet' },
  'eip155:421614':{ chain: 'ethereum', network: 'arbitrum-sepolia' },
  'eip155:10':    { chain: 'ethereum', network: 'optimism-mainnet' },
  'eip155:11155420': { chain: 'ethereum', network: 'optimism-sepolia' },
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': { chain: 'solana', network: 'mainnet' },
  'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1': { chain: 'solana', network: 'devnet' },
};

export function mapCaipToChain(caipNetwork: string): ChainType {
  const mapping = CAIP_TO_WAIAAS[caipNetwork];
  if (!mapping) throw new WAIaaSError('CHAIN_NOT_SUPPORTED', {
    message: `Unsupported x402 network: ${caipNetwork}`,
  });
  return mapping.chain;
}

export function mapCaipToNetwork(caipNetwork: string): NetworkType {
  const mapping = CAIP_TO_WAIAAS[caipNetwork];
  if (!mapping) throw new WAIaaSError('CHAIN_NOT_SUPPORTED', {
    message: `Unsupported x402 network: ${caipNetwork}`,
  });
  return mapping.network;
}
```

---

## Scalability Considerations

| Concern | At Current Scale | At 10K requests/day | Mitigation |
|---------|-----------------|---------------------|------------|
| Preflight latency | ~200ms per x402 fetch | Acceptable | Optional: cache 402 responses for known endpoints (TTL 60s) |
| Total flow latency | ~1.5-2s (preflight + sign + retry + settlement) | Acceptable | No optimization needed at self-hosted scale |
| Concurrent requests | evaluateAndReserve serializes via BEGIN IMMEDIATE | Minor contention | Acceptable for self-hosted daemon |
| SSRF DNS resolution | 1 DNS lookup per request | Node.js DNS cache helps | Built-in dns.resolve caching |
| Payment signing | One key decrypt per payment | Milliseconds | No concern |
| DB transaction records | 1 row per x402 payment | Thousands | Existing pagination handles this |

---

## Sources

- [x402 Protocol - Official Site](https://www.x402.org/) -- HIGH confidence
- [x402 GitHub Repository](https://github.com/coinbase/x402) -- HIGH confidence (spec, SDK, examples)
- [x402 Coinbase Developer Docs](https://docs.cdp.coinbase.com/x402/welcome) -- HIGH confidence
- [x402 V2 Launch Announcement](https://www.x402.org/writing/x402-v2-launch) -- MEDIUM confidence
- [x402 Payment Flow Details (Avalanche Build)](https://build.avax.network/academy/blockchain/x402-payment-infrastructure/03-technical-architecture/01-payment-flow) -- MEDIUM confidence (verified against official spec)
- [x402 npm package](https://www.npmjs.com/package/x402) -- HIGH confidence
- [@x402/fetch npm package](https://www.npmjs.com/package/@x402/fetch) -- HIGH confidence
- [@x402/evm npm package](https://www.npmjs.com/package/@x402/evm) -- HIGH confidence
- [OWASP SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html) -- HIGH confidence
- [x402 InfoQ Major Upgrade (2026-01)](https://www.infoq.com/news/2026/01/x402-agentic-http-payments/) -- MEDIUM confidence
- WAIaaS codebase direct analysis: pipeline.ts, sign-only.ts, stages.ts, database-policy-engine.ts, schema.ts, error-codes.ts, transaction.ts -- HIGH confidence
