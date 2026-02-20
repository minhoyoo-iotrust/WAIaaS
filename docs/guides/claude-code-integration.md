# Claude Code Integration Guide

This guide walks you through connecting WAIaaS to [Claude Code](https://claude.ai/claude-code), Anthropic's official CLI for Claude. WAIaaS provides two integration methods: skill files and MCP server.

## Prerequisites

- WAIaaS daemon installed and running (`npx @waiaas/daemon` or `waiaas start`)
- Claude Code installed (`npm install -g @anthropic-ai/claude-code`)

## Quick Setup

### 1. Create Wallets and Sessions

```bash
waiaas quickset
```

This creates Solana + EVM wallets in mainnet mode and prints session tokens and MCP configuration.

### 2. Install WAIaaS Skills

```bash
npx @waiaas/skills claude-code
```

This installs 7 WAIaaS skill files to `.claude/skills/` in your project directory:

```
.claude/skills/
  waiaas-quickstart/SKILL.md
  waiaas-wallet/SKILL.md
  waiaas-transactions/SKILL.md
  waiaas-policies/SKILL.md
  waiaas-admin/SKILL.md
  waiaas-actions/SKILL.md
  waiaas-x402/SKILL.md
```

### 3. Use in Claude Code

Claude Code automatically discovers skills in `.claude/skills/`. You can:

- Use slash commands: `/waiaas-quickstart`, `/waiaas-wallet`, etc.
- Or simply ask Claude Code about WAIaaS and it will reference the relevant skill

## MCP Integration (Alternative)

For direct tool access (18 MCP tools), connect WAIaaS as an MCP server:

```bash
waiaas mcp setup
```

This writes the MCP configuration to your Claude Desktop config. Claude Code can then use WAIaaS tools directly (e.g., `get_balance`, `send_transaction`).

The MCP server includes a `connect_info` tool that returns all accessible wallets, policies, and capabilities. Call it first to understand your environment. No `WAIAAS_WALLET_ID` environment variable is needed -- the agent discovers wallets via connect-info.

## Skills vs MCP

| Feature | Skills | MCP |
|---------|--------|-----|
| Setup | `npx @waiaas/skills claude-code` | `waiaas mcp setup` |
| How it works | Claude reads skill docs and uses `curl` | Claude calls MCP tools directly |
| Tools available | All REST API endpoints via curl | 18 dedicated MCP tools |
| Auth | Manual header setup per request | Automatic (token file) |
| Best for | Learning the API, custom workflows | Production use, automated agents |

You can use both simultaneously. Skills provide comprehensive API documentation while MCP provides streamlined tool access.

## Available Skills

| Skill | Description |
|-------|-------------|
| `waiaas-quickstart` | End-to-end quickset: create wallet, session, check balance, send first transfer |
| `waiaas-wallet` | Wallet CRUD, asset queries, session management, token registry, MCP provisioning |
| `waiaas-transactions` | All 5 transaction types (TRANSFER, TOKEN_TRANSFER, CONTRACT_CALL, APPROVE, BATCH) |
| `waiaas-policies` | Policy engine: 12 policy types for spending limits, whitelists, rate limits |
| `waiaas-admin` | Admin API: daemon status, kill switch, notifications, settings management |
| `waiaas-actions` | Action Provider framework: DeFi actions through the transaction pipeline |
| `waiaas-x402` | x402 auto-payment protocol: fetch URLs with automatic cryptocurrency payments |

## Updating Skills

To update to the latest skill files:

```bash
npx @waiaas/skills claude-code --force
```

## Troubleshooting

### Skills not detected by Claude Code

Verify the skill files are in the correct location:

```bash
ls .claude/skills/waiaas-*/SKILL.md
```

Make sure you are running Claude Code from the project root where `.claude/skills/` was created.

### Connection refused

Make sure the WAIaaS daemon is running:

```bash
curl http://localhost:3100/health
```

### MCP connection issues

If using MCP integration, verify the setup:

```bash
waiaas mcp setup --check
```
