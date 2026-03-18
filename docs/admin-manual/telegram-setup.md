---
title: "Telegram Bot Setup Guide"
description: "Configure WAIaaS Telegram bot for transaction alerts, security notifications, and interactive approve/reject signing"
keywords: ["telegram", "bot", "notifications", "signing", "approval"]
date: "2026-03-18"
section: "docs"
category: "Admin Manual"
---
# Telegram Bot Setup Guide

WAIaaS provides transaction alerts, security notifications, and interactive bot features (balance queries, transaction approve/reject, kill switch) through Telegram. This guide walks through the full flow from creating a bot with BotFather to connecting it with WAIaaS and managing bot users.

## Prerequisites

- Telegram app installed (mobile or desktop)
- WAIaaS daemon running (`waiaas start`)
- Master password available (required for Admin authentication)

## 1. Create a Bot with BotFather

1. Search for [@BotFather](https://t.me/BotFather) in Telegram and start a conversation.
2. Send `/newbot`.
3. Enter a display name for the bot (e.g., `My WAIaaS Bot`).
4. Enter a username. It must end with `_bot` (e.g., `my_waiaas_bot`).
5. BotFather will issue a **bot token** on success.

Token format:

```
123456789:ABCdefGHIjklMNOpqrsTUVwxyz
```

> **Warning:** The bot token is equivalent to a password. Never expose it in public repositories or chats.

## 2. Get Your Chat ID

After receiving the bot token, you need the Chat ID where notifications will be delivered.

### Private Chat

1. Search for your new bot in Telegram and start a conversation.
2. Send `/start`.
3. Open the following URL in a web browser:

```
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates
```

4. Copy the `chat.id` value from the JSON response:

```json
{
  "result": [{
    "message": {
      "chat": {
        "id": 123456789,
        "type": "private"
      }
    }
  }]
}
```

### Group Chat

To receive notifications in a group chat:

1. Add the bot to the group.
2. Send any message in the group.
3. Call the same `getUpdates` API -- the group's Chat ID will appear.

> Group Chat IDs are **negative** numbers (e.g., `-1001234567890`).

## 3. Connect to WAIaaS

With the bot token and Chat ID ready, configure WAIaaS using one of three methods.

### Method A: CLI (Recommended)

The simplest approach. Completes all settings in a single command.

```bash
waiaas notification setup \
  --bot-token "123456789:ABCdefGHIjklMNOpqrsTUVwxyz" \
  --chat-id "123456789" \
  --locale en \
  --test
```

Options:

| Option | Description | Default |
|--------|-------------|---------|
| `--bot-token <token>` | Telegram bot token | (interactive prompt) |
| `--chat-id <id>` | Telegram Chat ID | (interactive prompt) |
| `--locale <locale>` | Notification language (`en` / `ko`) | `en` |
| `--base-url <url>` | Daemon URL | `http://127.0.0.1:3100` |
| `--password <password>` | Master password | (env var or interactive prompt) |
| `--test` | Send a test notification after setup | `false` |

Omitted options will be prompted interactively.

The CLI internally sends 6 setting keys via `PUT /v1/admin/settings`:

- `notifications.enabled` = `true`
- `notifications.telegram_bot_token`
- `notifications.telegram_chat_id`
- `notifications.locale`
- `telegram.bot_token`
- `telegram.locale`

### Method B: Admin UI

1. Open the Admin UI in your browser (`http://localhost:3100/admin`).
2. Log in with the master password.
3. Navigate to **Notifications** > **Settings** tab.
4. In the **Telegram** section, enter:
   - **Telegram Bot Token**: your bot token
   - **Telegram Chat Id**: your Chat ID
5. Optionally configure a separate bot token and locale in the **Telegram Bot** subsection.
6. Enable the **Enabled** checkbox.
7. Click **Save**.
8. Click **Test Notification** to verify.

### Method C: REST API

```bash
curl -s -X PUT http://localhost:3100/v1/admin/settings \
  -H "Content-Type: application/json" \
  -H "X-Master-Password: <master-password>" \
  -d '{
    "settings": [
      { "key": "notifications.enabled", "value": "true" },
      { "key": "notifications.telegram_bot_token", "value": "<bot-token>" },
      { "key": "notifications.telegram_chat_id", "value": "<chat-id>" },
      { "key": "notifications.locale", "value": "en" },
      { "key": "telegram.bot_token", "value": "<bot-token>" },
      { "key": "telegram.locale", "value": "en" }
    ]
  }'
```

Send a test notification:

```bash
curl -s -X POST http://localhost:3100/v1/admin/notifications/test \
  -H "Content-Type: application/json" \
  -H "X-Master-Password: <master-password>" \
  -d '{ "channel": "telegram" }'
```

## 4. Verify Notifications

After setup, confirm that the test notification arrives in Telegram.

### Notification Event Categories

WAIaaS sends notifications for the following event categories:

| Category | Key Events |
|----------|-----------|
| Transaction | TX_SUBMITTED, TX_CONFIRMED, TX_FAILED, TX_CANCELLED, TX_INCOMING |
| Policy | POLICY_VIOLATION, CUMULATIVE_LIMIT_WARNING |
| Security | KILL_SWITCH_ACTIVATED, AUTO_STOP_TRIGGERED, TX_INCOMING_SUSPICIOUS |
| Session | SESSION_CREATED, SESSION_EXPIRED, SESSION_EXPIRING_SOON |
| Owner | OWNER_SET, OWNER_REMOVED, OWNER_VERIFIED |
| System | DAILY_SUMMARY, LOW_BALANCE, UPDATE_AVAILABLE |

> Security broadcast events (KILL_SWITCH_ACTIVATED, KILL_SWITCH_RECOVERED, AUTO_STOP_TRIGGERED, TX_INCOMING_SUSPICIOUS) are **always delivered** and bypass event filters.

### Event Filter Configuration

Select which events to receive in Admin UI under **Notifications** > **Settings** > **Event Filter**. All events are enabled by default.

## 5. Telegram Bot User Management

The WAIaaS Telegram Bot uses a **2-Tier authentication** model. Users must register and be approved before accessing bot commands.

### Registration Flow

1. A user sends `/start` to the bot and is registered with **PENDING** status.
2. An admin approves the user via the Admin UI, assigning a role.

### Approving Users in Admin UI

1. Navigate to **Notifications** > **Telegram Users** tab.
2. Click the **Approve** button next to a PENDING user.
3. Select a role:
   - **ADMIN**: Full access to all commands
   - **READONLY**: Read-only commands only
4. Click **Approve** to confirm.

To remove a user, click the **Delete** button. Deleted users must send `/start` again to re-register.

### Bot Commands and Role Permissions

| Command | Description | Required Role |
|---------|-------------|--------------|
| `/start` | Register with the bot (PENDING status) | PUBLIC |
| `/help` | Show available commands | PUBLIC |
| `/status` | Daemon status (uptime, wallet count, session count) | READONLY+ |
| `/wallets` | List all wallets | READONLY+ |
| `/pending` | List transactions awaiting approval | ADMIN |
| `/approve <txId>` | Approve a pending transaction | ADMIN |
| `/reject <txId>` | Reject a pending transaction | ADMIN |
| `/killswitch` | Activate kill switch (with confirmation dialog) | ADMIN |
| `/newsession` | Select a wallet and issue a new session token | ADMIN |

> The `/pending` command provides inline keyboard buttons (Approve / Reject / Cancel) for quick transaction handling.

## 6. Advanced Configuration

### Change Locale

Switch the notification message language (`en` or `ko`):

```bash
curl -s -X PUT http://localhost:3100/v1/admin/settings \
  -H "Content-Type: application/json" \
  -H "X-Master-Password: <master-password>" \
  -d '{
    "settings": [
      { "key": "notifications.locale", "value": "ko" },
      { "key": "telegram.locale", "value": "ko" }
    ]
  }'
```

Or change the Locale dropdown in Admin UI under **Notifications** > **Settings**.

### Adjust Rate Limit

Change the maximum notifications per minute (default: 20):

```bash
curl -s -X PUT http://localhost:3100/v1/admin/settings \
  -H "Content-Type: application/json" \
  -H "X-Master-Password: <master-password>" \
  -d '{
    "settings": [
      { "key": "notifications.rate_limit_rpm", "value": "30" }
    ]
  }'
```

### Separate Bot Tokens

You can use different bots for the notification channel and the interactive bot:

- `notifications.telegram_bot_token` -- notification delivery only
- `telegram.bot_token` -- interactive bot only (uses the notification token if left empty)

## Troubleshooting

### Invalid Bot Token

**Symptom:** `Telegram API error: 401` or authentication errors during setup.

**Resolution:**
1. Verify the token with BotFather (`/mybots` > select bot > API Token).
2. Ensure the token contains no extra whitespace or line breaks.
3. Revoke and reissue the token via BotFather (`/revoke`).

### Chat ID Mismatch

**Symptom:** Setup succeeds but no notifications arrive.

**Resolution:**
1. Re-check via `https://api.telegram.org/bot<TOKEN>/getUpdates`.
2. Confirm you have sent `/start` to the bot (bots cannot initiate conversations).
3. For group chats, verify the Chat ID is a negative number.

### Notifications Not Received

**Symptom:** Test notifications work but real event notifications do not arrive.

**Resolution:**
1. Verify `notifications.enabled` is `true`.
2. Check that the relevant events are enabled in **Notifications** > **Settings** > **Event Filter**.
3. Confirm you are not hitting the rate limit (default: 20 per minute).
4. Check the Delivery Log in **Notifications** > **Channels & Logs** tab.

### Bot Commands Not Responding

**Symptom:** The bot does not respond to `/status`, `/wallets`, or other commands.

**Resolution:**
1. Check if the user is still in PENDING status -- approval is required in Admin UI.
2. Verify a READONLY user is not trying ADMIN-only commands.
3. Check daemon logs for `Telegram Bot: fatal API error` messages.

## See Also

- [Deployment Guide](../deployment.md) -- Full deployment reference (npm + Docker)
- [Agent Self-Setup Guide](../guides/agent-self-setup.md) -- Autonomous agent provisioning
