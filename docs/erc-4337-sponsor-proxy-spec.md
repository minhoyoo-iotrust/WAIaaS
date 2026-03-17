---
title: "ERC-4337 Sponsor Proxy Server Specification"
description: "API spec for a gas sponsorship proxy server. WAIaaS agents use this as a custom AA provider for sponsored transactions."
date: "2026-02-15"
section: "docs"
slug: "erc-4337-sponsor-proxy-spec"
category: "Technical"
---
# ERC-4337 Sponsor Proxy Server — API Specification

> API specification for a proxy server operated by a gas sponsorship service.
> WAIaaS agents register this proxy as a `custom` provider to send sponsored transactions.

## 1. Overview

### Purpose

- Allow sponsorship service operators to sponsor gas fees without exposing their Pimlico/Alchemy API keys to agents
- Agents only need a proxy URL and a scope token to send sponsored transactions

### Architecture

```
[WAIaaS Agent] --scope token--> [Sponsor Proxy] --API Key+PolicyId--> [Pimlico/Alchemy]
```

### WAIaaS Integration

```json
{
  "aaProvider": "custom",
  "aaBundlerUrl": "https://{proxy-host}/rpc/{chainId}?token={scope_token}",
  "aaPaymasterUrl": "https://{proxy-host}/rpc/{chainId}?token={scope_token}"
}
```

`bundlerUrl` and `paymasterUrl` may point to the same endpoint or be separated.

---

## 2. Authentication: Scope Token

A restricted-permission token issued to agents. The proxy manages issuance and validation internally.

### Recommended Token-Bound Fields

| Field | Description | Example |
|-------|-------------|---------|
| `provider` | Backend provider | `pimlico`, `alchemy` |
| `apiKey` | Provider API key | `pim_xxx...` |
| `policyId` | Provider policy ID | `sp_xxx` (Pimlico), `pol_xxx` (Alchemy) |
| `allowedChains` | Allowed chain list | `["sepolia", "base-sepolia"]` |
| `maxSpendWei` | Total sponsorship cap (wei) | `"1000000000000000000"` |
| `expiresAt` | Expiration timestamp (Unix) | `1741305600` |

### Authentication Method

The scope token is passed as a URL query parameter:

```
POST /rpc/sepolia?token=scope_abc123
```

> Header-based auth (`Authorization: Bearer`) is also possible, but query parameter is the most convenient for WAIaaS custom provider URLs which embed the token directly.

---

## 3. Endpoint

### `POST /rpc/{chainId}`

A single endpoint handling both bundler and paymaster JSON-RPC methods.

**Path Parameter:**

| Name | Description | Example |
|------|-------------|---------|
| `chainId` | Target chain identifier | `sepolia`, `base-sepolia` |

**Query Parameter:**

| Name | Required | Description |
|------|:--------:|-------------|
| `token` | Y | Scope token |

**Request Body:** JSON-RPC 2.0

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "eth_sendUserOperation",
  "params": [...]
}
```

**Response:** The backend provider's JSON-RPC response, forwarded as-is.

---

## 4. Supported Methods

### 4.1 Bundler Methods (ERC-4337) — Forward As-Is

| Method | Description |
|--------|-------------|
| `eth_sendUserOperation` | Submit UserOperation |
| `eth_estimateUserOperationGas` | Estimate gas |
| `eth_getUserOperationByHash` | Query UserOp |
| `eth_getUserOperationReceipt` | Query receipt |
| `eth_supportedEntryPoints` | List EntryPoints |
| `eth_chainId` | Chain ID |

Processing: Forward the request body to the backend provider **without modification**.

### 4.2 Paymaster Methods (ERC-7677) — Inject Context, Then Forward

| Method | Description |
|--------|-------------|
| `pm_getPaymasterData` | Request paymaster signature data |
| `pm_getPaymasterStubData` | Request stub data for gas estimation |

Processing: **Inject** the scope token's `policyId` into `params[3]` (context), then forward.

#### Context Injection Logic

```
params[3] = ERC-7677 context object (optional parameter)
```

Provider-specific context field mapping:

| Provider | Context Field |
|----------|--------------|
| Pimlico | `{ "sponsorshipPolicyId": "{policyId}" }` |
| Alchemy | `{ "policyId": "{policyId}" }` |

**Pseudocode:**

```javascript
function injectContext(method, params, scope) {
  if (method !== 'pm_getPaymasterData' && method !== 'pm_getPaymasterStubData') {
    return params; // Bundler method — no transformation
  }
  if (!scope.policyId) {
    return params; // No policyId — no injection needed
  }

  const context = scope.provider === 'pimlico'
    ? { sponsorshipPolicyId: scope.policyId }
    : { policyId: scope.policyId };

  // params[3] is the context position (ERC-7677)
  params[3] = { ...params[3], ...context };
  return params;
}
```

---

## 5. Error Responses

### Proxy Errors

Return errors in standard JSON-RPC format.

| Code | Message | Condition |
|------|---------|-----------|
| `-32000` | `Invalid or expired scope token` | Token invalid or expired |
| `-32001` | `Chain not allowed for this token` | Chain not in allowedChains |
| `-32002` | `Sponsorship limit exceeded` | Spending cap reached |
| `-32003` | `Method not allowed` | Unsupported RPC method |

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32000,
    "message": "Invalid or expired scope token"
  }
}
```

### Backend Provider Errors

Forward the provider's JSON-RPC error response to the client **as-is**.

---

## 6. Scope Token Management API (Optional)

An admin API for the sponsorship service to manage tokens internally. WAIaaS does not call these endpoints — the format is entirely at the implementor's discretion.

### Reference Design

```
POST   /admin/tokens          — Issue a token
GET    /admin/tokens           — List tokens
GET    /admin/tokens/{token}   — Token detail + usage stats
DELETE /admin/tokens/{token}   — Revoke a token
```

Token issuance request example:

```json
{
  "name": "agent-wallet-1",
  "allowedChains": ["sepolia", "base-sepolia"],
  "maxSpendWei": "1000000000000000000",
  "expiresAt": 1741305600
}
```

---

## 7. Implementation Notes

### Minimum Implementation Scope

1. **Scope token validation** — DB lookup or JWT decode
2. **Chain / limit check** — Compare against scope token metadata
3. **Context injection** — Inject policyId into paymaster methods (~5 lines)
4. **JSON-RPC forward** — `fetch(providerUrl, { method: 'POST', body })` (~3 lines)

Core logic is under 100 lines. The rest is HTTP server boilerplate.

### Backend Provider URL Assembly

| Provider | URL Pattern |
|----------|------------|
| Pimlico | `https://api.pimlico.io/v2/{chainId}/rpc?apikey={apiKey}` |
| Alchemy | `https://{chainId}.g.alchemy.com/v2/{apiKey}` |

Pimlico chainId mapping (partial):

| chainId param | Pimlico chainId |
|---------------|----------------|
| `sepolia` | `sepolia` |
| `base-sepolia` | `base-sepolia` |
| `ethereum` | `ethereum` |
| `base` | `base` |

### Security Recommendations

- HTTPS required
- Scope tokens must have sufficient entropy (minimum 32 random bytes)
- Apply rate limiting (per IP + per token)
- Track sponsorship spend: accumulate `actualGasCost` from `eth_getUserOperationReceipt` for cap enforcement
- Method whitelist — allow only the 8 methods listed above, reject all others

### Batch Requests (Optional)

viem may send JSON-RPC batch requests (`[{...}, {...}]`) in some cases.
To support this, detect array input and apply per-request processing to each item.
