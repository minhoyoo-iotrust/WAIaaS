# WAIaaS

**Wallet-as-a-Service for AI Agents**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-22_LTS-green.svg)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/Tests-3%2C599_passing-brightgreen.svg)](#)

A self-hosted wallet daemon that lets AI agents perform on-chain transactions securely -- while the owner keeps full control of funds.

## The Problem

AI agents that need to transact on-chain face an impossible choice: hold private keys (and risk total loss if compromised) or depend on a centralized custodian (single point of failure, trust dependency).

WAIaaS bridges the gap -- agents handle small transactions instantly, large amounts require owner approval, and everything runs on your machine with no third-party dependency.

## How It Works

WAIaaS is a local daemon that sits between your AI agent and the blockchain:

- **3-tier authentication** -- Separate roles for the daemon operator (masterAuth), fund owner (ownerAuth), and AI agent (sessionAuth)
- **4-tier policy engine** -- Transactions are auto-classified by USD value into INSTANT / NOTIFY / DELAY / APPROVAL tiers
- **12 policy types** -- Cumulative spend limits, token allowlists, contract whitelists, approved spenders, and more
- **Defense in depth** -- Kill Switch, AutoStop engine, audit logging, 4-channel notifications

See [Security Model](docs/security-model.md) for full details.

## Quick Start

```bash
# Install and start
npm install -g @waiaas/cli
waiaas init
waiaas start

# Testnet mode (development / testing)
waiaas quickstart --mode testnet

# Mainnet mode (production)
waiaas quickstart --mode mainnet
```

The `quickstart` command creates wallets and issues MCP session tokens in one step:

- **testnet**: Solana Devnet + EVM Sepolia wallets with MCP session
- **mainnet**: Solana Mainnet + EVM Ethereum Mainnet wallets with MCP session

After quickstart, copy the MCP config snippet into your AI agent's configuration.

### Docker

```bash
git clone https://github.com/anthropics/waiaas.git && cd waiaas
docker compose up -d
```

The daemon listens on `http://127.0.0.1:3100`.

### First Transaction with the SDK

```typescript
import { WAIaaSClient } from '@waiaas/sdk';

const client = new WAIaaSClient({
  baseUrl: 'http://127.0.0.1:3100',
  sessionToken: process.env.WAIAAS_SESSION_TOKEN,
});

const balance = await client.getBalance();
console.log(`Balance: ${balance.amount} SOL`);

const tx = await client.sendToken({
  to: 'recipient-address...',
  amount: '0.1',
});
console.log(`Transaction: ${tx.signature}`);
```

## Admin UI

After starting the daemon, access the admin panel at:

```
http://127.0.0.1:3100/admin
```

Requires masterAuth (master password) to log in. The Admin UI provides:

- **Dashboard** -- System overview, wallet balances, recent transactions
- **Wallets** -- Create, manage, and monitor wallets across chains
- **Sessions** -- Issue and revoke agent session tokens
- **Policies** -- Configure 12 policy types with visual form editors
- **Notifications** -- Set up Telegram, Discord, ntfy, and Slack alerts
- **Settings** -- Runtime configuration without daemon restart

Enabled by default (`admin_ui = true` in config.toml).

## Supported Networks

| Chain | Environment | Networks |
|-------|-------------|----------|
| Solana | mainnet | mainnet |
| Solana | testnet | devnet, testnet |
| EVM | mainnet | ethereum-mainnet, polygon-mainnet, arbitrum-mainnet, optimism-mainnet, base-mainnet |
| EVM | testnet | ethereum-sepolia, polygon-amoy, arbitrum-sepolia, optimism-sepolia, base-sepolia |

13 networks total (Solana 3 + EVM 10).

## Features

- **Self-hosted local daemon** -- No central server; keys never leave your machine
- **Multi-chain** -- Solana (SPL / Token-2022) and EVM (ERC-20) via `IChainAdapter`
- **Token, contract, and DeFi** -- Native transfers, token transfers, contract calls, approve, batch transactions, Action Provider plugins (Jupiter Swap, etc.)
- **USD policy evaluation** -- Price oracles (CoinGecko / Pyth / Chainlink) evaluate all transactions in USD
- **x402 payments** -- Automatic HTTP 402 payment handling with EIP-3009 signatures
- **Multiple interfaces** -- REST API, TypeScript SDK, Python SDK, MCP server, CLI, Admin Web UI, Tauri Desktop, Telegram Bot
- **Skill files** -- Pre-built instruction files that teach AI agents how to use the API

### Skill Files for AI Agents

```bash
npx @waiaas/skills list          # List available skills
npx @waiaas/skills add wallet    # Add a specific skill
npx @waiaas/skills add --all     # Add all skills
```

Available: `quickstart`, `wallet`, `transactions`, `policies`, `admin`, `mcp`, `notifications`.

## Documentation

| Document | Description |
|----------|-------------|
| [Security Model](docs/security-model.md) | Authentication, policy engine, Kill Switch, AutoStop |
| [Deployment Guide](docs/deployment.md) | Docker, npm, configuration reference |
| [API Reference](docs/api-reference.md) | REST API endpoints and authentication |
| [Why WAIaaS?](docs/why-waiaas/) | Background on AI agent wallet security |
| [Contributing](CONTRIBUTING.md) | Development setup, code style, testing, PR guidelines |

## License

[MIT](LICENSE) -- Copyright (c) 2026 WAIaaS Contributors
