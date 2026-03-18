---
name: "WAIaaS External Actions"
description: "Off-chain action framework: signedData/signedHttp pipeline, credential vault, venue/category policies"
category: "api"
tags: [wallet, external-actions, off-chain, signing, credentials, venue, waiass]
version: "3.0.0-rc"
dispatch:
  kind: "tool"
  allowedCommands: ["curl"]
---

# WAIaaS External Actions

Off-chain action framework for AI agents to perform cryptographic signing beyond on-chain transactions. Supports CLOB DEX orders, CEX API authentication, HTTP request signing, and other off-chain operations that require wallet-derived signatures or stored credentials.

> AI agents must NEVER request the master password. Use only your session token.

## Base URL / Authentication

```
http://localhost:3100
```

Action execution and queries use **sessionAuth** (`Authorization: Bearer <token>`).

> Credential 관리(생성/삭제/교체)는 관리자 전용입니다. docs/admin-manual/credentials.md 를 참조하세요.

## Permissions

### Agent (sessionAuth)
- Execute off-chain actions via `POST /v1/actions/:provider/:action` (same endpoint as on-chain -- auto-routed by kind)
- List off-chain action history via `GET /v1/wallets/:id/actions`
- Get off-chain action detail via `GET /v1/wallets/:id/actions/:actionId`
- List credential metadata via `GET /v1/wallets/:id/credentials` (names and types only -- never values)

---

## 1. ResolvedAction 3-Kind System

When an action provider resolves a request, it returns one of three kinds:

| Kind | Description | Pipeline | Credential Needed |
|------|-------------|----------|-------------------|
| `contractCall` | On-chain transaction (existing 6-stage pipeline) | Stage 1-6: validate -> policy -> DB -> sign -> broadcast -> track | No |
| `signedData` | Off-chain data signing (CLOB orders, typed data) | credential -> policy -> DB -> sign -> track | Usually yes |
| `signedHttp` | HTTP request signing (API auth, RFC 9421) | credential -> policy -> sign -> execute HTTP -> track | Usually yes |

The `POST /v1/actions/:provider/:action` endpoint is the same for all kinds. The daemon inspects the `kind` field in the resolve result and automatically routes to the correct pipeline.

---

## 2. Signing Schemes (7 Types)

The signer capability registry supports 7 signing schemes. Each scheme is matched to an `ISignerCapability` implementation.

| Scheme | Description | Credential Required | Use Case |
|--------|-------------|--------------------:|----------|
| `eip712` | EIP-712 typed data signing | No (wallet key) | CLOB DEX orders, typed approvals |
| `personalSign` | EIP-191 personal_sign | No (wallet key) | Message authentication |
| `erc8128` | RFC 9421 HTTP message signing | No (wallet key) | Signed HTTP requests |
| `hmac-sha256` | HMAC-SHA256 | Yes (shared secret) | CEX API authentication |
| `rsa-pss-sha256` | RSA-PSS SHA-256 | Yes (RSA private key) | Certificate-based auth |
| `ecdsa-secp256k1` | ECDSA secp256k1 (raw) | Yes (private key bytes) | Custom crypto protocols |
| `ed25519` | Ed25519 Edwards curve | Yes (32-byte seed) | High-performance signing |

Schemes that require credentials reference a `credentialRef` string that resolves to an encrypted credential in the vault.

---

## 3. Credential Queries

Credentials are stored encrypted with AES-256-GCM. Credential values are **never** returned in API responses.

### List Credentials (sessionAuth)

```bash
curl -s http://localhost:3100/v1/wallets/<wallet-id>/credentials \
  -H 'Authorization: Bearer <token>'
```

Returns array of `CredentialMetadata` (names, types, expiry -- no `value` field).

---

## 4. Off-chain Action Execution

Off-chain actions use the **same endpoint** as on-chain actions. The daemon automatically detects the kind and routes accordingly.

```bash
# Example: Execute an off-chain action (signedData kind)
curl -s -X POST http://localhost:3100/v1/actions/polymarket_order/pm_buy \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' \
  -d '{
    "params": {
      "tokenId": "0x1234...",
      "amount": "100",
      "price": "0.65",
      "side": "BUY"
    },
    "walletId": "<wallet-id>"
  }'
```

The pipeline flow for signedData:
1. Resolve credential from vault (if `credentialRef` specified)
2. Evaluate policies (VENUE_WHITELIST, ACTION_CATEGORY_LIMIT, SPENDING_LIMIT)
3. Store action record in DB
4. Sign data using the matched `ISignerCapability`
5. Register for async tracking (polling for fill/cancel/expire)
6. Return result with action ID

---

## 5. Off-chain Action Queries

### List Off-chain Actions

```bash
curl -s "http://localhost:3100/v1/wallets/<wallet-id>/actions?venue=polymarket&status=FILLED&limit=10&offset=0" \
  -H 'Authorization: Bearer <token>'
```

**Response:**
```json
{
  "actions": [
    {
      "id": "act-uuid",
      "actionKind": "signedData",
      "venue": "polymarket",
      "operation": "pm_buy",
      "status": "FILLED",
      "bridgeStatus": null,
      "createdAt": 1700000000,
      "provider": "polymarket_order",
      "actionName": "pm_buy"
    }
  ],
  "total": 42,
  "limit": 10,
  "offset": 0
}
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `venue` | string | Filter by venue (e.g. polymarket, hyperliquid) |
| `status` | string | Filter by status (PENDING, FILLED, CANCELED, EXPIRED, etc.) |
| `limit` | number | Max results (default 20) |
| `offset` | number | Pagination offset |

### Get Action Detail

```bash
curl -s http://localhost:3100/v1/wallets/<wallet-id>/actions/<action-id> \
  -H 'Authorization: Bearer <token>'
```

Returns full `OffchainActionDetail` including metadata, error, txHash.

---

## 6. Venue / Category Policies

### VENUE_WHITELIST

Controls which external venues (exchanges, protocols) are allowed. Default-deny when enabled.

- Enable via Admin Settings: `venue_whitelist_enabled=true`
- Configure allowed venues via `POST /v1/policies` with type `VENUE_WHITELIST`
- See **policies.skill.md** for full configuration

### ACTION_CATEGORY_LIMIT

Per-category USD spending limits for off-chain actions.

- Supports `per_action`, `daily`, and `monthly` limits
- Uses `notionalUsd` from action metadata for evaluation
- See **policies.skill.md** for full configuration

---

## 7. MCP Tools

Two dedicated query tools (actions are executed via existing `action_*` tools):

| Tool | Description |
|------|-------------|
| `list_offchain_actions` | List off-chain action history with venue/status/limit/offset filter |
| `list_credentials` | List credential metadata (names, types, expiry -- never values) |

**Note:** Off-chain action **execution** uses existing action provider MCP tools (e.g. `pm_buy`, `hl_place_order`). The daemon auto-routes to the correct pipeline based on the resolved action kind.

---

## 8. SDK Methods

```typescript
import { WAIaaSClient } from '@waiaas/sdk';

// Query (sessionAuth)
const actions = await client.listOffchainActions({ walletId: 'w1', venue: 'polymarket', limit: 10 });
const detail = await client.getActionResult('w1', 'act-uuid');
const creds = await client.listCredentials('w1');

// Off-chain action execution (sessionAuth -- uses existing executeAction)
const result = await client.executeAction('polymarket_order', 'pm_buy', {
  params: { tokenId: '0x...', amount: '100', price: '0.65', side: 'BUY' },
  walletId: 'w1',
});
```

---

## 9. Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `CREDENTIAL_NOT_FOUND` | 404 | Referenced credential does not exist in vault |
| `CREDENTIAL_EXPIRED` | 410 | Credential has passed its expiration time |
| `SIGNING_SCHEME_UNSUPPORTED` | 400 | Requested signing scheme not registered |
| `CAPABILITY_NOT_FOUND` | 404 | No signer capability matches the signing scheme |
| `VENUE_NOT_ALLOWED` | 403 | Venue blocked by VENUE_WHITELIST policy |
| `EXTERNAL_ACTION_FAILED` | 500 | Off-chain action execution failed |

---

## 10. Async Tracking States

Off-chain actions are tracked asynchronously with 9 states:

| State | Terminal | Description |
|-------|----------|-------------|
| `PENDING` | No | Action submitted, awaiting processing |
| `SUBMITTED` | No | Action confirmed submitted to venue |
| `PARTIALLY_FILLED` | No | Partially filled (CLOB orders) |
| `FILLED` | Yes | Fully filled / completed |
| `CANCELED` | Yes | Canceled by user or venue |
| `EXPIRED` | Yes | Expired (TTL or venue expiry) |
| `SETTLED` | Yes | Settlement confirmed |
| `FAILED` | Yes | Execution failed |
| `CONFIRMED` | Yes | On-chain confirmation (for hybrid actions) |

---

## 11. Related Skill Files

- **actions.skill.md** -- Action Provider framework and DeFi protocol actions
- **policies.skill.md** -- VENUE_WHITELIST and ACTION_CATEGORY_LIMIT policy configuration
- **admin.skill.md** -- Credential management via Admin API
- **transactions.skill.md** -- On-chain 6-type transaction reference
- **polymarket.skill.md** -- Polymarket prediction market (signedData example)
