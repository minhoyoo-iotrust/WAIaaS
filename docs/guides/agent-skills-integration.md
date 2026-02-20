# Agent Skills Integration Guide

This guide walks you through installing WAIaaS skill files using the [Agent Skills](https://agentskills.io) open standard. This format is compatible with 27+ AI agent platforms.

## What is Agent Skills?

Agent Skills is an open standard for AI agent capability files. Platforms that support it automatically discover `.skill.md` or `SKILL.md` files in designated directories and make them available to AI agents.

## Supported Platforms

| Platform | Skills Directory | Status |
|----------|-----------------|--------|
| OpenAI Codex | `.agents/skills/` | Supported |
| Gemini CLI | `.agents/skills/` | Supported |
| Goose | `.agents/skills/` | Supported |
| Amp | `.agents/skills/` | Supported |
| Roo Code | `.agents/skills/` | Supported |
| Cursor | `.cursor/skills/` | Supported (`--target cursor`) |
| GitHub Copilot | `.github/skills/` | Supported (`--target github`) |
| Claude Code | `.claude/skills/` | Use `npx @waiaas/skills claude-code` instead |
| OpenClaw | `~/.openclaw/skills/` | Use `npx @waiaas/skills openclaw` instead |

## Prerequisites

- WAIaaS daemon installed and running (`npx @waiaas/daemon` or `waiaas start`)
- An AI agent platform that supports Agent Skills

## Quick Setup

### 1. Create Wallets and Sessions

```bash
waiaas quickset
```

This creates Solana + EVM wallets in mainnet mode and prints session tokens.

### 2. Install WAIaaS Skills

**Default (Codex, Gemini CLI, Goose, Amp):**

```bash
npx @waiaas/skills agent-skills
```

Installs to `.agents/skills/waiaas-*/SKILL.md`.

**Cursor:**

```bash
npx @waiaas/skills agent-skills --target cursor
```

Installs to `.cursor/skills/waiaas-*/SKILL.md`.

**GitHub Copilot:**

```bash
npx @waiaas/skills agent-skills --target github
```

Installs to `.github/skills/waiaas-*/SKILL.md`.

### 3. Configure Environment Variables

Set these environment variables for your AI agent:

```bash
export WAIAAS_BASE_URL=http://localhost:3100
export WAIAAS_MASTER_PASSWORD=<your-master-password>
export WAIAAS_SESSION_TOKEN=<your-session-token>
```

Replace the placeholder values with the credentials from step 1.

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

## Dedicated Guides

For platform-specific setup with additional features:

- **Claude Code**: See [Claude Code Integration Guide](claude-code-integration.md) -- includes MCP server integration
- **OpenClaw**: See [OpenClaw Integration Guide](openclaw-integration.md) -- includes `openclaw.json` configuration

## Updating Skills

To update to the latest skill files:

```bash
npx @waiaas/skills agent-skills --force
```

## Troubleshooting

### Skills not detected

Verify the skill files are in the correct directory for your platform:

```bash
# Default (Codex, Gemini CLI, Goose, Amp)
ls .agents/skills/waiaas-*/SKILL.md

# Cursor
ls .cursor/skills/waiaas-*/SKILL.md

# GitHub Copilot
ls .github/skills/waiaas-*/SKILL.md
```

### Connection refused

Make sure the WAIaaS daemon is running:

```bash
curl http://localhost:3100/health
```

If not running:

```bash
waiaas start
```
