# OpenClaw Integration Guide

This guide walks you through connecting WAIaaS to [OpenClaw](https://openclaw.io), an open-source AI agent bot that follows the Agent Skills open standard.

## Prerequisites

- WAIaaS daemon installed and running (`npx @waiaas/daemon` or `waiaas start`)
- OpenClaw installed and configured

## Quick Setup

### 1. Create Wallets and Sessions

```bash
waiaas quickset
```

This creates Solana + EVM wallets in mainnet mode and prints session tokens and MCP configuration.

For testnet mode:

```bash
waiaas quickset --mode testnet
```

### 2. Install WAIaaS Skills

```bash
npx @waiaas/skills openclaw
```

This installs 7 WAIaaS skill files to `~/.openclaw/skills/`:

```
~/.openclaw/skills/
  waiaas-quickstart/SKILL.md
  waiaas-wallet/SKILL.md
  waiaas-transactions/SKILL.md
  waiaas-policies/SKILL.md
  waiaas-admin/SKILL.md
  waiaas-actions/SKILL.md
  waiaas-x402/SKILL.md
```

### 3. Configure OpenClaw

Add the WAIaaS environment variables to your `~/.openclaw/openclaw.json`:

```json
{
  "skills": {
    "entries": {
      "waiaas-quickstart": {
        "env": {
          "WAIAAS_BASE_URL": "http://localhost:3100",
          "WAIAAS_MASTER_PASSWORD": "<your-master-password>",
          "WAIAAS_SESSION_TOKEN": "<your-session-token>"
        }
      }
    }
  }
}
```

Replace `<your-master-password>` and `<your-session-token>` with the values from step 1.

## Verification

Ask OpenClaw to check your wallet balance:

> "Check my WAIaaS wallet balance"

OpenClaw will use the `waiaas-quickstart` skill to query the daemon and return your balance.

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
npx @waiaas/skills openclaw --force
```

## Troubleshooting

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

Check that your master password and session token are correct in `openclaw.json`. You can verify with:

```bash
curl -H "X-Master-Password: <your-password>" http://localhost:3100/v1/wallets
```
