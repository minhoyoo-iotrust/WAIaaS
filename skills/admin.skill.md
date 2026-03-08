---
name: "WAIaaS Admin"
description: "Admin API: daemon status, kill switch, notifications, settings management, JWT rotation, shutdown, oracle status, API key management, audit logs, backup, webhooks, stats, autostop"
category: "api"
tags: [wallet, blockchain, admin, security, oracle, defi, waiass, audit, backup, webhook, stats, autostop]
version: "3.0.0-rc"
dispatch:
  kind: "tool"
  allowedCommands: ["curl"]
---

# WAIaaS Admin API

> **Operator only.** All admin endpoints require masterAuth (X-Master-Password). AI agents must NOT use these endpoints — they are for the Operator via Admin UI or CLI.

> AI agents must NEVER request the master password. Use only your session token.

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

## Session Creation (Multi-Wallet)

### POST /v1/sessions -- Create Session (masterAuth)

```bash
curl -s -X POST http://localhost:3100/v1/sessions \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{"walletIds": ["wallet-1-uuid", "wallet-2-uuid"]}'
```

Body:
- `walletIds`: string[] -- Connect multiple wallets
- `walletId`: string -- Connect single wallet (backward compatible)
- `ttl`?: number -- Session lifetime in seconds (omit for unlimited session)
- `maxRenewals`?: number -- Max renewal count, 0 = unlimited (default: 0)
- `absoluteLifetime`?: number -- Absolute session lifetime in seconds, 0 = unlimited (default: 0)

## Session-Wallet Management (masterAuth required)

Dynamic wallet management for existing sessions.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/sessions/:id/wallets` | Add wallet `{ walletId }` |
| DELETE | `/v1/sessions/:id/wallets/:walletId` | Remove wallet |
| PATCH | `/v1/sessions/:id/wallets/:walletId/default` | Set default |
| GET | `/v1/sessions/:id/wallets` | List connected wallets |

Wallet addition/removal triggers `SESSION_WALLET_ADDED` / `SESSION_WALLET_REMOVED` notifications.

## Agent Self-Discovery

### GET /v1/connect-info (sessionAuth)

Returns wallets, policies, capabilities, and AI prompt for the authenticated session.

```bash
curl -s http://localhost:3100/v1/connect-info \
  -H 'Authorization: Bearer <session-token>'
```

### POST /admin/agent-prompt (masterAuth)

Creates a multi-wallet session and returns a connection prompt with session token.

```bash
curl -s -X POST http://localhost:3100/v1/admin/agent-prompt \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{"walletIds": ["wallet-1-uuid", "wallet-2-uuid"]}'
```

---

## Master Password Management

### CLI: set-master

Change the master password. Requires the current password and a new password.

```bash
waiaas set-master
```

This prompts for:
1. Current master password (or reads from `recovery.key` if auto-provisioned)
2. New master password
3. New master password confirmation

**SECURITY:** After changing the password, delete the `recovery.key` file if it exists. The new password protects all wallet private keys via Argon2id key derivation.

### PUT /v1/admin/master-password -- Change Master Password

Change the master password via REST API. Requires current masterAuth.

```bash
curl -s -X PUT http://localhost:3100/v1/admin/master-password \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <current-password>' \
  -d '{"newPassword": "<new-strong-password>"}'
```

**Request body:**

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `newPassword` | string | Yes | New master password (min 8 characters). |

**Response (200):**
```json
{
  "message": "Master password updated successfully"
}
```

**SECURITY NOTICE:** AI agents must NEVER call this endpoint. Master password changes are operator-only operations. After changing, all existing `X-Master-Password` headers must use the new password. Session tokens (Bearer) are unaffected.

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
  "version": "1.4.4",
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
| `status`             | string  | Always "running" if daemon is up.             |
| `version`            | string  | Daemon version.                               |
| `uptime`             | integer | Seconds since daemon start.                   |
| `walletCount`        | integer | Total wallets in database.                    |
| `activeSessionCount` | integer | Non-expired, non-revoked sessions.            |
| `killSwitchState`    | string  | "NORMAL" or "ACTIVATED".                      |
| `adminTimeout`       | integer | Admin operation timeout (seconds).            |
| `timestamp`          | integer | Current epoch timestamp (seconds).            |

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

> **ntfy channel:** Per-wallet ntfy topics (sign_topic, notify_topic) are managed in Human Wallet Apps (`POST/PUT /v1/admin/wallet-apps`). The ntfy server URL is a shared global setting (`notifications.ntfy_server`).

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

Returns all settings organized by category. Credential values are masked as boolean (`true` if configured, `false` if empty).

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
    "rpc.evm_base_sepolia": "https://base-sepolia.drpc.org"
  },
  "security": {
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
  },
  "oracle": {
    "oracle.coingecko_api_key": false,
    "oracle.cross_validation_threshold": "5"
  },
  "display": {
    "display.currency": "USD"
  },
  "autostop": {
    "autostop.enabled": "true",
    "autostop.consecutive_failures_threshold": "5",
    "autostop.unusual_activity_threshold": "20",
    "autostop.unusual_activity_window_sec": "300",
    "autostop.idle_timeout_sec": "3600",
    "autostop.idle_check_interval_sec": "60"
  },
  "monitoring": {
    "monitoring.enabled": "true",
    "monitoring.check_interval_sec": "300",
    "monitoring.low_balance_threshold_sol": "0.01",
    "monitoring.low_balance_threshold_eth": "0.005",
    "monitoring.cooldown_hours": "24"
  },
  "telegram": {
    "telegram.enabled": "false",
    "telegram.bot_token": false,
    "telegram.locale": "en"
  },
  "signing_sdk": {
    "signing_sdk.enabled": "false",
    "signing_sdk.request_expiry_min": "30",
    "signing_sdk.preferred_channel": "ntfy",
    "signing_sdk.preferred_wallet": "",
    "signing_sdk.ntfy_request_topic_prefix": "waiaas-sign",
    "signing_sdk.ntfy_response_topic_prefix": "waiaas-response"
  },
  "smart_account": {
    "smart_account.enabled": "true",
    "smart_account.entry_point": "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789"
  },
  "erc8128": {
    "erc8128.enabled": "false",
    "erc8128.default_preset": "standard",
    "erc8128.default_ttl": "300",
    "erc8128.include_nonce": "true",
    "erc8128.algorithm": "eip191",
    "erc8128.rate_limit_per_minute": "60"
  }
}
```

**Categories:**

| Category        | Keys                                                    | Description                            |
| --------------- | ------------------------------------------------------- | -------------------------------------- |
| `notifications` | enabled, telegram_*, discord_*, ntfy_server, slack_*, locale, rate_limit_rpm | Notification channel configuration.  |
| `rpc`           | solana_*, evm_*                                         | Blockchain RPC endpoint URLs.          |
| `security`      | max_sessions_*, max_pending_tx, rate_limit_*, policy_defaults_* | Security and rate limiting.         |
| `daemon`        | log_level                                               | Daemon runtime settings.               |
| `walletconnect` | project_id                                              | WalletConnect project configuration.   |
| `oracle`        | coingecko_api_key, cross_validation_threshold            | Price oracle configuration.            |
| `display`       | currency                                                 | Display currency for USD conversion.   |
| `autostop`      | enabled, consecutive_failures_*, unusual_activity_*, idle_* | Automatic protection rules.          |
| `monitoring`    | enabled, check_interval_sec, low_balance_threshold_*, cooldown_hours | Balance monitoring configuration. |
| `telegram`      | enabled, bot_token, locale                               | Telegram Bot interactive commands.     |
| `signing_sdk`   | enabled, request_expiry_min, preferred_channel, preferred_wallet, ntfy_*_topic_prefix | Human Wallet Apps (signing + alerts) configuration. Internal key prefix is signing_sdk for backward compatibility. |
| `smart_account` | enabled, entry_point | ERC-4337 Account Abstraction global toggle and EntryPoint address (EVM only). Bundler/paymaster URLs are configured per-wallet via `PUT /v1/wallets/:id/provider`. |
| `erc8128`       | enabled, default_preset, default_ttl, include_nonce, algorithm, rate_limit_per_minute | ERC-8128 HTTP message signing (RFC 9421 + EIP-191). |

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

Security:
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

Oracle:
- `oracle.coingecko_api_key` -- CoinGecko API key (credential, encrypted at rest)
- `oracle.cross_validation_threshold` -- Price deviation threshold % (default: "5")

Display:
- `display.currency` -- Display currency code (default: "USD")

AutoStop:
- `autostop.enabled` -- Enable/disable autostop ("true"/"false", default: "true")
- `autostop.consecutive_failures_threshold` -- Consecutive failure threshold (default: "5")
- `autostop.unusual_activity_threshold` -- Unusual activity count threshold (default: "20")
- `autostop.unusual_activity_window_sec` -- Unusual activity time window (default: "300")
- `autostop.idle_timeout_sec` -- Session idle timeout (default: "3600")
- `autostop.idle_check_interval_sec` -- Idle check interval (default: "60")

Monitoring:
- `monitoring.enabled` -- Enable/disable balance monitoring (default: "true")
- `monitoring.check_interval_sec` -- Check interval (default: "300")
- `monitoring.low_balance_threshold_sol` -- SOL low balance threshold (default: "0.01")
- `monitoring.low_balance_threshold_eth` -- ETH low balance threshold (default: "0.005")
- `monitoring.cooldown_hours` -- Alert cooldown hours (default: "24")

Telegram:
- `telegram.enabled` -- Enable Telegram bot ("true"/"false", default: "false")
- `telegram.bot_token` -- Telegram bot API token (credential, encrypted at rest)
- `telegram.locale` -- Telegram bot locale ("en", "ko", default: "en")

Signing SDK:
- `signing_sdk.enabled` -- Enable Signing SDK ("true"/"false", default: "false")
- `signing_sdk.request_expiry_min` -- Sign request expiry in minutes (default: "30")
- `signing_sdk.preferred_channel` -- Preferred signing channel ("ntfy" or "telegram", default: "ntfy")
- `signing_sdk.preferred_wallet` -- Preferred wallet app name (default: "")
- `signing_sdk.ntfy_request_topic_prefix` -- Ntfy request topic prefix (default: "waiaas-sign")
- `signing_sdk.ntfy_response_topic_prefix` -- Ntfy response topic prefix (default: "waiaas-response")

Smart Account (ERC-4337):
- `smart_account.enabled` -- Enable smart account support ("true"/"false", default: "true")
- `smart_account.entry_point` -- EntryPoint contract address (default: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789" -- v0.6)

ERC-8128 Signed HTTP Requests:
- `erc8128.enabled` -- Enable ERC-8128 HTTP message signing ("true"/"false", default: "false")
- `erc8128.default_preset` -- Default covered components preset ("minimal", "standard", "strict", default: "standard")
- `erc8128.default_ttl` -- Default signature TTL in seconds (default: "300")
- `erc8128.include_nonce` -- Include UUID v4 nonce by default ("true"/"false", default: "true")
- `erc8128.algorithm` -- Signing algorithm (default: "eip191")
- `erc8128.rate_limit_per_minute` -- Max signing requests per domain per minute (default: "60")

Note: Bundler/paymaster URLs are no longer global settings. They are configured **per-wallet** via `PUT /v1/wallets/:id/provider` (see wallet.skill.md). Supported providers: `pimlico`, `alchemy`, `custom`.

Example: Override EntryPoint address via Admin Settings API:

```bash
curl -s -X PUT http://localhost:3100/v1/admin/settings \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{
    "settings": [
      {"key": "smart_account.entry_point", "value": "0x0000000071727De22E5E9d8BAf0edAc6f37da032"}
    ]
  }'
```

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

**CLI (recommended):**
```bash
# Interactive mode (prompts for bot token and chat ID)
waiaas notification setup

# Non-interactive with test notification
waiaas notification setup --bot-token <TOKEN> --chat-id <ID> --test

# Full options
waiaas notification setup --bot-token <TOKEN> --chat-id <ID> --locale ko --test
```

| Option | Description | Default |
|--------|-------------|---------|
| `--base-url <url>` | Daemon base URL | `http://127.0.0.1:3100` |
| `--bot-token <token>` | Telegram bot token (hidden prompt if omitted) | - |
| `--chat-id <id>` | Telegram chat ID (visible prompt if omitted) | - |
| `--locale <locale>` | Notification language (`en` / `ko`) | `en` |
| `--password <pw>` | Master password | env/file/prompt |
| `--test` | Send test notification after setup | false |

**REST API:**

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

## 8. Human Wallet Apps Management (v29.7)

Manage Human Wallet Apps -- the wallet applications used by the human operator for signing requests and activity alerts. Each app has explicit `sign_topic` and `notify_topic` fields for ntfy push notifications (defaults: `waiaas-sign-{name}`, `waiaas-notify-{name}`). Topics are editable per-app.

When a wallet preset (e.g., D'CENT) is applied to a wallet via `PUT /v1/wallets/{id}/owner`, the corresponding app is automatically registered in the wallet_apps registry.

**Admin UI:** Human Wallet Apps has a top-level menu item in the sidebar (between Security and System).

### GET /v1/admin/wallet-apps -- List Wallet Apps

Returns all registered wallet apps with the wallets using each app.

```bash
curl -s http://localhost:3100/v1/admin/wallet-apps \
  -H 'X-Master-Password: <password>'
```

**Response (200):**
```json
{
  "apps": [
    {
      "id": "<uuid>",
      "name": "dcent",
      "display_name": "D'CENT Wallet",
      "signing_enabled": true,
      "alerts_enabled": true,
      "sign_topic": "waiaas-sign-dcent",
      "notify_topic": "waiaas-notify-dcent",
      "used_by": [
        {"id": "<wallet-uuid>", "label": "my-wallet"}
      ],
      "created_at": 1707000000,
      "updated_at": 1707000000
    }
  ]
}
```

| Field | Type | Description |
| ----- | ---- | ----------- |
| `id` | string | Wallet app UUID. |
| `name` | string | Unique app identifier (matches `wallets.wallet_type`). |
| `display_name` | string | Human-readable display name. |
| `signing_enabled` | boolean | Whether signing requests are routed to this app. |
| `alerts_enabled` | boolean | Whether activity alerts are sent to this app. |
| `sign_topic` | string\|null | ntfy topic for signing requests (null = default `waiaas-sign-{name}`). |
| `notify_topic` | string\|null | ntfy topic for activity alerts (null = default `waiaas-notify-{name}`). |
| `used_by` | array | Wallets using this app (`wallet_type` = app name). |
| `created_at` | integer | Unix timestamp (seconds). |
| `updated_at` | integer | Unix timestamp (seconds). |

### POST /v1/admin/wallet-apps -- Register Wallet App

Register a new wallet app manually.

```bash
curl -s -X POST http://localhost:3100/v1/admin/wallet-apps \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{"name": "my-custom-wallet", "display_name": "My Custom Wallet", "sign_topic": "custom-sign", "notify_topic": "custom-notify"}'
```

**Request body:**

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `name` | string | Yes | Unique app identifier (lowercase, kebab-case). |
| `display_name` | string | Yes | Human-readable display name. |
| `sign_topic` | string | No | ntfy topic for signing requests (auto-generates `waiaas-sign-{name}` if omitted). |
| `notify_topic` | string | No | ntfy topic for activity alerts (auto-generates `waiaas-notify-{name}` if omitted). |

**Response (201):**
```json
{
  "app": {
    "id": "<uuid>",
    "name": "my-custom-wallet",
    "display_name": "My Custom Wallet",
    "signing_enabled": true,
    "alerts_enabled": true,
    "sign_topic": "custom-sign",
    "notify_topic": "custom-notify",
    "used_by": [],
    "created_at": 1707000000,
    "updated_at": 1707000000
  }
}
```

Error: `WALLET_APP_DUPLICATE` (409) if an app with the same name already exists.

### PUT /v1/admin/wallet-apps/{id} -- Update Wallet App

Update signing/alerts toggles and/or ntfy topics for a wallet app.

```bash
curl -s -X PUT http://localhost:3100/v1/admin/wallet-apps/<app-uuid> \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{"signing_enabled": true, "alerts_enabled": false, "sign_topic": "my-sign-topic"}'
```

**Request body:**

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `signing_enabled` | boolean | No | Enable/disable signing request routing. |
| `alerts_enabled` | boolean | No | Enable/disable activity alert notifications. |
| `sign_topic` | string | No | Update ntfy signing request topic. |
| `notify_topic` | string | No | Update ntfy activity alert topic. |

**Response (200):** Same schema as POST response (includes `used_by`).

Error: `WALLET_APP_NOT_FOUND` (404) if the app ID does not exist.

### DELETE /v1/admin/wallet-apps/{id} -- Remove Wallet App

Remove a registered wallet app.

```bash
curl -s -X DELETE http://localhost:3100/v1/admin/wallet-apps/<app-uuid> \
  -H 'X-Master-Password: <password>'
```

**Response (200):**
```json
{"ok": true}
```

Error: `WALLET_APP_NOT_FOUND` (404) if the app ID does not exist.

---

## 9. Error Reference

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
| `WALLET_APP_DUPLICATE`   | 409  | Wallet app with the same name already exists.   |
| `WALLET_APP_NOT_FOUND`   | 404  | Wallet app not found by ID.                     |
| `WEBHOOK_NOT_FOUND`      | 404  | Webhook not found by ID.                        |
| `RULE_NOT_FOUND`         | 404  | AutoStop rule not found by ID.                  |
| `BACKUP_CORRUPTED`       | 500  | Backup archive corrupted or VACUUM INTO failed. |
| `SIMULATION_FAILED`      | 400  | Transaction simulation failed (see also transactions.skill.md). |

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

## 10. Audit Logs (v30.2)

### GET /v1/audit-logs -- Query Audit Logs (masterAuth)

Query system audit logs with cursor-based pagination and 6 filters.

```bash
curl -s 'http://localhost:3100/v1/audit-logs?event_type=TX_FAILED&severity=warning&limit=50' \
  -H 'X-Master-Password: <password>'
```

**Query Parameters:**

| Parameter       | Type    | Required | Default | Description                                    |
| --------------- | ------- | -------- | ------- | ---------------------------------------------- |
| `wallet_id`     | string  | No       | --      | Filter by wallet ID.                           |
| `event_type`    | string  | No       | --      | Filter by event type (e.g., TX_FAILED).        |
| `severity`      | string  | No       | --      | Filter by severity (info/warning/critical).    |
| `from`          | integer | No       | --      | Start timestamp (epoch seconds).               |
| `to`            | integer | No       | --      | End timestamp (epoch seconds).                 |
| `tx_id`         | string  | No       | --      | Filter by transaction ID.                      |
| `cursor`        | string  | No       | --      | Cursor for next page.                          |
| `limit`         | integer | No       | 50      | Results per page (max 200).                    |
| `include_total` | boolean | No       | false   | Include total count in response.               |

**Response (200):**
```json
{
  "logs": [
    {
      "id": "<uuid>",
      "event_type": "TX_FAILED",
      "actor": "session:abc",
      "wallet_id": "<uuid>",
      "session_id": "<uuid>",
      "tx_id": "<uuid>",
      "details": {"error": "Simulation failed"},
      "severity": "warning",
      "ip_address": "127.0.0.1",
      "timestamp": 1707000000
    }
  ],
  "cursor": "next-cursor-value",
  "total": 142
}
```

**20 Event Types:** WALLET_CREATED, WALLET_SUSPENDED, SESSION_CREATED, SESSION_REVOKED, TX_SUBMITTED, TX_CONFIRMED, TX_FAILED, POLICY_DENIED, KILL_SWITCH_RECOVERED, MASTER_AUTH_FAILED, OWNER_REGISTERED, WALLET_TERMINATED, SESSION_RENEWED, TX_CANCELLED, KILL_SWITCH_ACTIVATED, OWNER_UNREGISTERED, BACKUP_CREATED, BACKUP_RESTORED, WEBHOOK_CREATED, WEBHOOK_DELETED

---

## 11. Encrypted Backup (v30.2)

### POST /v1/admin/backup -- Create Encrypted Backup (masterAuth)

Create an AES-256-GCM encrypted backup archive of DB + config + keystore.

```bash
curl -s -X POST http://localhost:3100/v1/admin/backup \
  -H 'X-Master-Password: <password>'
```

**Response (200):**
```json
{
  "path": "/data/backups/waiaas-backup-20260303-143000000.wbk",
  "filename": "waiaas-backup-20260303-143000000.wbk",
  "size": 524288,
  "created_at": "2026-03-03T14:30:00.000Z",
  "daemon_version": "3.0.0-rc.1",
  "schema_version": 37,
  "file_count": 3
}
```

### GET /v1/admin/backups -- List Backups (masterAuth)

List all backup files in the backup directory.

```bash
curl -s http://localhost:3100/v1/admin/backups \
  -H 'X-Master-Password: <password>'
```

**Response (200):**
```json
{
  "backups": [
    {
      "path": "/data/backups/waiaas-backup-20260303-143000000.wbk",
      "filename": "waiaas-backup-20260303-143000000.wbk",
      "size": 524288,
      "created_at": "2026-03-03T14:30:00.000Z",
      "daemon_version": "3.0.0-rc.1",
      "schema_version": 37,
      "file_count": 3
    }
  ]
}
```

**CLI Commands:**

| Command | Description |
|---------|-------------|
| `waiaas backup` | Create backup (prompts for master password) |
| `waiaas backup list` | List backups |
| `waiaas backup inspect <path>` | Inspect backup metadata |
| `waiaas restore --from <path>` | Restore from backup (daemon must be stopped) |

---

## 12. Webhooks (v30.2)

### POST /v1/webhooks -- Register Webhook (masterAuth)

Register a webhook endpoint. Returns the HMAC secret once (not stored in plaintext).

```bash
curl -s -X POST http://localhost:3100/v1/webhooks \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{"url": "https://example.com/webhook", "events": ["tx.confirmed", "tx.failed"]}'
```

**Request body:**

| Field    | Type     | Required | Description                           |
| -------- | -------- | -------- | ------------------------------------- |
| `url`    | string   | Yes      | Webhook endpoint URL (HTTPS).         |
| `events` | string[] | Yes      | Event types to subscribe to.          |

**Response (201):**
```json
{
  "id": "<uuid>",
  "url": "https://example.com/webhook",
  "events": ["tx.confirmed", "tx.failed"],
  "secret": "a1b2c3...64-char-hex",
  "created_at": 1707000000
}
```

**Webhook Headers:**

| Header | Description |
|--------|-------------|
| `X-WAIaaS-Signature` | HMAC-SHA256 signature of the payload |
| `X-WAIaaS-Event` | Event type (e.g., `tx.confirmed`) |
| `X-WAIaaS-Delivery` | Unique delivery ID (UUID) |
| `X-WAIaaS-Timestamp` | Delivery timestamp (epoch seconds) |

**Retry Policy:** Max 4 attempts, exponential backoff (0/1s/2s/4s), 10s timeout. 4xx responses stop retries immediately.

### GET /v1/webhooks -- List Webhooks (masterAuth)

List all registered webhooks. Secrets are NOT exposed.

```bash
curl -s http://localhost:3100/v1/webhooks \
  -H 'X-Master-Password: <password>'
```

### DELETE /v1/webhooks/:id -- Delete Webhook (masterAuth)

Delete a webhook and CASCADE delete its delivery logs.

```bash
curl -s -X DELETE http://localhost:3100/v1/webhooks/<webhook-uuid> \
  -H 'X-Master-Password: <password>'
```

### GET /v1/webhooks/:id/logs -- Query Delivery History (masterAuth)

Query webhook delivery logs with optional filters.

```bash
curl -s 'http://localhost:3100/v1/webhooks/<webhook-uuid>/logs?status=failed&limit=50' \
  -H 'X-Master-Password: <password>'
```

**Query Parameters:**

| Parameter    | Type    | Required | Default | Description                        |
| ------------ | ------- | -------- | ------- | ---------------------------------- |
| `status`     | string  | No       | --      | Filter by status (success/failed). |
| `event_type` | string  | No       | --      | Filter by event type.              |
| `limit`      | integer | No       | 50      | Results per page (max 200).        |

---

## 13. Admin Stats (v30.2)

### GET /v1/admin/stats -- Operational Statistics (masterAuth)

Returns 7 categories of operational statistics with 1-minute TTL cache.

```bash
curl -s http://localhost:3100/v1/admin/stats \
  -H 'X-Master-Password: <password>'
```

**Response (200):**
```json
{
  "transactions": {
    "total": 1234,
    "confirmed": 1200,
    "failed": 34,
    "pending": 0,
    "submitted": 10,
    "failed_24h": 5
  },
  "sessions": {
    "total": 50,
    "active": 12,
    "revoked": 38
  },
  "wallets": {
    "total": 8,
    "active": 6,
    "suspended": 1,
    "terminated": 1
  },
  "rpc": {
    "calls": 5000,
    "errors": 23,
    "avgLatencyMs": 145
  },
  "autostop": {
    "enabled": true,
    "triggered": 2,
    "rules": [
      {"id": "consecutive-failures", "enabled": true, "trackedCount": 3},
      {"id": "unusual-activity", "enabled": true, "trackedCount": 5},
      {"id": "idle-timeout", "enabled": true, "trackedCount": 2}
    ]
  },
  "notifications": {
    "total": 300,
    "sent": 290,
    "failed": 10
  },
  "system": {
    "uptimeSeconds": 86400,
    "version": "3.0.0-rc.1",
    "schemaVersion": 37,
    "dbSizeBytes": 1048576,
    "nodeVersion": "22.0.0"
  }
}
```

---

## 14. AutoStop Rules (v30.2)

### GET /v1/admin/autostop/rules -- List AutoStop Rules (masterAuth)

Returns all registered AutoStop rules with their status and configuration.

```bash
curl -s http://localhost:3100/v1/admin/autostop/rules \
  -H 'X-Master-Password: <password>'
```

**Response (200):**
```json
{
  "rules": [
    {
      "id": "consecutive-failures",
      "name": "Consecutive Failures",
      "description": "Suspend wallet after N consecutive transaction failures",
      "enabled": true,
      "config": {"threshold": 5},
      "status": {"trackedCount": 3}
    },
    {
      "id": "unusual-activity",
      "name": "Unusual Activity",
      "description": "Suspend wallet on high-frequency activity",
      "enabled": true,
      "config": {"threshold": 20, "windowSec": 300},
      "status": {"trackedCount": 5}
    },
    {
      "id": "idle-timeout",
      "name": "Idle Timeout",
      "description": "Notify on idle sessions",
      "enabled": true,
      "config": {"idleTimeoutSec": 3600},
      "status": {"trackedCount": 2}
    }
  ]
}
```

### PUT /v1/admin/autostop/rules/:id -- Update Rule Config (masterAuth)

Update enabled status and/or configuration of a specific AutoStop rule.

```bash
curl -s -X PUT http://localhost:3100/v1/admin/autostop/rules/consecutive-failures \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{"enabled": true, "config": {"threshold": 10}}'
```

**Request body:**

| Field    | Type    | Required | Description                          |
| -------- | ------- | -------- | ------------------------------------ |
| `enabled`| boolean | No       | Enable/disable the rule.             |
| `config` | object  | No       | Rule-specific configuration update.  |

**Response (200):**
```json
{
  "id": "consecutive-failures",
  "name": "Consecutive Failures",
  "enabled": true,
  "config": {"threshold": 10},
  "status": {"trackedCount": 3}
}
```

---

## 15. ERC-8004 / Agent Identity Settings

ERC-8004 Trustless Agent settings (under `actions.*` namespace). Configure via Admin UI > Agent Identity (route: `#/agent-identity`), or via the Settings API.

| Setting Key | Type | Default | Description |
| ----------- | ---- | ------- | ----------- |
| `actions.erc8004_agent_enabled` | boolean | `true` | Master feature gate. Enabled by default since v30.11. Set to false to disable ERC-8004 agent identity, reputation, and validation features. |
| `actions.erc8004_identity_registry_address` | string | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | Identity Registry contract address (Ethereum mainnet). |
| `actions.erc8004_reputation_registry_address` | string | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` | Reputation Registry contract address (Ethereum mainnet). |
| `actions.erc8004_validation_registry_address` | string | (empty) | Validation Registry address. Empty = validation feature disabled. |
| `actions.erc8004_registration_file_base_url` | string | (empty) | Base URL for hosting agent registration files. Auto-detected from request Host header if empty. |
| `actions.erc8004_auto_publish_registration` | boolean | `true` | Automatically generate and serve registration files for registered agents. |
| `actions.erc8004_reputation_cache_ttl_sec` | number | `300` | Reputation data cache TTL in seconds. Balances freshness vs. RPC load. |
| `actions.erc8004_min_reputation_score` | number | `0` | Global minimum reputation score threshold. |
| `actions.erc8004_reputation_rpc_timeout_ms` | number | `3000` | RPC call timeout for reputation queries in milliseconds. On timeout, the agent is treated as unrated. |

For full ERC-8004 documentation, see **erc8004.skill.md**.

### Action Tier Override (v30.11)

Operators can override the default security tier for individual actions via Admin Settings. This allows fine-grained control over which actions require instant execution, notification, delay, or owner approval.

**Setting key pattern:** `actions.{provider_key}_{action_name}_tier`

**Allowed values:** `INSTANT`, `NOTIFY`, `DELAY`, `APPROVAL` (Zod enum). Empty string or unset = use provider hardcoded default.

**Examples:**
- `actions.jupiter_swap_swap_tier` -- Override tier for Jupiter swap action
- `actions.erc8004_agent_register_agent_tier` -- Override tier for ERC-8004 agent registration
- `actions.lido_staking_stake_tier` -- Override tier for Lido staking

**Pipeline behavior:** `effectiveTier = max(policyTier, actionTier)` -- the action tier is a floor that can only escalate the security level, never downgrade it. For example, if a SPENDING_LIMIT policy assigns NOTIFY but the action tier override is DELAY, the effective tier is DELAY. If the policy assigns APPROVAL, it remains APPROVAL regardless of action tier.

**Configuration:**
- Admin UI > DeFi (route: `#/defi`) -- tier dropdown in Registered Actions table for DeFi providers
- Admin UI > Agent Identity (route: `#/agent-identity`) -- tier dropdown for ERC-8004 actions
- Settings API: `PUT /v1/admin/settings` with the tier key pattern above
- Visual indicators: "customized" badge on overridden tiers, "Reset to default" button to restore provider defaults

---

## 16. Smart Account Lite Mode

Create Smart Account wallets without a bundler provider for platform-sponsored gas:

```bash
curl -s -X POST http://localhost:3100/v1/wallets \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: your-master-password' \
  -d '{"name": "lite-wallet", "chain": "ethereum", "environment": "testnet", "accountType": "smart"}'
```

No `aaProvider` field = **Lite mode**. The wallet can use `userop/build` and `userop/sign` endpoints for building and signing UserOperations. The platform fills gas/paymaster fields and submits to a bundler externally.

Add a provider later with `PUT /v1/wallets/{id}/provider` to enable **Full mode** (automatic bundler submission via `POST /v1/transactions/send`).

In Admin UI, the wallet create form defaults to **None (Lite mode)** for the Provider dropdown. Lite/Full mode is shown as badges in the wallet list and detail pages.

## 17. Hyperliquid Settings

Hyperliquid Perp Trading settings under the `actions` category:

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `actions.hyperliquid_enabled` | boolean | `false` | Enable Hyperliquid Perp trading |
| `actions.hyperliquid_network` | string | `mainnet` | `mainnet` or `testnet` |
| `actions.hyperliquid_api_url` | string | `` | Custom API URL (overrides network default) |
| `actions.hyperliquid_rate_limit_weight_per_min` | number | `600` | Rate limit weight per minute (Hyperliquid max: 1200) |
| `actions.hyperliquid_default_leverage` | number | `1` | Default leverage for new positions |
| `actions.hyperliquid_default_margin_mode` | string | `CROSS` | Default margin mode: `CROSS` or `ISOLATED` |
| `actions.hyperliquid_builder_address` | string | `` | Builder fee recipient address |
| `actions.hyperliquid_builder_fee` | number | `0` | Builder fee in basis points |
| `actions.hyperliquid_order_status_poll_interval_ms` | number | `2000` | Order status polling interval |

```bash
# Enable Hyperliquid and set default leverage to 3x
curl -X PUT http://localhost:3100/v1/admin/settings \
  -H "X-Master-Password: $PASS" \
  -H "Content-Type: application/json" \
  -d '{"settings":{"actions.hyperliquid_enabled":"true","actions.hyperliquid_default_leverage":"3"}}'

# Switch to testnet
curl -X PUT http://localhost:3100/v1/admin/settings \
  -H "X-Master-Password: $PASS" \
  -H "Content-Type: application/json" \
  -d '{"settings":{"actions.hyperliquid_network":"testnet"}}'
```

Admin UI: DeFi > Hyperliquid > Settings tab provides a form editor for all runtime keys.

## 18. Related Skill Files

- **actions.skill.md** -- Action Provider REST API (DeFi actions)
- **policies.skill.md** -- Policy management (14 policy types for transaction controls)
- **wallet.skill.md** -- Wallet CRUD, sessions, assets, tokens, MCP
- **transactions.skill.md** -- 5-type transaction reference
- **erc8128.skill.md** -- ERC-8128 HTTP message signing (RFC 9421 + EIP-191)
- **quickstart.skill.md** -- End-to-end quickstart workflow
- **erc8004.skill.md** -- ERC-8004 trustless agent identity and reputation
