---
name: "WAIaaS Actions"
description: "Action Provider framework: list providers, execute DeFi actions through the 6-stage transaction pipeline"
category: "api"
tags: [wallet, blockchain, defi, actions, waiass]
version: "2.4.0-rc.7"
dispatch:
  kind: "tool"
  allowedCommands: ["curl"]
---

# WAIaaS Actions

Action Provider framework for executing DeFi protocol actions (swaps, staking, liquidity) through the WAIaaS transaction pipeline. Actions are resolved by registered providers and executed as CONTRACT_CALL transactions through the existing 6-stage pipeline with full policy evaluation.

## Base URL / Authentication

```
http://localhost:3100
```

All action endpoints require **sessionAuth** via `Authorization: Bearer <token>` header.

## Permissions

### Agent (sessionAuth)
- List action providers and their available actions
- Execute actions (subject to policy evaluation)

### Admin (masterAuth -- prerequisite)
- Register API keys for action providers via Admin UI Settings
- Configure CONTRACT_WHITELIST/ALLOWED_TOKENS policies for provider contracts

```
Authorization: Bearer wai_sess_eyJ...
```

## 1. List Action Providers

### GET /v1/actions/providers -- List Registered Providers

Returns all registered action providers with their actions and API key status.

```bash
curl -s http://localhost:3100/v1/actions/providers \
  -H 'Authorization: Bearer wai_sess_eyJ...'
```

**Response (200):**
```json
{
  "providers": [
    {
      "name": "jupiter",
      "description": "Jupiter DEX aggregator for Solana token swaps",
      "version": "1.0.0",
      "chains": ["solana"],
      "mcpExpose": true,
      "requiresApiKey": true,
      "hasApiKey": true,
      "actions": [
        {
          "name": "swap",
          "description": "Swap tokens via Jupiter aggregator",
          "chain": "solana",
          "riskLevel": "medium",
          "defaultTier": "NOTIFY"
        }
      ]
    }
  ]
}
```

| Field | Type | Description |
| ----- | ---- | ----------- |
| `name` | string | Provider identifier. |
| `description` | string | Human-readable provider description. |
| `version` | string | Provider version (semver). |
| `chains` | string[] | Supported blockchain chains. |
| `mcpExpose` | boolean | Whether actions are exposed as MCP tools. |
| `requiresApiKey` | boolean | Whether provider needs an API key to function. |
| `hasApiKey` | boolean | Whether API key is currently configured. |
| `actions` | array | Available actions for this provider. |
| `actions[].name` | string | Action identifier. |
| `actions[].description` | string | What the action does. |
| `actions[].chain` | string | Target blockchain. |
| `actions[].riskLevel` | string | Risk level: "low", "medium", "high". |
| `actions[].defaultTier` | string | Default policy tier: "INSTANT", "NOTIFY", "DELAY", "APPROVAL". |

## 2. Execute Action

### POST /v1/actions/:provider/:action -- Execute Provider Action

Resolve action parameters into a ContractCallRequest and execute through the 6-stage transaction pipeline. Returns immediately with transaction ID.

```bash
curl -s -X POST http://localhost:3100/v1/actions/jupiter/swap \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -d '{
    "params": {
      "inputMint": "So11111111111111111111111111111111111111112",
      "outputMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "amount": "1000000000",
      "slippageBps": 50
    },
    "network": "devnet"
  }'
```

**Parameters:**

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `params` | object | No | Action-specific parameters as key-value pairs. Varies per provider/action. |
| `network` | string | No | Target network. Defaults to wallet's default network. |

**Response (201):**
```json
{
  "id": "01958f3c-9999-7000-8000-abcdef999999",
  "status": "PENDING"
}
```

The transaction follows the standard lifecycle (PENDING -> QUEUED -> CONFIRMED/FAILED). Query status with `GET /v1/transactions/{id}`.

**Prerequisites:**

1. The resolved contract address must be whitelisted via a **CONTRACT_WHITELIST** policy.
2. If the provider requires an API key (`requiresApiKey: true`), the key must be configured via Admin API Keys.
3. The provider must be registered (loaded from `~/.waiaas/actions/`).

## 3. MCP Integration

When a provider has `mcpExpose: true`, its actions are automatically registered as MCP tools with the naming pattern `action_{provider}_{action}`. This allows AI agents to execute DeFi actions directly via MCP without knowing the REST API.

**Example MCP tool:** `action_jupiter_swap` -- calls `POST /v1/actions/jupiter/swap` under the hood.

MCP tool parameters match the REST API: `params` (optional object) and `network` (optional string).

## 4. Common Workflows

### Execute a token swap

1. Check available providers:
```bash
curl -s http://localhost:3100/v1/actions/providers \
  -H 'Authorization: Bearer wai_sess_eyJ...'
```

2. Ensure CONTRACT_WHITELIST policy includes the DEX contract:
```bash
curl -s -X POST http://localhost:3100/v1/policies \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{
    "walletId": "<wallet-id>",
    "type": "CONTRACT_WHITELIST",
    "rules": {"addresses": ["<dex-contract-address>"]},
    "priority": 0,
    "enabled": true
  }'
```

3. Execute the swap action:
```bash
curl -s -X POST http://localhost:3100/v1/actions/jupiter/swap \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -d '{"params": {"inputMint": "So111...", "outputMint": "EPjF...", "amount": "1000000000"}}'
```

4. Check transaction status:
```bash
curl -s http://localhost:3100/v1/transactions/<tx-id> \
  -H 'Authorization: Bearer wai_sess_eyJ...'
```

### Set up provider API key (Admin)

```bash
curl -s -X PUT http://localhost:3100/v1/admin/api-keys/jupiter \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{"apiKey": "your-jupiter-api-key"}'
```

## 5. Error Reference

| Code | HTTP | Description | Recovery |
|------|------|-------------|----------|
| `ACTION_NOT_FOUND` | 404 | Provider or action not registered. | Check available providers with GET /v1/actions/providers. |
| `API_KEY_REQUIRED` | 403 | Provider requires API key not configured. | Set API key via PUT /v1/admin/api-keys/:provider. |
| `ACTION_VALIDATION_FAILED` | 400 | Input parameters failed validation. | Check params format in provider docs. |
| `ACTION_RESOLVE_FAILED` | 502 | Provider's resolve() call failed. | Check provider logs, verify params. |
| `ACTION_RETURN_INVALID` | 500 | Provider returned invalid ContractCallRequest. | Report to provider maintainer. |
| `CONTRACT_NOT_WHITELISTED` | 403 | Resolved contract not in whitelist. | Add contract to CONTRACT_WHITELIST policy. |
| `POLICY_VIOLATION` | 403 | Transaction blocked by policy. | Check policies with GET /v1/policies. |

## 6. Related Skill Files

- **admin.skill.md** -- API key management, oracle status, daemon admin
- **transactions.skill.md** -- 5-type transaction reference (actions execute as CONTRACT_CALL)
- **policies.skill.md** -- Policy management (CONTRACT_WHITELIST required for actions)
- **wallet.skill.md** -- Wallet CRUD, sessions, assets
