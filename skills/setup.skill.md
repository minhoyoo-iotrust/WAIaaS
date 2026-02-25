---
name: "WAIaaS Setup"
description: "Zero-state daemon setup: install CLI, initialize, start daemon, create wallet, configure session"
category: "api"
tags: [wallet, blockchain, solana, ethereum, setup, install, waiass]
version: "2.5.0-rc"
dispatch:
  kind: "tool"
  allowedCommands: ["curl", "npm", "npx", "waiaas", "which"]
---

# WAIaaS Zero-State Setup

This skill guides you through setting up WAIaaS from scratch -- from an empty machine to a fully configured wallet daemon with session credentials.

> AI agents must NEVER request the master password. Use only your session token.

## Prerequisites

- **Node.js 22 LTS** or later (`node --version`)
- **npm** package manager (bundled with Node.js)

## Setup Flow

Follow these steps in order. Steps 3 and 4 require human input for the master password.

### Step 1: Install CLI

Check if WAIaaS CLI is already installed:

```bash
which waiaas
```

If not found, install globally:

```bash
npm install -g @waiaas/cli
```

Verify installation:

```bash
waiaas --version
```

### Step 2: Initialize Data Directory

Create the WAIaaS data directory and default configuration:

```bash
waiaas init
```

This creates `~/.waiaas/` with `config.toml` and required subdirectories. Safe to run multiple times -- skips if already initialized.

### Step 3: Start Daemon

```bash
waiaas start
```

**IMPORTANT: On first run, the daemon prompts for a master password.**

- The master password encrypts all private keys at rest
- This is a human-only secret -- wait for the user to type it
- Do NOT attempt to provide, generate, or capture the master password
- The daemon starts after the password is set

Verify the daemon is running:

```bash
curl -s http://localhost:3100/health
```

Expected: `{"status":"ok", ...}`

### Step 4: Create Wallet and Session

```bash
waiaas quickset
```

**IMPORTANT: This command prompts for the master password.**

- Wait for the user to enter the master password
- Do NOT attempt to provide or capture it

The command outputs:
1. Wallet IDs and public keys (Solana + EVM)
2. **Session tokens** (`wai_sess_...`) -- capture these
3. MCP configuration JSON

### Step 5: Configure Environment

Set environment variables with the session token from Step 4:

```bash
export WAIAAS_BASE_URL=http://localhost:3100
export WAIAAS_SESSION_TOKEN=<session-token-from-step-4>
```

Replace `<session-token-from-step-4>` with the actual `wai_sess_...` token printed by `quickset`.

### Step 6: Verify Connection

Call the self-discovery endpoint to confirm everything works:

```bash
curl -s http://localhost:3100/v1/connect-info \
  -H "Authorization: Bearer $WAIAAS_SESSION_TOKEN"
```

This returns:
- Accessible wallets and their networks
- Active policies
- Available capabilities
- AI-ready usage prompt

### Step 7: Install Skill Files

Install WAIaaS skill files for your AI agent platform:

**Agent Skills standard (Codex, Gemini CLI, Goose, Amp, Roo Code, Cursor, GitHub Copilot):**

```bash
npx @waiaas/skills agent-skills
```

**Claude Code:**

```bash
npx @waiaas/skills claude-code
```

**OpenClaw:**

```bash
npx @waiaas/skills openclaw
```

**Generic (copy to current directory):**

```bash
npx @waiaas/skills add all
```

## What's Next

After setup is complete, refer to these skills for specific operations:

| Skill | Description |
|-------|-------------|
| `quickstart` | Check balance, send first transfer |
| `wallet` | Wallet CRUD, asset queries, session management |
| `transactions` | All 5 transaction types with full parameters |
| `policies` | 12 policy types for spending limits and access controls |
| `admin` | Daemon status, kill switch, notifications, settings |
| `actions` | DeFi actions (Jupiter Swap, 0x DEX, LI.FI Bridge, Lido/Jito Staking) |
| `x402` | HTTP 402 auto-payment protocol |

## Troubleshooting

### `waiaas: command not found`

npm global bin directory may not be in PATH:

```bash
npm config get prefix
# Add <prefix>/bin to your PATH
```

### Daemon fails to start

Check if port 3100 is already in use:

```bash
lsof -i :3100
```

Or change the port in `~/.waiaas/config.toml`:

```toml
[server]
port = 3200
```

### `quickset` fails with authentication error

The master password may be incorrect. The daemon validates the password on startup since v2.4. Restart the daemon with the correct password:

```bash
waiaas stop
waiaas start
```
