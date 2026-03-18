---
title: "@waiaas/openclaw-plugin — WAIaaS Tools for OpenClaw AI Agents"
description: "Install @waiaas/openclaw-plugin to give OpenClaw AI agents 17 wallet tools: send crypto, query balances, DeFi swaps, NFT transfers. No master password required."
date: "2026-03-18"
section: "blog"
slug: "openclaw-plugin"
category: "SEO Landing"
keywords: "openclaw plugin waiaas, AI agent wallet tools, openclaw wallet integration, crypto tools AI agent"
---

# @waiaas/openclaw-plugin

The official WAIaaS plugin for [OpenClaw](https://openclaw.io) AI agents. Registers 17 sessionAuth wallet tools at startup — send crypto, check balances, execute DeFi swaps, transfer NFTs, and more. No master password, no admin tools.

---

## What It Does

`@waiaas/openclaw-plugin` connects the [WAIaaS](https://github.com/waiaas/waiaas) self-hosted wallet daemon to OpenClaw's tool registry. When OpenClaw starts, the plugin calls `register()` and makes 17 wallet tools immediately available to your AI agent.

All tools use session token authentication. The master password never leaves the daemon.

---

## Installation

```bash
npm install @waiaas/openclaw-plugin
```

**Requirements:**
- OpenClaw agent framework
- WAIaaS daemon running locally (`waiaas start`)
- A WAIaaS session token (created via Admin UI or `waiaas session create`)

---

## Configuration

Add to `~/.openclaw/openclaw.config.json`:

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

That's it. The 17 tools are registered automatically on the next OpenClaw startup.

---

## Available Tools

| Group | Count | Tools |
|-------|-------|-------|
| **Wallet** | 3 | `get_wallet`, `list_wallets`, `get_balance` |
| **Transfer** | 3 | `send_transfer`, `send_token_transfer`, `get_transaction_status` |
| **DeFi** | 3 | `defi_swap`, `defi_stake`, `defi_positions` |
| **NFT** | 2 | `get_nft_collection`, `transfer_nft` |
| **Utility** | 6 | `get_connect_info`, `estimate_gas`, `get_token_info`, `sign_message`, `get_network_status`, `dry_run_transaction` |

**Total: 17 tools across 5 groups.**

All tools are sessionAuth-only. No admin, setup, or kill-switch tools are exposed to the agent.

---

## Why Plugin Over Skill Files

| Feature | Plugin (`@waiaas/openclaw-plugin`) | Skills (`@waiaas/skills openclaw`) |
|---------|-----------------------------------|-------------------------------------|
| Installation | `npm install` | `npx @waiaas/skills openclaw` |
| Updates | `npm update` | Re-run npx command |
| Type safety | TypeScript types included | Markdown skill files |
| Tool count | 17 (auto-registered) | 6 skill files (agent discovers) |
| Attack surface | sessionAuth only | sessionAuth only |
| File management | None | `~/.openclaw/skills/` directory |

For new setups, the plugin method is recommended. The skill method remains available for backward compatibility.

---

## How It Works

The plugin exports a `register(api)` function. OpenClaw calls this function at startup, passing the tool registry API. The function calls `api.registerTool()` once per tool with the tool name, description, JSON Schema input spec, and handler function.

Each handler creates a `WAIaaSClient` instance (from `@waiaas/sdk`) using the configured `daemonUrl` and `sessionToken`, then calls the appropriate SDK method.

```typescript
import { register } from '@waiaas/openclaw-plugin';

// OpenClaw calls this automatically:
register(api, {
  daemonUrl: 'http://localhost:3100',
  sessionToken: 'your-token'
});
```

---

## Requirements

| Requirement | Minimum version |
|-------------|-----------------|
| Node.js | 20.x |
| OpenClaw | Any version supporting plugins |
| WAIaaS daemon | 2.11.0+ |
| `@waiaas/sdk` | 2.11.0+ (peer dependency) |

---

## Security

- Session tokens scope agent access to specific wallets and operations
- The master password is never used by the agent; only admins need it
- Policy engine enforces spending limits, token allowlists, and rate limits
- All tool calls are logged in the daemon audit trail

---

## Links

- [OpenClaw Integration Guide](/blog/openclaw-integration/) — Full integration guide with skill method comparison
- [WAIaaS GitHub](https://github.com/waiaas/waiaas) — Source code and documentation
- [npm: @waiaas/openclaw-plugin](https://www.npmjs.com/package/@waiaas/openclaw-plugin) — npm package
