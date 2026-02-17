# WAIaaS

**Wallet-as-a-Service for AI Agents**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-22_LTS-green.svg)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/Tests-3%2C599_passing-brightgreen.svg)](#)

A self-hosted wallet daemon that lets AI agents perform on-chain transactions securely -- while the owner keeps full control of funds.

[한국어](README.ko.md)

## Why WAIaaS?

Existing Wallet-as-a-Service products assume a **human** user. When an AI agent needs to autonomously execute transactions, a fundamentally different approach is required.

The current agent-wallet landscape falls into two extremes:

| Approach | Problem |
|----------|---------|
| **Fully autonomous** (agent holds private keys) | If the agent is compromised, all funds are lost |
| **Fully custodial** (centralized service) | Trust dependency on a third party, single point of failure |

WAIaaS bridges the gap:

- **Balance between autonomy and control** -- Agents handle small transactions instantly; large amounts require owner approval
- **No service provider dependency** -- Everything runs on your local machine
- **Defense in depth** -- Even if one security layer is breached, other layers protect your funds

Learn more in [docs/why-waiaas/](docs/why-waiaas/).

## Key Features

- **Self-hosted local daemon** -- No central server. Key generation, transaction signing, and policy evaluation all run on your machine.
- **Chain-agnostic 3-tier security** -- The same security model applies across Solana, EVM, and any future chain adapter.
- **Multi-chain support** -- Solana (SPL / Token-2022) and EVM (Ethereum, Base, etc. / ERC-20) via the `IChainAdapter` interface.
- **Token, contract, and DeFi** -- Native transfers, token transfers, arbitrary contract calls, approve management, and batch transactions. Action Provider plugins abstract DeFi protocols like Jupiter Swap.
- **USD-denominated policy evaluation** -- Price oracles (CoinGecko / Pyth / Chainlink) evaluate all transactions against dollar-based policy tiers, regardless of token type.
- **Multiple interfaces** -- REST API, TypeScript SDK, Python SDK, MCP server, CLI, Admin Web UI, Desktop App (Tauri), and Telegram Bot.

## Quick Start

### Option A: npm (global install)

```bash
npm install -g @waiaas/cli

# Initialize data directory + keystore
waiaas init

# Start daemon (prompts for master password)
waiaas start
```

### Option B: Docker

```bash
# Clone the repository
git clone https://github.com/anthropics/waiaas.git
cd waiaas

# Start with Docker Compose
docker compose up -d

# Follow logs
docker compose logs -f
```

The daemon listens on `http://127.0.0.1:3100`.

### Create a Wallet and Session

```bash
# Create a wallet (requires masterAuth)
curl -X POST http://127.0.0.1:3100/v1/wallets \
  -H "Content-Type: application/json" \
  -H "X-Master-Password: <your-master-password>" \
  -d '{"name": "my-wallet", "chain": "solana", "network": "devnet"}'

# Issue a session token (requires masterAuth)
curl -X POST http://127.0.0.1:3100/v1/sessions \
  -H "Content-Type: application/json" \
  -H "X-Master-Password: <your-master-password>" \
  -d '{"walletId": "<wallet-id>"}'
```

Set the returned `token` in your agent's environment:

```bash
export WAIAAS_SESSION_TOKEN=wai_sess_eyJhbGciOiJIUzI1NiJ9...
```

### First Transaction with the SDK

```typescript
import { WAIaaSClient } from '@waiaas/sdk';

const client = new WAIaaSClient({
  baseUrl: 'http://127.0.0.1:3100',
  sessionToken: process.env.WAIAAS_SESSION_TOKEN,
});

// Check balance
const balance = await client.getBalance();
console.log(`Balance: ${balance.amount} SOL`);

// Send SOL
const tx = await client.sendToken({
  to: 'recipient-address...',
  amount: '0.1',
});
console.log(`Transaction: ${tx.signature}`);
```

## Architecture

```
+---------------------------------------------------------+
|  AI Agent                                               |
|  (Claude, GPT, LangChain, CrewAI, ...)                  |
+------------+-----------------+--------------------------+
             |                 |
     +-------v-------+  +-----v--------+
     | TS/Python SDK  |  |  MCP Server  |
     +-------+-------+  +------+-------+
             |                 |
             +--------+--------+
                      | HTTP (127.0.0.1:3100)
              +-------v--------+
              |  WAIaaS Daemon  |
              |                |
              |  +----------+  |     +-------------+
              |  | REST API |  |     | Desktop App |
              |  |  (Hono)  |  |     |  (Tauri 2)  |
              |  +----+-----+  |     +------+------+
              |       |        |            |
              |  +----v-----+  |     +------v------+
              |  | Pipeline |  |     | Telegram Bot|
              |  | (6-stage)|  |     +-------------+
              |  +----+-----+  |
              |       |        |
              |  +----v-----+  |
              |  | Policy   |  |
              |  | Engine   |  |
              |  +----+-----+  |
              |       |        |
              |  +----v-----+  |
              |  | Chain    |  |
              |  | Adapters |  |
              |  +----+-----+  |
              +-------+--------+
                      |
          +-----------+-----------+
          |           |           |
   +------v--+ +-----v----+ +---v---+
   | Solana  | |   EVM    | |  ...  |
   |(Mainnet)| |(Ethereum)| |       |
   +---------+ +----------+ +-------+
```

## Monorepo Structure

```
waiaas/
├── packages/
│   ├── core/               # Domain models, interfaces, Zod schemas, error codes
│   ├── daemon/             # Self-hosted daemon (Hono HTTP, SQLite, Keystore)
│   ├── adapters/
│   │   ├── solana/         # Solana adapter (@solana/kit 6.x)
│   │   └── evm/            # EVM adapter (viem 2.x)
│   ├── cli/                # CLI tool (waiaas command)
│   ├── sdk/                # TypeScript SDK (zero external dependencies)
│   ├── mcp/                # MCP Server (stdio transport)
│   └── admin/              # Admin Web UI (Preact + Signals)
├── python-sdk/             # Python SDK (httpx + Pydantic v2)
├── docs/                   # User-facing documentation
│   └── why-waiaas/         # Background articles
├── skills/                 # API skill files (MCP resource)
└── objectives/             # Milestone objectives
```

**By the numbers:** ~124,700 lines of TypeScript across 9 packages + a Python SDK, 3,599 tests, 50+ REST endpoints, 18+ MCP tools.

## Interfaces

| Interface | Target | Description |
|-----------|--------|-------------|
| **REST API** | All clients | 50+ endpoints, OpenAPI 3.0 |
| **TypeScript SDK** | Node.js agents | Zero external dependencies, fully typed |
| **Python SDK** | Python agents | httpx + Pydantic v2 |
| **MCP** | AI agents (Claude, etc.) | 18+ tools, stdio transport |
| **CLI** | Developers / Operators | init, start, stop, status, mcp setup, upgrade |
| **Admin Web UI** | Administrators | Dashboard, wallets, sessions, policies, notifications, settings |
| **Desktop App** | Owner | Tauri 2, system tray, approval UI |
| **Telegram Bot** | Owner | Inline keyboard for transaction approval / rejection |

## Security Model

### 3-Tier Authentication

WAIaaS separates three levels of authentication, granting each actor only the minimum required privileges.

| Auth Level | Actor | Method | Purpose |
|-----------|-------|--------|---------|
| **masterAuth** | Daemon operator | Master password (Argon2id) | System admin (wallet creation, policies, sessions) |
| **ownerAuth** | Fund owner | SIWS/SIWE signature (per-request) | Transaction approval, Kill Switch recovery |
| **sessionAuth** | AI agent | JWT Bearer (HS256) | Wallet queries, transaction requests |

### 4-Tier Policy

Transaction amounts (in USD) automatically determine the security level.

| Tier | Default Threshold | Behavior |
|------|------------------|----------|
| **INSTANT** | <= $10 | Execute immediately |
| **NOTIFY** | <= $100 | Execute + notify owner |
| **DELAY** | <= $500 | Wait 5 min, auto-execute (owner can cancel) |
| **APPROVAL** | > $500 | Owner must sign to execute |

Thresholds are fully customizable via config or the Admin UI. Additional policy types include cumulative USD spend limits (daily/monthly rolling windows), token allowlists, contract whitelists, approved spenders, and more (12 policy types total).

### Additional Security

- **Kill Switch** -- 3-state emergency halt (ACTIVE / SUSPENDED / LOCKED) with dual-auth recovery
- **AutoStop Engine** -- 4 rules for automatic suspension (consecutive failures, unusual hours, threshold proximity, etc.)
- **Notifications** -- 4-channel alerts (Telegram, Discord, ntfy, Slack)
- **Audit Log** -- Every transaction and admin action recorded in SQLite

## Configuration

Configuration lives at `~/.waiaas/config.toml`. All sections are **flat** (no nesting).

```toml
[daemon]
port = 3100
hostname = "127.0.0.1"
log_level = "info"
admin_ui = true

[rpc]
solana_mainnet = "https://api.mainnet-beta.solana.com"
solana_devnet = "https://api.devnet.solana.com"

[security]
session_ttl = 86400
max_sessions_per_wallet = 5
```

Every setting can be overridden with environment variables using the `WAIAAS_{SECTION}_{KEY}` pattern:

```bash
WAIAAS_DAEMON_PORT=4000
WAIAAS_DAEMON_LOG_LEVEL=debug
WAIAAS_RPC_SOLANA_MAINNET="https://my-rpc.example.com"
```

Runtime-adjustable settings (rate limits, policy defaults, etc.) are also configurable through the Admin Web UI without restarting the daemon.

## Documentation

| Document | Description |
|----------|-------------|
| [Deployment Guide](docs/deployment.md) | Docker, npm, configuration reference |
| [API Reference](docs/api-reference.md) | REST API, authentication, endpoint summary |
| [Why WAIaaS?](docs/why-waiaas/) | Background on AI agent wallet security |

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code style, testing, and PR guidelines.

## License

[MIT](LICENSE) -- Copyright (c) 2026 WAIaaS Contributors
