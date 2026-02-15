# Domain Pitfalls: x402 Client Integration

**Domain:** x402 HTTP-native payment protocol client for WAIaaS
**Researched:** 2026-02-15

## Critical Pitfalls

Mistakes that cause security vulnerabilities or fund loss.

### Pitfall 1: SSRF via Outbound HTTP Proxy

**What goes wrong:** The POST /v1/x402/fetch endpoint accepts a user-provided URL and makes outbound HTTP requests from the daemon. Without SSRF protection, an agent (or attacker with a session token) can:
- Scan the internal network (10.x, 192.168.x, 172.16-31.x)
- Access cloud metadata services (169.254.169.254 -- AWS/GCP instance credentials)
- Probe localhost services (other ports on the daemon host)
- Use DNS rebinding to bypass hostname checks

**Why it happens:** x402 is the first WAIaaS feature where the daemon makes outbound HTTP requests to user-specified URLs. All previous outbound calls (RPC, oracle, notification channels) target admin-configured endpoints only.

**Consequences:** Information disclosure, credential theft from cloud metadata, internal service exploitation. On a self-hosted daemon, the risk is lower than on shared infrastructure but still present.

**Prevention:**
1. HTTPS-only (no HTTP, no other protocols like file://, ftp://)
2. Block IP addresses as hostnames (require domain names)
3. DNS resolution check: resolve hostname, verify resolved IPs are not in private ranges
4. Domain allowlist via SettingsService (default deny -- no domains = x402 disabled)
5. Response body size limit (prevent memory exhaustion from large responses)

**Detection:** Audit log entries for rejected SSRF attempts. Monitor for unusual target domains.

### Pitfall 2: Double Payment on Concurrent Requests

**What goes wrong:** Two concurrent x402 fetch requests from the same wallet both pass SPENDING_LIMIT evaluation, both sign payments, both pay the facilitator. The wallet loses twice the expected amount.

**Why it happens:** Without TOCTOU protection, two requests can evaluate against the same spending limit balance simultaneously. The existing `evaluateAndReserve()` with BEGIN IMMEDIATE prevents this for normal transactions, but only if x402 payments also use it.

**Consequences:** Fund loss. The agent pays twice for what might be the same resource.

**Prevention:**
1. Use `evaluateAndReserve()` for all x402 payments (creates reserved_amount on transaction row)
2. The BEGIN IMMEDIATE transaction serializes concurrent policy evaluations
3. Transaction record (type=X402_PAYMENT) is created BEFORE policy evaluation
4. On failure/cancellation, reserved_amount is released (via releaseReservation)

**Detection:** Monitor for multiple X402_PAYMENT transactions to the same URL in short succession.

### Pitfall 3: Private Key Leak if Not Released After Signing

**What goes wrong:** The wallet's private key is decrypted for EIP-3009 signing but never released (zeroed in memory) due to an error in the signing or HTTP retry step.

**Why it happens:** If the `finally` block is missing or if an error occurs between decrypt and the finally block, the key remains in memory indefinitely.

**Consequences:** Key material in memory is vulnerable to memory dumps, process crashes, or side-channel attacks.

**Prevention:**
```typescript
let privateKey: Uint8Array | null = null;
try {
  privateKey = await deps.keyStore.decryptPrivateKey(walletId, deps.masterPassword);
  // ... use key ...
} finally {
  if (privateKey) deps.keyStore.releaseKey(privateKey);
}
```
This pattern is already established in sign-only.ts (line 290-310) and stage5Execute. Apply it identically in x402-signer.ts.

**Detection:** Code review. Unit test that verifies releaseKey is called even on error paths.

### Pitfall 4: Unbounded Response Body Size

**What goes wrong:** The daemon proxies the response body from the paid API back to the agent. If the target returns a very large response (GB-scale), the daemon runs out of memory.

**Why it happens:** Node.js fetch() with `await response.text()` loads the entire body into memory.

**Consequences:** OOM crash of the daemon, affecting all wallets.

**Prevention:**
1. Set a response body size limit (e.g., 10MB) via Content-Length header check before reading
2. Use streaming with size accounting if large responses are needed
3. Reject responses exceeding the limit with a clear error

```typescript
const contentLength = paidResponse.headers.get('content-length');
if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) {
  throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
    message: 'x402 response exceeds 10MB limit',
  });
}
```

**Detection:** Monitor daemon memory usage. Log response sizes.

## Moderate Pitfalls

### Pitfall 5: x402 Header Name Confusion (v1 vs v2)

**What goes wrong:** Implementing with v1 headers (`X-PAYMENT`, `X-PAYMENT-RESPONSE`) when the target server expects v2 headers (`PAYMENT-SIGNATURE`, `PAYMENT-REQUIRED`, `PAYMENT-RESPONSE`), or vice versa.

**Why it happens:** x402 v2 (launched January 2026) changed the header names from deprecated X-* prefix to standard names. Some servers may still use v1.

**Prevention:** Use @x402/evm SDK which handles both v1 and v2 headers automatically. If implementing manually, support both: send v2 headers, fall back to v1 if server responds with v1 format.

### Pitfall 6: CAIP-2 Network ID Mismatch

**What goes wrong:** The x402 server's PaymentRequirements specify a CAIP-2 network (e.g., `eip155:8453` for Base) that WAIaaS doesn't support or maps incorrectly.

**Why it happens:** CAIP-2 uses chain IDs (numeric for EVM, hash-based for Solana) while WAIaaS uses named networks (e.g., 'base-mainnet'). Incomplete mapping leads to failures.

**Prevention:**
1. Comprehensive CAIP-2 -> WAIaaS mapping table covering all supported networks
2. Clear error message when no mapping exists: "x402 network eip155:42170 not supported"
3. Unit tests for every CAIP-2 mapping entry
4. The selectPaymentRequirement() function should filter to only WAIaaS-supported networks

### Pitfall 7: Stale PaymentRequired (maxTimeoutSeconds)

**What goes wrong:** The daemon parses the 402 response, evaluates policy (which might take time due to BEGIN IMMEDIATE contention), then tries to sign and retry. If the total time exceeds `maxTimeoutSeconds` from the PaymentRequired, the server rejects the payment.

**Why it happens:** The x402 protocol has a built-in timeout (typically 60 seconds). Policy evaluation is usually fast but can be delayed by contention.

**Prevention:**
1. Check remaining time before signing: `if (Date.now() > preflightTime + maxTimeoutSeconds * 1000) { refetch 402 }`
2. Log a warning if policy evaluation takes >5 seconds
3. The typical WAIaaS flow should complete in <2 seconds total

### Pitfall 8: Payment Succeeds but Resource Fetch Fails

**What goes wrong:** The signed payment is sent to the server, the facilitator settles it on-chain (funds deducted from wallet), but the server returns an error (5xx, network timeout). The wallet paid but didn't get the resource.

**Why it happens:** The payment settlement is atomic (on-chain) but the resource delivery is not. Network failures between the facilitator and the resource server can cause this.

**Prevention:**
1. Record the payment as CONFIRMED in DB regardless of response status
2. Return the error status to the agent with the payment info so it can retry with awareness
3. Log the txHash so the payment can be verified on-chain
4. The agent should implement retry logic for the resource fetch (but NOT re-pay; check if previous payment was settled)

**Detection:** Transactions with status=CONFIRMED but the returned response has status >= 500.

### Pitfall 9: Environment Mismatch (testnet wallet paying mainnet API)

**What goes wrong:** A testnet wallet tries to pay a mainnet API (or vice versa). The payment fails or succeeds with valueless tokens.

**Why it happens:** WAIaaS wallets have an `environment` (testnet/mainnet). The x402 PaymentRequirements specify a network. If the wallet's environment doesn't match the payment network's environment, the transaction will fail.

**Prevention:**
1. The selectPaymentRequirement() function must filter by wallet environment
2. Map CAIP-2 networks to environments: eip155:8453 (Base) = mainnet, eip155:84532 (Base Sepolia) = testnet
3. Reject with clear error: "Wallet environment (testnet) does not match payment network (eip155:8453 = mainnet)"

## Minor Pitfalls

### Pitfall 10: Missing PAYMENT-RESPONSE Header

**What goes wrong:** The target server returns 200 but without the PAYMENT-RESPONSE header. The daemon doesn't know the settlement txHash.

**Why it happens:** Some x402 implementations may not include the response header, or it may be stripped by a CDN/proxy.

**Prevention:** Treat missing PAYMENT-RESPONSE as a warning, not an error. Record the transaction as CONFIRMED (payment was signed and sent) but with txHash=null. The agent got the resource.

### Pitfall 11: Domain Allowlist Too Permissive

**What goes wrong:** Admin configures `["example.com"]` but the attacker registers `evil.example.com` (which is a subdomain match).

**Why it happens:** Subdomain matching (`targetDomain.endsWith('.' + d)`) allows all subdomains.

**Prevention:**
1. Document that adding a domain allows ALL subdomains
2. Support exact match mode: `{"domain": "api.example.com", "subdomains": false}`
3. For MVP: exact domain match only (no subdomain wildcards)

### Pitfall 12: Transaction Type CHECK Constraint Migration

**What goes wrong:** After adding 'X402_PAYMENT' to TRANSACTION_TYPES array but before running the migration, INSERT into transactions table fails with CHECK constraint violation on existing databases.

**Why it happens:** SQLite CHECK constraints are baked at CREATE TABLE time. Adding a new value to the SSoT array doesn't update existing database constraints.

**Prevention:**
1. DB migration v12 must run before any x402 payments are attempted
2. The migration recreates the transactions table with the updated CHECK constraint
3. Follow the same pattern as v6b migration (CREATE new -> INSERT SELECT -> DROP old -> RENAME)
4. Test the migration path in migration-chain.test.ts

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| SSRF guard implementation | DNS rebinding attack bypass | Resolve DNS only once, use resolved IP for fetch (not hostname) |
| @x402/evm integration | API surface changes between x402 SDK versions | Pin version, test with mock facilitator |
| Policy evaluation | X402_PAYMENT type not recognized by evaluateSpendingLimit | Ensure SPENDING_LIMIT evaluates all types equally (amount-based, not type-based) |
| DB migration v12 | CHECK constraint recreation on large transaction tables | Test migration with fixture data, measure performance |
| MCP tool integration | Tool name conflicts with existing waiaas_* tools | Use `waiaas_x402_fetch` naming pattern |
| Admin UI settings | x402.allowed_domains JSON parsing errors | Validate JSON array format in SettingsService setter |
| EVM-only initial support | Agents on Solana wallets can't use x402 | Clear error message, document SVM as future phase |

## Sources

- [OWASP SSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html) -- HIGH confidence
- [x402 Protocol Specification](https://github.com/coinbase/x402) -- HIGH confidence
- [x402 V2 Header Changes](https://www.x402.org/writing/x402-v2-launch) -- MEDIUM confidence
- WAIaaS codebase: sign-only.ts key management pattern, evaluateAndReserve TOCTOU, migrate.ts patterns -- HIGH confidence
