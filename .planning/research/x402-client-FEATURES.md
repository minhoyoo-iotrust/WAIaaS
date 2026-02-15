# Feature Landscape: x402 Client Integration

**Domain:** x402 HTTP-native payment protocol client for AI agents
**Researched:** 2026-02-15

## Table Stakes

Features that must exist for x402 support to be usable.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| POST /v1/x402/fetch endpoint | Core API for agents to fetch paid resources | High | 10-step pipeline, synchronous response |
| SSRF guard (URL validation) | Security requirement for any server-side proxy | Medium | DNS resolution, private IP blocking, HTTPS-only |
| Domain allowlist (default deny) | WAIaaS security posture requires explicit opt-in | Low | SettingsService key, JSON array of domains |
| Policy evaluation (SPENDING_LIMIT) | Prevent uncontrolled spending by agents | Medium | Reuse evaluateAndReserve() with TOCTOU prevention |
| EIP-3009 payment signing | x402 protocol requires signed payment authorization | Medium | @x402/evm handles signing logic |
| Transaction audit trail | Track all x402 payments in DB | Low | Reuse transactions table with type=X402_PAYMENT |
| 402 response parsing | Parse PAYMENT-REQUIRED header per x402 spec | Low | Base64 decode + JSON parse |
| Payment settlement tracking | Record facilitator settlement txHash | Low | PAYMENT-RESPONSE header parsing |
| Agent safety cap (maxPayment) | Agents need to limit per-request spending | Low | Simple BigInt comparison before policy eval |
| CAIP-2 network mapping | Map x402 network IDs to WAIaaS chain/network | Low | Static mapping table |

## Differentiators

Features that add value beyond basic x402 support.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Free endpoint passthrough | If target doesn't return 402, proxy response without payment | Low | Useful for APIs with mixed free/paid endpoints |
| USD spending limit integration | x402 payments respect USD-based spending limits via IPriceOracle | Medium | Leverages existing v1.5 oracle infrastructure |
| MCP tool for x402 fetch | AI agents can use x402 via MCP, not just REST API | Medium | New waiaas_x402_fetch tool |
| SDK helper method | TypeScript/Python SDK method: wallet.x402Fetch(url, opts) | Medium | Wraps REST API call |
| x402 payment history filtering | GET /v1/transactions?type=X402_PAYMENT | Low | Existing list endpoint already filters by type |
| Notification on x402 payment | Fire-and-forget notification to owner when agent pays | Low | Existing notification infrastructure |
| Admin x402 settings panel | Configure allowed domains, enable/disable x402 via Admin UI | Medium | New SettingsService section |
| x402 payment analytics | Admin view of x402 spending per wallet/domain | Medium | Query transactions where type=X402_PAYMENT |

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| x402 server (seller) mode | WAIaaS is a wallet daemon, not an API monetization platform | Focus on client (buyer) role only |
| Facilitator hosting | Coinbase provides free facilitator; no need to self-host | Use Coinbase facilitator (or allow configurable facilitator URL) |
| Automatic domain discovery | x402 v2 has API discovery extensions, but adds attack surface | Require explicit domain allowlist in settings |
| DELAY tier with polling | Complex async flow, connection timeouts, duplicate payment risk | Reject DELAY/APPROVAL immediately; only support INSTANT/NOTIFY |
| Multi-wallet x402 payments | Selecting which wallet pays from the x402 endpoint itself | sessionAuth determines wallet; use the session's wallet |
| Fiat payment scheme support | x402 v2 supports fiat (ACH, SEPA) but requires banking integration | Only support crypto schemes (exact + stablecoins) |
| Response body caching | Caching paid responses to avoid re-payment | Risk of serving stale data; payment is per-request by design |
| Batch x402 requests | Fetching multiple paid URLs in one API call | Single URL per request keeps flow simple; agents can batch at their level |

## Feature Dependencies

```
SSRF Guard -> POST /v1/x402/fetch (SSRF must exist before endpoint is usable)
Domain Allowlist -> POST /v1/x402/fetch (allowlist checked before any HTTP request)
EIP-3009 Signing -> POST /v1/x402/fetch (signing is step 8 of 10)
CAIP-2 Mapping -> Policy Evaluation (chain/network needed for evaluateAndReserve)
X402_PAYMENT Type -> Transaction Audit Trail (DB needs to accept the new type)
DB Migration v12 -> X402_PAYMENT Type (CHECK constraint must allow new type)

Transaction Audit Trail -> Payment History Filtering (history needs records to filter)
POST /v1/x402/fetch -> MCP Tool (MCP wraps the REST endpoint)
POST /v1/x402/fetch -> SDK Helper (SDK wraps the REST endpoint)
SettingsService x402 Keys -> Admin Settings Panel (panel reads/writes settings)
```

## MVP Recommendation

Prioritize for initial milestone:

1. **SSRF guard + domain allowlist** -- Security foundation, must be first
2. **POST /v1/x402/fetch endpoint** -- Core functionality (10-step pipeline)
3. **EIP-3009 signing via @x402/evm** -- Payment capability
4. **Transaction audit trail (X402_PAYMENT)** -- DB records + SPENDING_LIMIT integration
5. **Agent safety cap (maxPayment)** -- Simple but critical guardrail
6. **DB migration v12** -- CHECK constraint update

Defer to follow-up milestone:
- **MCP tool**: Can be added after REST endpoint stabilizes
- **SDK integration**: Follows REST API
- **Admin analytics**: Nice-to-have, not blocking
- **SVM (Solana) x402 support**: EVM-first, SVM via @x402/svm later
- **USD spending limit for x402**: Existing SPENDING_LIMIT in raw units works for stablecoin payments (USDC amount is directly meaningful)

## Sources

- [x402 Protocol Spec](https://github.com/coinbase/x402) -- HIGH confidence
- [x402 Quickstart for Buyers](https://docs.cdp.coinbase.com/x402/quickstart-for-buyers) -- HIGH confidence
- [x402 V2 Features](https://www.x402.org/writing/x402-v2-launch) -- MEDIUM confidence
- WAIaaS codebase analysis (transactions.ts, sign-only.ts, database-policy-engine.ts) -- HIGH confidence
