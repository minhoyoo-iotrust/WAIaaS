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

WAIaaS supports two setup modes: **auto-provision** (fully autonomous, recommended for AI agents) and **manual** (human-guided password setup).

---

### Option A: Auto-Provision (Recommended for AI Agents)

No human interaction required. The daemon generates a random master password and saves it to `recovery.key`.

#### Step 1: Install CLI

```bash
which waiaas || npm install -g @waiaas/cli
```

#### Step 2: Initialize with Auto-Provision

```bash
waiaas init --auto-provision
```

This creates `~/.waiaas/` with:
- `config.toml` -- default configuration
- `recovery.key` -- generated master password (read once, then secure this file)

#### Step 3: Start Daemon

```bash
waiaas start
```

The daemon starts immediately using the auto-provisioned password. No password prompt.

Verify the daemon is running:

```bash
curl -s http://localhost:3100/health
```

Expected: `{"status":"ok", ...}`

#### Step 4: Create Wallet and Session

```bash
waiaas quickset
```

The command reads the master password from `recovery.key` automatically. No password prompt needed.

The command outputs:
1. Wallet IDs and public keys (Solana + EVM)
2. **Session tokens** (`wai_sess_...`) -- capture these
3. MCP configuration JSON

#### Step 5: Configure Environment

```bash
export WAIAAS_BASE_URL=http://localhost:3100
export WAIAAS_SESSION_TOKEN=<session-token-from-step-4>
```

#### Step 6: Verify Connection

```bash
curl -s http://localhost:3100/v1/connect-info \
  -H "Authorization: Bearer $WAIAAS_SESSION_TOKEN"
```

#### Step 7: Harden Master Password (Post-Setup)

After initial setup, the operator should replace the auto-generated password with a strong human-chosen password:

```bash
waiaas set-master
```

This prompts for the current password (from `recovery.key`) and a new password. After changing, delete `recovery.key`.

---

### Option B: Manual Setup (Human-Guided)

Follow these steps when a human operator is present for password entry.

#### Step 1: Install CLI

```bash
which waiaas || npm install -g @waiaas/cli
```

#### Step 2: Initialize Data Directory

```bash
waiaas init
```

This creates `~/.waiaas/` with `config.toml` and required subdirectories. Safe to run multiple times -- skips if already initialized.

#### Step 3: Start Daemon

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

#### Step 4: Create Wallet and Session

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

#### Step 5: Configure Environment

```bash
export WAIAAS_BASE_URL=http://localhost:3100
export WAIAAS_SESSION_TOKEN=<session-token-from-step-4>
```

#### Step 6: Verify Connection

```bash
curl -s http://localhost:3100/v1/connect-info \
  -H "Authorization: Bearer $WAIAAS_SESSION_TOKEN"
```

---

### Install Skill Files (Both Options)

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
