---
title: "OpenClaw Integration Guide"
description: "Connect WAIaaS to OpenClaw AI agent framework. Plugin method (recommended) and skill method (legacy)."
date: "2026-03-18"
section: "blog"
slug: "openclaw-integration"
category: "Guides"
---
# OpenClaw Integration Guide

> **Security notice:** AI agents must NEVER request the master password. Use only your session token.

This guide walks you through connecting WAIaaS to [OpenClaw](https://openclaw.io), an open-source AI agent framework that follows the Agent Skills open standard.

Two integration methods are available:

| Method | When to use |
|--------|-------------|
| **Plugin** (recommended) | New setups — automatic tool registration, type-safe, sessionAuth only |
| **Skill** (legacy) | Existing skill-file setups or when plugin is unavailable |

---

## Plugin Method (Recommended)

The `@waiaas/openclaw-plugin` npm package registers 17 wallet tools directly into the OpenClaw tool registry at startup. No skill files to manage.

### 1. Install the plugin

```bash
npm install @waiaas/openclaw-plugin
```

### 2. Register in your OpenClaw config

Add the plugin to `~/.openclaw/openclaw.config.json` (or your project-level config):

```json
{
  "plugins": [
    {
      "name": "@waiaas/openclaw-plugin",
      "config": {
        "daemonUrl": "http://localhost:3100",
        "sessionToken": "<your-session-token>"
      }
    }
  ]
}
```

The plugin calls `register()` synchronously at startup and registers all 17 tools via `api.registerTool()`.

### 3. Available tools

| Group | Tools |
|-------|-------|
| **Wallet** (3) | `get_wallet`, `list_wallets`, `get_balance` |
| **Transfer** (3) | `send_transfer`, `send_token_transfer`, `get_transaction_status` |
| **DeFi** (3) | `defi_swap`, `defi_stake`, `defi_positions` |
| **NFT** (2) | `get_nft_collection`, `transfer_nft` |
| **Utility** (6) | `get_connect_info`, `estimate_gas`, `get_token_info`, `sign_message`, `get_network_status`, `dry_run_transaction` |

### 4. Why plugin over skills

- **Auto-update:** Plugin updates ship with npm, no manual file sync required
- **Type safety:** TypeScript types included, tool schemas validated at load time
- **Smaller attack surface:** Only sessionAuth tools registered; no admin/setup tools exposed
- **No file management:** No `~/.openclaw/skills/` directory to maintain

---

## Skill Method (Legacy)

If you prefer the traditional skill-file approach, use the `@waiaas/skills` CLI to install WAIaaS skill files for OpenClaw.

### 1. Install WAIaaS skills

```bash
npx @waiaas/skills openclaw
```

This installs 6 WAIaaS skill files to `~/.openclaw/skills/`:

```
~/.openclaw/skills/
  waiaas-quickstart/SKILL.md
  waiaas-wallet/SKILL.md
  waiaas-transactions/SKILL.md
  waiaas-policies/SKILL.md
  waiaas-actions/SKILL.md
  waiaas-x402/SKILL.md
```

### 2. Configure OpenClaw

Add the WAIaaS environment variables to your `~/.openclaw/openclaw.json`:

```json
{
  "skills": {
    "entries": {
      "waiaas-quickstart": {
        "env": {
          "WAIAAS_BASE_URL": "http://localhost:3100",
          "WAIAAS_SESSION_TOKEN": "<your-session-token>"
        }
      }
    }
  }
}
```

### 3. Update skills

To update to the latest skill files:

```bash
npx @waiaas/skills openclaw --force
```

---

## Authentication

Both methods use **session token authentication only**. The master password is never needed by the agent.

Obtain a session token from the WAIaaS Admin UI, or via the CLI:

```bash
waiaas session create --name "openclaw-agent"
```

The session token is scoped to the wallets and operations you configure in the Admin UI. See [Admin Manual](../admin-manual/README.md) for session and policy management.

---

## Agent Self-Discovery

On startup, the agent should call `GET /v1/connect-info` with the session token to discover available wallets, policies, and capabilities:

```bash
curl -s http://localhost:3100/v1/connect-info \
  -H 'Authorization: Bearer <session-token>'
```

This returns an AI-ready prompt describing the environment, eliminating the need for manual configuration.

---

## Verification

Ask OpenClaw to check your wallet balance:

> "Check my WAIaaS wallet balance"

OpenClaw will use the registered tools (plugin method) or the `waiaas-quickstart` skill (skill method) to query the daemon and return your balance.

---

## Troubleshooting

### Plugin tools not appearing

Verify the plugin is installed and the config path is correct:

```bash
node -e "const { register } = require('@waiaas/openclaw-plugin'); console.log(typeof register);"
```

Expected output: `function`

### Skills not detected by OpenClaw

Verify the skill files are in the correct location:

```bash
ls ~/.openclaw/skills/waiaas-*/SKILL.md
```

### Connection refused

Make sure the WAIaaS daemon is running:

```bash
curl http://localhost:3100/health
```

If not running, start it:

```bash
waiaas start
```

### Authentication errors

Check that your session token is correct. Verify with:

```bash
curl -H "Authorization: Bearer <session-token>" http://localhost:3100/v1/connect-info
```

---

## See Also

- [Admin Manual](../admin-manual/README.md) — Initial WAIaaS setup, wallet creation, session and policy management
- [Agent Self-Setup Guide](agent-self-setup.md) — Fully autonomous daemon setup with `waiaas init --auto-provision`
- [API Reference](/docs/api-reference/) — REST API documentation for direct integration
