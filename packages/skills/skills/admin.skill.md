---
name: "WAIaaS Admin"
description: "Admin API: daemon status, kill switch, notifications, settings management, JWT rotation, shutdown, oracle status, API key management"
category: "api"
tags: [wallet, blockchain, admin, security, oracle, defi, waiass]
version: "2.3.0"
dispatch:
  kind: "tool"
  allowedCommands: ["curl"]
---

# WAIaaS Admin API

Admin endpoints for daemon operations management. Covers health monitoring, emergency kill switch, notification channels, settings (RPC, security, notifications), JWT secret rotation, and graceful shutdown.

## Base URL

```
http://localhost:3100
```

## Authentication

All admin endpoints require **masterAuth** via `X-Master-Password` header, except `GET /v1/admin/kill-switch` which is public.

```
X-Master-Password: <your-master-password>
```

The master password is set in `config.toml` under `[security]` or via environment variable `WAIAAS_SECURITY_MASTER_PASSWORD`.

---

## 1. Daemon Status & Control

> **See also:** `GET /health` (no auth required, includes version check info: `latestVersion`, `updateAvailable`, `schemaVersion`). Documented in **quickstart.skill.md** Step 1.

### GET /v1/admin/status -- Daemon Health

Returns daemon health, uptime, version, wallet/session counts, and kill switch state.

```bash
curl -s http://localhost:3100/v1/admin/status \
  -H 'X-Master-Password: <password>'
```

**Response (200):**
```json
{
  "status": "running",
  "version": "2.4.0",
  "latestVersion": null,
  "updateAvailable": false,
  "uptime": 3600,
  "walletCount": 5,
  "activeSessionCount": 3,
  "killSwitchState": "NORMAL",
  "adminTimeout": 300,
  "timestamp": 1707000000
}
```

| Field                | Type    | Description                                   |
| -------------------- | ------- | --------------------------------------------- |
| `status`             | string        | Always "running" if daemon is up.             |
| `version`            | string        | Daemon version.                               |
| `latestVersion`      | string\|null  | Latest available version, or null.            |
| `updateAvailable`    | boolean       | Whether a newer version is available.         |
| `uptime`             | integer       | Seconds since daemon start.                   |
| `walletCount`        | integer       | Total wallets in database.                    |
| `activeSessionCount` | integer       | Non-expired, non-revoked sessions.            |
| `killSwitchState`    | string        | "NORMAL" or "ACTIVATED".                      |
| `adminTimeout`       | integer       | Admin operation timeout (seconds).            |
| `timestamp`          | integer       | Current epoch timestamp (seconds).            |

### POST /v1/admin/shutdown -- Graceful Shutdown

Initiate graceful daemon shutdown.

```bash
curl -s -X POST http://localhost:3100/v1/admin/shutdown \
  -H 'X-Master-Password: <password>'
```

**Response (200):**
```json
{"message": "Shutdown initiated"}
```

### POST /v1/admin/rotate-secret -- Rotate JWT Secret

Rotate the JWT signing secret. Existing tokens remain valid for 5 minutes (dual-key rotation period).

```bash
curl -s -X POST http://localhost:3100/v1/admin/rotate-secret \
  -H 'X-Master-Password: <password>'
```

**Response (200):**
```json
{
  "rotatedAt": 1707000000,
  "message": "JWT secret rotated. Old tokens valid for 5 minutes."
}
```

### POST /v1/admin/agent-prompt -- Generate Agent Connection Prompt

Generate a connection prompt ("magic word") for AI agents. Creates sessions for all active wallets (or specified wallets) and returns a structured `[WAIaaS Connection]` block.

```bash
# All active wallets
curl -s -X POST http://localhost:3100/v1/admin/agent-prompt \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{}'

# Specific wallets only
curl -s -X POST http://localhost:3100/v1/admin/agent-prompt \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{"walletIds": ["<wallet-id-1>", "<wallet-id-2>"], "ttl": 86400}'
```

**Parameters:**

| Parameter   | Type     | Required | Default | Description                           |
| ----------- | -------- | -------- | ------- | ------------------------------------- |
| `walletIds` | string[] | No       | all     | Specific wallet IDs. Omit for all active wallets. |
| `ttl`       | integer  | No       | 86400   | Session TTL in seconds.               |

**Response (201):**
```json
{
  "prompt": "[WAIaaS Connection]\n- URL: http://localhost:3100\n\nWallets:\n1. my-wallet (019...) \u2014 devnet\n   Session: eyJ...\n\nWhen the session expires (401 Unauthorized),\nrenew with POST /v1/wallets/{walletId}/sessions/{sessionId}/renew.\n\nConnect to WAIaaS wallets using the above information to check balances and manage assets.",
  "walletCount": 1,
  "sessionsCreated": 1,
  "expiresAt": 1707086400
}
```

| Field             | Type    | Description                                    |
| ----------------- | ------- | ---------------------------------------------- |
| `prompt`          | string  | Full connection prompt text to paste to agents. |
| `walletCount`     | integer | Number of wallets included.                    |
| `sessionsCreated` | integer | Number of new sessions created.                |
| `expiresAt`       | integer | Epoch seconds when sessions expire.            |

---

## 2. Kill Switch (Emergency Stop)

The kill switch blocks all transaction endpoints with HTTP 503. Use in emergencies (compromise, suspicious activity).

### POST /v1/admin/kill-switch -- Activate

Activate the kill switch. All subsequent transaction requests will receive 503 Service Unavailable.

```bash
curl -s -X POST http://localhost:3100/v1/admin/kill-switch \
  -H 'X-Master-Password: <password>'
```

**Response (200):**
```json
{
  "state": "ACTIVATED",
  "activatedAt": 1707000000
}
```

### GET /v1/admin/kill-switch -- Get State (Public)

Check kill switch state. **No authentication required.**

```bash
curl -s http://localhost:3100/v1/admin/kill-switch
```

**Response (200):**
```json
{
  "state": "NORMAL",
  "activatedAt": null,
  "activatedBy": null
}
```

| Field         | Type           | Description                              |
| ------------- | -------------- | ---------------------------------------- |
| `state`       | string         | "NORMAL" or "ACTIVATED".                 |
| `activatedAt` | integer\|null  | Epoch seconds when activated, or null.   |
| `activatedBy` | string\|null   | Who activated ("master"), or null.       |

### POST /v1/admin/recover -- Deactivate

Deactivate the kill switch and resume normal operations.

```bash
curl -s -X POST http://localhost:3100/v1/admin/recover \
  -H 'X-Master-Password: <password>'
```

**Response (200):**
```json
{
  "state": "NORMAL",
  "recoveredAt": 1707000000
}
```

---

## 3. Notification Management

### GET /v1/admin/notifications/status -- Channel Status

Get notification channel configuration status. Credentials are masked (shown as boolean).

```bash
curl -s http://localhost:3100/v1/admin/notifications/status \
  -H 'X-Master-Password: <password>'
```

**Response (200):**
```json
{
  "enabled": true,
  "channels": [
    {"name": "telegram", "enabled": true},
    {"name": "discord", "enabled": false},
    {"name": "ntfy", "enabled": false},
    {"name": "slack", "enabled": false}
  ]
}
```

### POST /v1/admin/notifications/test -- Send Test Notification

Send a test notification to verify channel configuration. Optionally target a specific channel.

```bash
# Test all channels
curl -s -X POST http://localhost:3100/v1/admin/notifications/test \
  -H 'X-Master-Password: <password>'

# Test specific channel
curl -s -X POST http://localhost:3100/v1/admin/notifications/test \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{"channel": "telegram"}'
```

**Parameters:**

| Parameter | Type   | Required | Description                                      |
| --------- | ------ | -------- | ------------------------------------------------ |
| `channel` | string | No       | "telegram", "discord", "ntfy", or "slack". Omit for all.  |

**Response (200):**
```json
{
  "results": [
    {"channel": "telegram", "success": true},
    {"channel": "discord", "success": false, "error": "Webhook URL not configured"}
  ]
}
```

### GET /v1/admin/notifications/log -- Query Delivery Logs

Query notification delivery history with pagination and filtering.

```bash
curl -s 'http://localhost:3100/v1/admin/notifications/log?page=1&pageSize=20&channel=telegram&status=sent' \
  -H 'X-Master-Password: <password>'
```

**Query Parameters:**

| Parameter  | Type   | Required | Default | Description                          |
| ---------- | ------ | -------- | ------- | ------------------------------------ |
| `page`     | string | No       | "1"     | Page number (1-based).               |
| `pageSize` | string | No       | "20"    | Items per page (1-100).              |
| `channel`  | string | No       | --      | Filter by channel name.              |
| `status`   | string | No       | --      | Filter by status (e.g., "sent", "failed"). |

**Response (200):**
```json
{
  "logs": [
    {
      "id": "<uuid>",
      "eventType": "TX_CONFIRMED",
      "walletId": "<uuid>",
      "channel": "telegram",
      "status": "sent",
      "error": null,
      "message": "[WAIaaS] Transaction confirmed\n0.01 ETH sent to 0x...",
      "createdAt": 1707000000
    }
  ],
  "total": 42,
  "page": 1,
  "pageSize": 20
}
```

---

## 4. Settings Management (v1.4.4)

Dynamic daemon settings with hot-reload support. Changes take effect immediately without daemon restart.

### GET /v1/admin/settings -- Get All Settings

Returns all settings organized by 5 categories. Credential values are masked as boolean (`true` if configured, `false` if empty).

```bash
curl -s http://localhost:3100/v1/admin/settings \
  -H 'X-Master-Password: <password>'
```

**Response (200):**
```json
{
  "notifications": {
    "notifications.enabled": "false",
    "notifications.telegram_bot_token": true,
    "notifications.telegram_chat_id": "123456789",
    "notifications.discord_webhook_url": false,
    "notifications.ntfy_server": "https://ntfy.sh",
    "notifications.ntfy_topic": "",
    "notifications.slack_webhook_url": false,
    "notifications.locale": "en",
    "notifications.rate_limit_rpm": "20"
  },
  "rpc": {
    "rpc.solana_mainnet": "https://api.mainnet-beta.solana.com",
    "rpc.solana_devnet": "https://api.devnet.solana.com",
    "rpc.solana_testnet": "https://api.testnet.solana.com",
    "rpc.evm_ethereum_mainnet": "https://eth.drpc.org",
    "rpc.evm_ethereum_sepolia": "https://sepolia.drpc.org",
    "rpc.evm_polygon_mainnet": "https://polygon.drpc.org",
    "rpc.evm_polygon_amoy": "https://polygon-amoy.drpc.org",
    "rpc.evm_arbitrum_mainnet": "https://arbitrum.drpc.org",
    "rpc.evm_arbitrum_sepolia": "https://arbitrum-sepolia.drpc.org",
    "rpc.evm_optimism_mainnet": "https://optimism.drpc.org",
    "rpc.evm_optimism_sepolia": "https://optimism-sepolia.drpc.org",
    "rpc.evm_base_mainnet": "https://base.drpc.org",
    "rpc.evm_base_sepolia": "https://base-sepolia.drpc.org",
    "rpc.evm_default_network": "ethereum-sepolia"
  },
  "security": {
    "security.session_ttl": "86400",
    "security.max_sessions_per_wallet": "5",
    "security.max_pending_tx": "10",
    "security.rate_limit_global_ip_rpm": "1000",
    "security.rate_limit_session_rpm": "300",
    "security.rate_limit_tx_rpm": "10",
    "security.policy_defaults_delay_seconds": "300",
    "security.policy_defaults_approval_timeout": "3600"
  },
  "daemon": {
    "daemon.log_level": "info"
  },
  "walletconnect": {
    "walletconnect.project_id": ""
  }
}
```

**Categories:**

| Category        | Keys                                                    | Description                            |
| --------------- | ------------------------------------------------------- | -------------------------------------- |
| `notifications` | enabled, telegram_*, discord_*, ntfy_*, slack_*, locale, rate_limit_rpm | Notification channel configuration.  |
| `rpc`           | solana_*, evm_*, evm_default_network                    | Blockchain RPC endpoint URLs.          |
| `security`      | session_ttl, max_sessions_*, rate_limit_*, policy_defaults_* | Security and rate limiting.         |
| `daemon`        | log_level                                               | Daemon runtime settings.               |
| `walletconnect` | project_id                                              | WalletConnect project configuration.   |

### PUT /v1/admin/settings -- Update Settings

Update one or more settings. Triggers hot-reload for notification and RPC changes (no daemon restart needed). Security settings are picked up on next request automatically.

```bash
curl -s -X PUT http://localhost:3100/v1/admin/settings \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{
    "settings": [
      {"key": "notifications.telegram_bot_token", "value": "1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ"},
      {"key": "notifications.telegram_chat_id", "value": "-100123456789"},
      {"key": "notifications.enabled", "value": "true"}
    ]
  }'
```

**Request body:**
```json
{
  "settings": [
    {"key": "<setting-key>", "value": "<new-value>"}
  ]
}
```

| Field      | Type   | Required | Description                      |
| ---------- | ------ | -------- | -------------------------------- |
| `settings` | array  | Yes      | At least 1 key-value pair.       |
| `key`      | string | Yes      | Setting key (e.g., "rpc.solana_mainnet"). |
| `value`    | string | Yes      | New value (always a string).     |

**Response (200):**
```json
{
  "updated": 3,
  "settings": { ... }
}
```

Returns the count of updated settings and the full settings object (same format as GET).

**All valid setting keys:**

Notifications:
- `notifications.enabled` -- Enable/disable notifications ("true"/"false")
- `notifications.telegram_bot_token` -- Telegram bot API token (credential, encrypted at rest)
- `notifications.telegram_chat_id` -- Telegram chat ID
- `notifications.discord_webhook_url` -- Discord webhook URL (credential, encrypted at rest)
- `notifications.ntfy_server` -- ntfy server URL (default: "https://ntfy.sh")
- `notifications.ntfy_topic` -- ntfy topic name
- `notifications.slack_webhook_url` -- Slack webhook URL (credential, encrypted at rest)
- `notifications.locale` -- Notification locale ("en", "ko", etc.)
- `notifications.rate_limit_rpm` -- Notification rate limit (per minute)

RPC:
- `rpc.solana_mainnet` -- Solana mainnet RPC URL
- `rpc.solana_devnet` -- Solana devnet RPC URL
- `rpc.solana_testnet` -- Solana testnet RPC URL
- `rpc.evm_ethereum_mainnet` -- Ethereum mainnet RPC URL
- `rpc.evm_ethereum_sepolia` -- Ethereum Sepolia testnet RPC URL
- `rpc.evm_polygon_mainnet` -- Polygon mainnet RPC URL
- `rpc.evm_polygon_amoy` -- Polygon Amoy testnet RPC URL
- `rpc.evm_arbitrum_mainnet` -- Arbitrum mainnet RPC URL
- `rpc.evm_arbitrum_sepolia` -- Arbitrum Sepolia testnet RPC URL
- `rpc.evm_optimism_mainnet` -- Optimism mainnet RPC URL
- `rpc.evm_optimism_sepolia` -- Optimism Sepolia testnet RPC URL
- `rpc.evm_base_mainnet` -- Base mainnet RPC URL
- `rpc.evm_base_sepolia` -- Base Sepolia testnet RPC URL
- `rpc.evm_default_network` -- Default EVM network for new wallets

Security:
- `security.session_ttl` -- Default session TTL in seconds (default: "86400")
- `security.max_sessions_per_wallet` -- Max concurrent sessions per wallet (default: "5")
- `security.max_pending_tx` -- Max pending transactions per wallet (default: "10")
- `security.rate_limit_global_ip_rpm` -- Global rate limit per IP (RPM, default: "1000")
- `security.rate_limit_session_rpm` -- Per-session rate limit (RPM, default: "300")
- `security.rate_limit_tx_rpm` -- Transaction rate limit (RPM, default: "10")
- `security.policy_defaults_delay_seconds` -- Default DELAY tier cooldown (default: "300")
- `security.policy_defaults_approval_timeout` -- Default APPROVAL tier timeout (default: "3600")

Daemon:
- `daemon.log_level` -- Log level: "debug", "info", "warn", "error" (default: "info")

WalletConnect:
- `walletconnect.project_id` -- WalletConnect Cloud project ID

### POST /v1/admin/settings/test-rpc -- Test RPC Connectivity

Test connectivity to an RPC endpoint before saving it. Returns latency and block height.

```bash
curl -s -X POST http://localhost:3100/v1/admin/settings/test-rpc \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{"url": "https://api.mainnet-beta.solana.com", "chain": "solana"}'
```

**Parameters:**

| Parameter | Type   | Required | Default      | Description                              |
| --------- | ------ | -------- | ------------ | ---------------------------------------- |
| `url`     | string | Yes      | --           | RPC endpoint URL to test.                |
| `chain`   | string | No       | "ethereum"   | "solana" or "ethereum".                  |

**Response (200):**
```json
{
  "success": true,
  "latencyMs": 45,
  "blockNumber": 289456123
}
```

On failure:
```json
{
  "success": false,
  "latencyMs": 5000,
  "error": "Connection timeout"
}
```

Note: RPC failure returns HTTP 200 with `success: false` -- it is not an HTTP error.

---

## 5. Common Workflows

### Set up Telegram notifications

1. Update settings with bot token and chat ID:
```bash
curl -s -X PUT http://localhost:3100/v1/admin/settings \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{"settings":[{"key":"notifications.telegram_bot_token","value":"<bot-token>"},{"key":"notifications.telegram_chat_id","value":"<chat-id>"},{"key":"notifications.enabled","value":"true"}]}'
```

2. Send test notification:
```bash
curl -s -X POST http://localhost:3100/v1/admin/notifications/test \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{"channel":"telegram"}'
```

### Set up Slack notifications

1. Update settings with Slack webhook URL:
```bash
curl -s -X PUT http://localhost:3100/v1/admin/settings \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{"settings":[{"key":"notifications.slack_webhook_url","value":"https://hooks.slack.com/services/T.../B.../xxx"},{"key":"notifications.enabled","value":"true"}]}'
```

2. Send test notification:
```bash
curl -s -X POST http://localhost:3100/v1/admin/notifications/test \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{"channel":"slack"}'
```

### Change RPC endpoint

1. Test new RPC endpoint first:
```bash
curl -s -X POST http://localhost:3100/v1/admin/settings/test-rpc \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{"url":"https://my-rpc.example.com","chain":"ethereum"}'
```

2. If test succeeds, update the setting:
```bash
curl -s -X PUT http://localhost:3100/v1/admin/settings \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{"settings":[{"key":"rpc.evm_ethereum_mainnet","value":"https://my-rpc.example.com"}]}'
```

Hot-reload evicts the cached adapter for this chain:network and creates a new one on the next request.

### Emergency stop

1. Activate kill switch:
```bash
curl -s -X POST http://localhost:3100/v1/admin/kill-switch \
  -H 'X-Master-Password: <password>'
```

2. Investigate the issue (check logs, transactions, balances).

3. Deactivate kill switch to resume:
```bash
curl -s -X POST http://localhost:3100/v1/admin/recover \
  -H 'X-Master-Password: <password>'
```

---

## 6. Oracle Status (v1.5)

Price oracle cache statistics, source availability, and cross-validation configuration.

### GET /v1/admin/oracle-status -- Oracle Status

Returns cache hit/miss stats, Pyth and CoinGecko source availability, and cross-validation settings.

```bash
curl -s http://localhost:3100/v1/admin/oracle-status \
  -H 'X-Master-Password: <password>'
```

**Response (200):**
```json
{
  "cache": {
    "hits": 142,
    "misses": 23,
    "staleHits": 5,
    "size": 38,
    "evictions": 0
  },
  "sources": {
    "pyth": {
      "available": true,
      "baseUrl": "https://hermes.pyth.network"
    },
    "coingecko": {
      "available": true,
      "apiKeyConfigured": true
    }
  },
  "crossValidation": {
    "enabled": true,
    "threshold": 5
  }
}
```

| Field | Type | Description |
| ----- | ---- | ----------- |
| `cache.hits` | integer | Cache hit count. |
| `cache.misses` | integer | Cache miss count. |
| `cache.staleHits` | integer | Stale cache fallback count. |
| `cache.size` | integer | Current cache entry count. |
| `cache.evictions` | integer | LRU eviction count. |
| `sources.pyth.available` | boolean | Pyth Hermes oracle available. |
| `sources.pyth.baseUrl` | string | Pyth Hermes API base URL. |
| `sources.coingecko.available` | boolean | CoinGecko oracle available. |
| `sources.coingecko.apiKeyConfigured` | boolean | CoinGecko API key configured. |
| `crossValidation.enabled` | boolean | Cross-validation enabled (requires CoinGecko). |
| `crossValidation.threshold` | number | Max price deviation percentage before STALE. |

---

## 7. API Key Management (v1.5)

Manage API keys for Action Providers. Keys are encrypted at rest in the database.

### GET /v1/admin/api-keys -- List API Key Status

Returns per-provider API key status. Key values are masked.

```bash
curl -s http://localhost:3100/v1/admin/api-keys \
  -H 'X-Master-Password: <password>'
```

**Response (200):**
```json
{
  "keys": [
    {
      "providerName": "jupiter",
      "hasKey": true,
      "maskedKey": "ju...er",
      "requiresApiKey": true,
      "updatedAt": "2026-02-15T10:30:00.000Z"
    },
    {
      "providerName": "raydium",
      "hasKey": false,
      "maskedKey": null,
      "requiresApiKey": false,
      "updatedAt": null
    }
  ]
}
```

| Field | Type | Description |
| ----- | ---- | ----------- |
| `providerName` | string | Action provider name. |
| `hasKey` | boolean | Whether an API key is set. |
| `maskedKey` | string\|null | Masked key (first 2 + last 2 chars), or null. |
| `requiresApiKey` | boolean | Provider requires API key to function. |
| `updatedAt` | string\|null | ISO 8601 timestamp of last update, or null. |

### PUT /v1/admin/api-keys/:provider -- Set/Update API Key

Set or update the API key for a specific provider.

```bash
curl -s -X PUT http://localhost:3100/v1/admin/api-keys/jupiter \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{"apiKey": "your-api-key-here"}'
```

**Response (200):**
```json
{
  "success": true,
  "providerName": "jupiter"
}
```

### DELETE /v1/admin/api-keys/:provider -- Delete API Key

Delete the API key for a specific provider.

```bash
curl -s -X DELETE http://localhost:3100/v1/admin/api-keys/jupiter \
  -H 'X-Master-Password: <password>'
```

**Response (200):**
```json
{
  "success": true
}
```

If no key exists for the provider, returns 404 `ACTION_NOT_FOUND`.

---

## 8. Error Reference

| Error Code               | HTTP | Description                                    |
| ------------------------ | ---- | ---------------------------------------------- |
| `MASTER_AUTH_REQUIRED`   | 401  | Missing or invalid X-Master-Password header.   |
| `KILL_SWITCH_ACTIVE`     | 503  | Kill switch is active, transactions blocked.    |
| `KILL_SWITCH_NOT_ACTIVE` | 400  | Cannot recover -- kill switch is not active.    |
| `ROTATION_TOO_RECENT`    | 429  | JWT secret rotation attempted too soon.         |
| `ADAPTER_NOT_AVAILABLE`  | 500  | Required service not initialized.               |
| `ACTION_VALIDATION_FAILED`| 400 | Invalid setting key or request body.            |
| `API_KEY_REQUIRED`       | 403  | Action provider requires API key not yet configured. |
| `ACTION_NOT_FOUND`       | 404  | Action provider or API key not found.           |

**Error response format:**
```json
{
  "code": "KILL_SWITCH_ACTIVE",
  "message": "Kill switch is activated. All transaction endpoints are blocked.",
  "retryable": false,
  "details": {},
  "requestId": "<uuid>",
  "hint": "POST /v1/admin/recover to deactivate the kill switch"
}
```

---

## 9. Related Skill Files

- **actions.skill.md** -- Action Provider REST API (DeFi actions)
- **policies.skill.md** -- Policy management (10 policy types for transaction controls)
- **wallet.skill.md** -- Wallet CRUD, sessions, assets, tokens, MCP
- **transactions.skill.md** -- 5-type transaction reference
- **quickstart.skill.md** -- End-to-end quickstart workflow
