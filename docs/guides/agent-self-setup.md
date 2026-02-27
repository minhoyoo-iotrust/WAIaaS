# Agent Self-Setup Guide

This guide describes how an autonomous AI agent can set up WAIaaS from scratch with zero human interaction using the **auto-provision** mode.

## Prerequisites

- **Node.js 22 LTS** or later
- **npm** package manager (bundled with Node.js)
- No existing WAIaaS installation (first-time setup)

## Auto-Provision Setup

### 1. Install CLI

```bash
npm install -g @waiaas/cli
```

### 2. Initialize with Auto-Provision

```bash
waiaas init --auto-provision
```

This creates the data directory (`~/.waiaas/`) with:

- `config.toml` -- default configuration with auto-generated master password hash
- `recovery.key` -- plaintext master password for autonomous access

The `--auto-provision` flag generates a cryptographically random master password, hashes it with Argon2id, and stores the hash in config.toml. The plaintext password is saved to `recovery.key` so that subsequent CLI commands can authenticate without human input.

### 3. Start Daemon

```bash
waiaas start
```

The daemon starts immediately using the auto-provisioned password. No interactive password prompt.

Verify:

```bash
curl -s http://localhost:3100/health
```

### 4. Create Wallets and Session

```bash
waiaas quickset
```

This reads the master password from `recovery.key` automatically and creates:

1. Solana + EVM wallets
2. Session tokens (`wai_sess_...`)
3. MCP configuration JSON

Capture the session token from the output:

```bash
export WAIAAS_BASE_URL=http://localhost:3100
export WAIAAS_SESSION_TOKEN=<token-from-quickset>
```

### 5. Verify Connection

```bash
curl -s http://localhost:3100/v1/connect-info \
  -H "Authorization: Bearer $WAIAAS_SESSION_TOKEN"
```

This returns accessible wallets, policies, capabilities, and an AI-ready usage prompt.

## Post-Setup Configuration

After the daemon is running and wallets are created, configure additional settings via the Admin Settings API:

### Set Up Notifications

```bash
# Read the recovery key for masterAuth
MASTER_PW=$(cat ~/.waiaas/recovery.key)

# Configure Telegram notifications
curl -s -X PUT http://localhost:3100/v1/admin/settings \
  -H "Content-Type: application/json" \
  -H "X-Master-Password: ${MASTER_PW}" \
  -d '{"settings":[
    {"key":"notifications.telegram_bot_token","value":"<bot-token>"},
    {"key":"notifications.telegram_chat_id","value":"<chat-id>"},
    {"key":"notifications.enabled","value":"true"}
  ]}'
```

### Configure Spending Policies

Use the session token to check current policies, then have the operator configure limits via Admin UI or REST API.

## Password Hardening

**IMPORTANT:** The `recovery.key` file contains the master password in plaintext. After initial setup, the operator should:

1. Change the master password to a strong human-chosen value:

```bash
waiaas set-master
```

This prompts for:
- Current password (enter the value from `recovery.key`)
- New password (strong, human-chosen)
- Confirmation

2. Delete the recovery key:

```bash
rm ~/.waiaas/recovery.key
```

3. Alternatively, use the REST API:

```bash
curl -s -X PUT http://localhost:3100/v1/admin/master-password \
  -H "Content-Type: application/json" \
  -H "X-Master-Password: $(cat ~/.waiaas/recovery.key)" \
  -d '{"newPassword": "<new-strong-password>"}'
```

After hardening, the daemon operates with the new password and `recovery.key` is no longer needed.

## Docker Setup

For Docker deployments, set `WAIAAS_AUTO_PROVISION=true` to enable auto-provisioning on first start:

```yaml
services:
  daemon:
    image: ghcr.io/minho-yoo/waiaas:latest
    container_name: waiaas-daemon
    ports:
      - "127.0.0.1:3100:3100"
    volumes:
      - waiaas-data:/data
    environment:
      - WAIAAS_AUTO_PROVISION=true
      - WAIAAS_DATA_DIR=/data
      - WAIAAS_DAEMON_HOSTNAME=0.0.0.0
    restart: unless-stopped

volumes:
  waiaas-data:
    driver: local
```

On first start (when `/data/config.toml` does not exist), the entrypoint runs `waiaas init --auto-provision` automatically. The recovery key is saved to `/data/recovery.key` inside the volume.

Retrieve the recovery key:

```bash
docker compose exec daemon cat /data/recovery.key
```

Then run quickset:

```bash
docker compose exec daemon node /app/packages/cli/dist/index.js quickset
```

## Complete Autonomous Flow

Summary of the full zero-touch setup:

```bash
# 1. Install
npm install -g @waiaas/cli

# 2. Auto-provision (generates password, saves to recovery.key)
waiaas init --auto-provision

# 3. Start daemon (no password prompt)
waiaas start

# 4. Create wallets + sessions (reads recovery.key automatically)
waiaas quickset

# 5. (Later) Harden password and delete recovery key
waiaas set-master
rm ~/.waiaas/recovery.key
```

## See Also

- [Deployment Guide](../deployment.md) -- Full deployment reference (npm + Docker)
- [Agent Skills Integration](agent-skills-integration.md) -- Install skill files for AI agents
- [Claude Code Integration](claude-code-integration.md) -- Claude Code specific setup
- [OpenClaw Integration](openclaw-integration.md) -- OpenClaw specific setup
