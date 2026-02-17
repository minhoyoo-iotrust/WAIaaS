# Deployment Guide

This guide covers two deployment methods for WAIaaS: **npm global install** (recommended for development and single-host setups) and **Docker Compose** (recommended for production).

## Prerequisites

| Requirement | npm Install | Docker |
|-------------|:-----------:|:------:|
| Node.js 22 LTS | Required | - |
| Docker Engine 24+ | - | Required |
| Docker Compose v2 | - | Required |
| 2 GB RAM minimum | Required | Required |

## Option A: npm Global Install

### 1. Install the CLI

```bash
npm install -g @waiaas/cli
```

### 2. Initialize

```bash
waiaas init
```

This creates the data directory at `~/.waiaas/` with:

- `config.toml` -- default configuration
- `keystore/` -- encrypted key storage (sodium-native guarded memory)
- `data/waiaas.db` -- SQLite database

You will be prompted to set a **master password**. This password protects all wallet private keys via Argon2id key derivation. Store it securely -- it cannot be recovered.

### 3. Start the Daemon

```bash
waiaas start
```

The daemon starts at `http://127.0.0.1:3100` by default. You will be prompted for the master password.

### 4. Verify

```bash
waiaas status
```

Or:

```bash
curl http://127.0.0.1:3100/health
```

Expected response:

```json
{
  "status": "ok",
  "version": "1.8.0",
  "schemaVersion": 16,
  "uptime": 42,
  "timestamp": 1771300000
}
```

### 5. Stop

```bash
waiaas stop
```

### 6. Upgrade

```bash
# Recommended: built-in upgrade command (7-step process with backup)
waiaas upgrade

# Alternative: manual npm update
npm install -g @waiaas/cli@latest
```

The `waiaas upgrade` command checks for new versions, creates a backup, downloads the update, runs database migrations, and restarts the daemon.

### Data Directory Structure

```
~/.waiaas/
  config.toml          # Configuration file
  data/
    waiaas.db          # SQLite database
    waiaas.db-wal      # WAL journal
  keystore/
    *.enc              # Encrypted private keys
  tokens/              # MCP session token files
  backups/             # Automatic backup archives
```

---

## Option B: Docker Compose

### 1. Create Project Directory

```bash
mkdir waiaas && cd waiaas
```

### 2. Create docker-compose.yml

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
      - WAIAAS_DATA_DIR=/data
      - WAIAAS_DAEMON_HOSTNAME=0.0.0.0
    env_file:
      - path: .env
        required: false
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3100/health"]
      interval: 30s
      timeout: 5s
      start_period: 10s
      retries: 3

volumes:
  waiaas-data:
    driver: local
```

### 3. Configure Environment

Create a `.env` file with your settings:

```bash
# Required: Master password hash (Argon2id)
# Generate with: npx @waiaas/cli hash-password
WAIAAS_DAEMON_MASTER_PASSWORD_HASH=$argon2id$v=19$m=65536,t=3,p=4$...

# Optional: RPC endpoints
WAIAAS_RPC_SOLANA_MAINNET=https://api.mainnet-beta.solana.com
WAIAAS_RPC_SOLANA_DEVNET=https://api.devnet.solana.com
# WAIAAS_RPC_ETHEREUM_MAINNET=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY

# Optional: Daemon settings
WAIAAS_DAEMON_PORT=3100
WAIAAS_DAEMON_LOG_LEVEL=info

# Optional: Notifications
WAIAAS_NOTIFICATIONS_ENABLED=true
WAIAAS_NOTIFICATIONS_TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
WAIAAS_NOTIFICATIONS_TELEGRAM_CHAT_ID=987654321
```

### 4. Using Docker Secrets (Recommended for Production)

For sensitive values, use Docker secrets instead of environment variables. Create secret files:

```bash
mkdir -p secrets
echo "your_master_password" > secrets/master_password.txt
chmod 600 secrets/master_password.txt

# Optional: Telegram bot token
echo "your_bot_token" > secrets/telegram_bot_token.txt
chmod 600 secrets/telegram_bot_token.txt
```

Create `docker-compose.secrets.yml`:

```yaml
services:
  daemon:
    secrets:
      - waiaas_master_password
      - waiaas_telegram_bot_token
    environment:
      - WAIAAS_MASTER_PASSWORD_FILE=/run/secrets/waiaas_master_password
      - WAIAAS_TELEGRAM_BOT_TOKEN_FILE=/run/secrets/waiaas_telegram_bot_token

secrets:
  waiaas_master_password:
    file: ./secrets/master_password.txt
  waiaas_telegram_bot_token:
    file: ./secrets/telegram_bot_token.txt
```

Start with secrets:

```bash
docker compose -f docker-compose.yml -f docker-compose.secrets.yml up -d
```

### 5. Start

```bash
docker compose up -d
```

### 6. View Logs

```bash
docker compose logs -f waiaas
```

### 7. Upgrade

```bash
docker compose pull
docker compose up -d
```

Database migrations run automatically on startup. The Docker image supports Watchtower auto-update via the `com.centurylinklabs.watchtower.enable=true` label.

### Docker Image Details

- **Base image:** `node:22-slim`
- **Runs as:** non-root user `waiaas` (UID 1001)
- **Data volume:** `/data` (database, keystore, config)
- **Exposed port:** 3100
- **Health check:** `curl -f http://localhost:3100/health` every 30s

---

## Configuration

### config.toml

The configuration file is located at `~/.waiaas/config.toml` (npm install) or mounted into the container at `/data/config.toml` (Docker). All sections are **flat** (no nesting allowed).

```toml
[daemon]
port = 3100                     # Listening port
hostname = "127.0.0.1"          # Bind address (keep localhost for security)
log_level = "info"              # trace | debug | info | warn | error
admin_ui = true                 # Enable Admin Web UI
admin_timeout = 900             # Admin session timeout (seconds)

[rpc]
solana_mainnet = "https://api.mainnet-beta.solana.com"
solana_devnet = "https://api.devnet.solana.com"
# ethereum_mainnet = "https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY"
# ethereum_sepolia = "https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY"

[security]
session_ttl = 86400                     # Session lifetime (seconds, default 24h)
max_sessions_per_wallet = 5             # Max sessions per wallet
policy_defaults_delay_seconds = 300     # DELAY tier wait time (seconds)
policy_defaults_approval_timeout = 3600 # APPROVAL tier timeout (seconds)

[keystore]
argon2_memory = 65536           # Argon2id memory (KB)
argon2_time = 3                 # Argon2id iterations
argon2_parallelism = 4          # Argon2id parallelism

[database]
path = "data/waiaas.db"         # SQLite file path (relative to data dir)

[walletconnect]
project_id = ""                 # Reown Cloud project ID (optional)

[notifications]
enabled = false
telegram_bot_token = ""
telegram_chat_id = ""
discord_webhook_url = ""
ntfy_topic = ""
ntfy_server = "https://ntfy.sh"
```

### Environment Variable Override

Any config value can be overridden with environment variables using the pattern `WAIAAS_{SECTION}_{KEY}`:

```bash
WAIAAS_DAEMON_PORT=4000
WAIAAS_DAEMON_LOG_LEVEL=debug
WAIAAS_RPC_SOLANA_MAINNET="https://my-rpc.example.com"
WAIAAS_SECURITY_SESSION_TTL=43200
```

### Admin Settings (Runtime Override)

Settings that benefit from runtime changes are available through the Admin Settings API. These override `config.toml` values without restarting the daemon:

```bash
# View current settings
curl http://127.0.0.1:3100/v1/admin/settings \
  -H "X-Master-Password: <password>"

# Update a setting
curl -X PUT http://127.0.0.1:3100/v1/admin/settings \
  -H "X-Master-Password: <password>" \
  -H "Content-Type: application/json" \
  -d '{"key": "display_currency", "value": "KRW"}'
```

Infrastructure settings (port, hostname, rpc_url, master_password_hash) require a daemon restart and remain config.toml-only.

---

## Post-Installation

### 1. Access Admin UI

Open your browser and navigate to:

```
http://127.0.0.1:3100/admin
```

Log in with your master password to access the dashboard, wallet management, session management, policy configuration, and notification settings.

### 2. Create Your First Wallet

```bash
curl -X POST http://127.0.0.1:3100/v1/wallets \
  -H "Content-Type: application/json" \
  -H "X-Master-Password: <your-master-password>" \
  -d '{
    "name": "my-wallet",
    "chain": "solana",
    "environment": "testnet"
  }'
```

Response:

```json
{
  "id": "01234567-89ab-cdef-0123-456789abcdef",
  "name": "my-wallet",
  "chain": "solana",
  "network": "solana-devnet",
  "environment": "testnet",
  "publicKey": "ABC123...",
  "status": "ACTIVE",
  "ownerState": "NONE"
}
```

### 3. Create a Session Token

```bash
curl -X POST http://127.0.0.1:3100/v1/sessions \
  -H "Content-Type: application/json" \
  -H "X-Master-Password: <your-master-password>" \
  -d '{"walletId": "<wallet-id-from-above>"}'
```

The response includes a `token` field (`wai_sess_...`) that AI agents use to authenticate.

### 4. Set Up MCP (for AI Agents)

```bash
# Automatic: registers MCP server with Claude Desktop
waiaas mcp setup

# For a specific wallet
waiaas mcp setup --wallet <wallet-id>

# For all wallets
waiaas mcp setup --all
```

This automatically creates session tokens and configures Claude Desktop's MCP server settings.

### 5. Install Skill Files (Optional)

Skill files teach AI agents how to interact with the WAIaaS API. They are plain Markdown files that can be included in the AI agent's context.

```bash
# List available skills
npx @waiaas/skills list

# Add a specific skill to your project
npx @waiaas/skills add wallet

# Add all skills
npx @waiaas/skills add --all
```

This copies `.skill.md` files to your current directory. Include them in your AI agent's prompt or context window for API-aware conversations.

---

## Notifications Setup

WAIaaS supports four notification channels: **Telegram**, **Discord**, **ntfy**, and **Slack**. Notifications fire on 8 event types including transaction execution, approval requests, and kill switch activation.

| Channel | Config Key | Setup |
|---------|-----------|-------|
| Telegram | `telegram_bot_token` + `telegram_chat_id` | Create bot via @BotFather |
| Discord | `discord_webhook_url` | Server Settings > Integrations > Webhooks |
| ntfy | `ntfy_topic` + `ntfy_server` | Choose topic, subscribe via app |
| Slack | `slack_webhook_url` | Create incoming webhook |

For detailed setup instructions, see the Admin UI **Notifications** panel at `http://127.0.0.1:3100/admin`.

Test your notification channels:

```bash
curl -X POST http://127.0.0.1:3100/v1/admin/notifications/test \
  -H "X-Master-Password: <your-master-password>" \
  -H "Content-Type: application/json" \
  -d '{"channel": "telegram"}'
```

---

## Security Checklist

Before running in production, verify these security settings:

- [ ] **Bind to localhost only** -- `hostname = "127.0.0.1"` (default). Never expose the daemon to the public internet.
- [ ] **Strong master password** -- Use a password with high entropy. The master password protects all wallet private keys.
- [ ] **Set up 2+ notification channels** -- Ensure you receive alerts even if one channel fails. Set `min_channels = 2`.
- [ ] **Configure spending policies** -- Set SPENDING_LIMIT policies with appropriate tier thresholds for your use case.
- [ ] **Register an Owner** -- Set an owner address on each wallet to enable APPROVAL tier and Kill Switch recovery.
- [ ] **Enable TLS via reverse proxy** -- If accessed remotely, place behind nginx/Caddy with TLS. WAIaaS itself does not serve HTTPS.
- [ ] **Restrict file permissions** -- `chmod 600` on config.toml, keystore files, and Docker secret files.
- [ ] **Regular backups** -- Use `waiaas backup` or configure automatic backups.
- [ ] **Keep updated** -- Enable Watchtower (Docker) or periodically run `waiaas upgrade` (npm).

---

## Troubleshooting

### Port Already in Use

```
Error: listen EADDRINUSE :::3100
```

Another process is using port 3100. Either stop it or change the port:

```bash
WAIAAS_DAEMON_PORT=3200 waiaas start
```

### Permission Denied (Keystore)

```
Error: EACCES: permission denied, open '~/.waiaas/keystore/...'
```

Fix file ownership:

```bash
sudo chown -R $(whoami) ~/.waiaas/
chmod -R 700 ~/.waiaas/keystore/
```

### Database Migration

Database migrations run automatically on daemon startup. If you see migration errors:

1. Check the daemon logs for the specific migration version that failed.
2. Ensure you are running the latest version of WAIaaS.
3. Restore from backup if necessary: `waiaas restore --backup <path>`.

The daemon tracks schema versions in the `schema_version` table. Current schema version: **16**.

### Docker: Container Exits Immediately

Check logs for the error:

```bash
docker compose logs waiaas
```

Common causes:
- Missing master password: set `WAIAAS_DAEMON_MASTER_PASSWORD_HASH` or use Docker secrets.
- Volume permission issues: the container runs as UID 1001. Ensure the data volume is accessible.

### Admin UI Not Loading

- Verify `admin_ui = true` in config.toml (default).
- Check that you are accessing `http://127.0.0.1:3100/admin` (not `/admin/`).
- Clear browser cache if you recently upgraded.

### RPC Connection Errors

```
Error: Failed to connect to Solana RPC
```

- Verify your RPC URL is correct and accessible.
- For mainnet, consider using a dedicated RPC provider (Alchemy, QuickNode, Helius) instead of the public endpoint.
- Test connectivity via Admin API: `POST /v1/admin/settings/test-rpc`.
