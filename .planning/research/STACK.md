# v0.2 Technology Stack: Self-Hosted Agent Wallet Daemon

**Project:** WAIaaS v0.2 - Self-Hosted Secure Wallet for AI Agents
**Researched:** 2026-02-05
**Scope:** NEW stack additions/changes for self-hosted architecture only
**Overall Confidence:** HIGH

---

## Executive Summary

v0.2 pivots from a cloud-based WaaS (PostgreSQL + Redis + AWS KMS + Nitro Enclaves) to a self-hosted local daemon. This requires replacing server-grade infrastructure with embedded, zero-dependency alternatives that run on a single machine. Seven technology decisions were researched: desktop framework, local API server, embedded database, key encryption, notification SDKs, wallet connection libraries, and session token implementation.

**Key decisions:**
1. **Tauri 2.x** for Desktop App -- 95% smaller, 85% less RAM, stronger security model
2. **Hono 4.x** for local API server -- lighter than Fastify, multi-runtime (Node + Bun), same Zod/OpenAPI workflow
3. **Drizzle ORM + better-sqlite3** for embedded DB -- type-safe, zero binary engine, SQL-transparent
4. **node:crypto (AES-256-GCM) + argon2 (Argon2id)** for key encryption -- no WASM overhead, hardware-accelerated
5. **grammY + native fetch (Discord) + ntfy.sh** for notifications -- lightweight, TypeScript-first
6. **@solana/wallet-adapter + @walletconnect/web3wallet + @ledgerhq/hw-transport-node-hid** for wallet connections
7. **jose (JWT HS256/ES256)** for session tokens -- standards-compliant, zero-dependency, cross-runtime

---

## Retained from v0.1 (DO NOT change)

These technologies carry forward unchanged:

| Technology | Version | Role in v0.2 |
|------------|---------|-------------|
| TypeScript | 5.x | Primary language |
| Node.js | 22.x LTS (Bun optional) | Runtime |
| `@solana/kit` | 3.0.x | Solana blockchain integration |
| Zod | 3.x | Schema validation (SSoT) |
| pnpm | 9.x | Package manager |
| Turborepo | 2.x | Monorepo build system |
| Vitest | latest | Test framework |
| ESLint 9.x + Prettier 3.x | latest | Code quality |

---

## Comparison 1: Desktop App Framework -- Tauri vs Electron

### Recommendation: Tauri 2.x

| Criterion | Tauri 2.x | Electron |
|-----------|-----------|----------|
| **Installer size** | ~3-10 MB | ~85-120 MB |
| **Idle RAM** | ~30-40 MB | ~200-300 MB |
| **Cold start** | <0.5s | 1-2s |
| **Security model** | Capability-based (default deny) | Full Node API access (default allow) |
| **Cross-platform rendering** | System WebView (varies by OS) | Bundled Chromium (identical) |
| **React/TypeScript** | First-class (IPC bindings) | First-class (Node.js native) |
| **Node.js sidecar** | Official support (v2 sidecar API) | Native integration |
| **Ecosystem maturity** | Growing rapidly (v2.10.2 as of 2026-02) | Very mature |
| **Rust requirement** | Minimal for basic apps; needed for plugins | None |
| **Auto-update** | Official plugin | electron-updater |
| **System tray** | Official plugin | Supported |
| **Mobile support** | iOS + Android (v2.0+) | None |

**Why Tauri:**
1. **Self-hosted daemon = runs 24/7 on user machine.** RAM matters. 30 MB vs 250 MB idle is significant for a system tray app that stays resident.
2. **Security model aligns with wallet software.** Capability-based permissions (default deny) means the desktop UI cannot access anything (filesystem, network, IPC) unless explicitly granted. For a wallet app, this is the correct default.
3. **Bundle size matters for distribution.** A 5 MB installer vs 100 MB makes self-hosted adoption frictionless.
4. **Node.js sidecar is officially supported.** The daemon (Hono API server) runs as a packaged Node.js binary sidecar. Tauri manages its lifecycle. No Rust knowledge needed for the daemon logic itself.
5. **v2.10.2 is mature.** Released October 2024, now at v2.10.2 with 16+ minor releases. Production-proven.

**Why NOT Electron:**
- 85-120 MB installer is unreasonable for a tray-resident daemon
- 250 MB idle RAM penalizes users running the wallet alongside other work
- Full Node.js API access from the renderer is a security anti-pattern for wallet software
- No architectural advantage over Tauri for our use case (we need tray icon + approval UI, not a full Chromium app)

**Architecture with Tauri:**
```
Tauri Shell (Rust, ~3 MB)
  |
  +-- Frontend (React + Tailwind CSS, rendered in system WebView)
  |     Dashboard, Approval UI, Settings
  |
  +-- Sidecar (Node.js/Bun binary, packaged via pkg/bun build)
        Hono API server, wallet daemon, policy engine
        Communicates via localhost HTTP + WebSocket
```

**Tauri integration packages:**
```bash
# Tauri CLI and create tool
pnpm add -D @tauri-apps/cli
npx create-tauri-app  # scaffold with React + TypeScript template

# Tauri JS API (frontend IPC)
pnpm add @tauri-apps/api

# Official plugins
pnpm add @tauri-apps/plugin-shell          # sidecar management
pnpm add @tauri-apps/plugin-notification   # native OS notifications
pnpm add @tauri-apps/plugin-autostart      # launch on system boot
pnpm add @tauri-apps/plugin-updater        # auto-update
pnpm add @tauri-apps/plugin-store          # lightweight local KV store
```

| Package | Version | Confidence |
|---------|---------|------------|
| `@tauri-apps/cli` | 2.x | HIGH (npm, official docs) |
| `@tauri-apps/api` | 2.x | HIGH (npm, official docs) |
| `@tauri-apps/plugin-shell` | 2.x | HIGH (official plugin) |
| `@tauri-apps/plugin-notification` | 2.x | HIGH (official plugin) |

**Tradeoff acknowledged:** Cross-platform UI consistency. Safari WebView on macOS vs Edge WebView2 on Windows may render CSS slightly differently. Mitigate with: CSS reset, extensive cross-platform testing, avoiding webkit-specific features.

### Sources
- [Tauri 2.0 Stable Release Blog](https://v2.tauri.app/blog/tauri-20/)
- [Tauri Core Ecosystem Releases](https://v2.tauri.app/release/) -- v2.10.2 confirmed
- [Tauri Node.js Sidecar Guide](https://v2.tauri.app/learn/sidecar-nodejs/)
- [Tauri vs Electron (Hopp App)](https://www.gethopp.app/blog/tauri-vs-electron)
- [Tauri vs Electron (RaftLabs)](https://www.raftlabs.com/blog/tauri-vs-electron-pros-cons/)

---

## Comparison 2: Local API Server -- Hono vs Fastify

### Recommendation: Hono 4.x with @hono/node-server

| Criterion | Hono 4.x | Fastify 5.x |
|-----------|-----------|-------------|
| **Bundle size** | ~14 KB (hono/tiny) | ~2 MB+ |
| **Node.js perf (req/s)** | ~25,000 | ~30,000 |
| **Bun perf (req/s)** | ~90,000+ | N/A (Node only) |
| **Multi-runtime** | Node, Bun, Deno, CF Workers | Node.js only |
| **TypeScript** | First-class, built-in | Good (via definitions) |
| **Zod integration** | @hono/zod-openapi, @hono/zod-validator | fastify-type-provider-zod |
| **CORS** | Built-in middleware | @fastify/cors plugin |
| **Security headers** | Built-in secureHeaders | @fastify/helmet plugin |
| **Rate limiting** | hono-rate-limiter (3rd party) | @fastify/rate-limit (official) |
| **JSON serialization** | Standard | Pre-compiled (faster) |
| **Plugin ecosystem** | Growing (100+ middlewares) | Mature (200+ plugins) |
| **Zero dependencies** | Yes | No |

**Why Hono for self-hosted daemon:**
1. **Multi-runtime is now relevant.** v0.2 spec says "Node.js 20+ or Bun". Fastify is Node-only. Hono runs on both with identical code. If we adopt Bun as primary runtime later, no rewrite needed.
2. **Smaller binary for sidecar packaging.** When the daemon is packaged as a binary (pkg/bun build) for Tauri sidecar, bundle size directly affects installer size. Hono at 14 KB vs Fastify's larger dependency tree matters.
3. **Built-in Zod + OpenAPI workflow.** `@hono/zod-openapi` provides the same Zod SSoT pattern v0.1 used with Fastify, but with automatic OpenAPI spec generation. The v0.1 design principle (Zod SSoT) carries forward unchanged.
4. **Built-in CORS and secureHeaders.** No separate plugins needed. Fewer moving parts for a self-hosted daemon.
5. **TypeScript is truly first-class.** Route types, middleware types, and RPC types all infer automatically. Better DX than Fastify's type provider approach.

**Why NOT Fastify for v0.2:**
- Node.js-only locks us out of Bun optimization (5x throughput improvement per benchmarks)
- Larger dependency tree increases sidecar binary size
- v0.1 chose Fastify for server-grade performance (76K req/s). A local daemon serving one user does not need that. Even Hono's 25K req/s on Node is 1000x more than needed.
- Plugin ecosystem advantage (rate-limit, helmet) is neutralized because Hono has built-in equivalents

**Why this is safe to change from v0.1's Fastify decision:**
The v0.1 Fastify choice was made for a cloud WaaS serving many concurrent users. v0.2 is a local daemon serving exactly one owner + their agents. The performance ceiling of Hono on Node.js (~25K req/s) is absurdly more than needed. The advantages shift to bundle size, multi-runtime, and simplicity.

**Migration effort: LOW.** Both use middleware patterns. Hono's API is similar to Express/Fastify. Route definitions, Zod validation, and JSON responses translate directly.

**Hono packages:**
```bash
# Core
pnpm add hono

# Node.js adapter (if using Node.js runtime)
pnpm add @hono/node-server

# Zod + OpenAPI integration
pnpm add @hono/zod-openapi

# Rate limiting
pnpm add hono-rate-limiter
```

| Package | Version | Confidence |
|---------|---------|------------|
| `hono` | 4.11.x | HIGH (npm: 4.11.4, published 6 days ago) |
| `@hono/node-server` | latest | HIGH (official adapter) |
| `@hono/zod-openapi` | latest | HIGH (official middleware) |
| `hono-rate-limiter` | 0.5.x | MEDIUM (community, 17 dependents) |

### Sources
- [Hono Official Docs](https://hono.dev/)
- [Hono npm](https://www.npmjs.com/package/hono) -- v4.11.4
- [Hono Node.js Guide](https://hono.dev/docs/getting-started/nodejs)
- [Hono vs Fastify (Better Stack)](https://betterstack.com/community/guides/scaling-nodejs/hono-vs-fastify/)
- [Fastify npm](https://www.npmjs.com/package/fastify) -- v5.7.1

---

## Comparison 3: Embedded Database -- SQLite Options

### Recommendation: Drizzle ORM 0.45.x + better-sqlite3 12.x

Three options were evaluated:

| Criterion | better-sqlite3 (raw) | Prisma + SQLite | Drizzle + better-sqlite3 |
|-----------|----------------------|-----------------|--------------------------|
| **Type safety** | None (raw SQL strings) | Full (generated client) | Full (inferred from schema) |
| **Bundle size** | Native binary only | ~2 MB+ engine binary | ~7.4 KB + native binary |
| **Cold start** | Instant | Slow (engine spawn) | Instant |
| **Migration tooling** | Manual SQL files | prisma migrate (excellent) | drizzle-kit (good) |
| **SQL transparency** | Complete | Abstracted | Complete ("If you know SQL, you know Drizzle") |
| **Performance** | Baseline | 10-100x slower than raw | Faster than raw via prepared statements |
| **Dependencies** | node-gyp for native | Rust query engine binary | Zero JS deps + native binary |
| **Schema definition** | N/A | schema.prisma (DSL) | TypeScript code |

**Why Drizzle + better-sqlite3:**
1. **Type-safe without code generation.** Drizzle infers types from TypeScript schema definitions. No `prisma generate` step, no binary engine. Schema changes reflect instantly in the IDE.
2. **SQL transparency for wallet operations.** Financial data requires precise control over queries. Drizzle's SQL-first approach means we can see and control exactly what hits the database. No N+1 surprise queries.
3. **Performance advantage.** Drizzle with prepared statements actually outperforms raw better-sqlite3. Up to 14x lower latency for complex joins vs Prisma.
4. **Zero cold start overhead.** Prisma spawns a Rust query engine binary, adding measurable startup latency. For a daemon that may be restarted frequently, this matters.
5. **Smallest footprint.** Drizzle is 7.4 KB minified. Combined with better-sqlite3's native binary, total overhead is minimal for sidecar packaging.
6. **v0.1 Prisma knowledge transfers.** Drizzle's migration system (`drizzle-kit`) works similarly to Prisma Migrate. Schema-as-code is the same mental model.

**Why NOT Prisma for v0.2:**
- Rust query engine binary adds ~2 MB and cold-start latency
- Abstraction hides SQL, risky for financial data
- Overkill for single-user embedded SQLite
- v0.1 chose Prisma for PostgreSQL, which is being replaced

**Why NOT raw better-sqlite3:**
- No type safety leads to runtime errors in financial logic
- No migration tooling
- Manual prepared statement management

**Packages:**
```bash
# ORM + Driver
pnpm add drizzle-orm better-sqlite3

# Migration toolkit (dev)
pnpm add -D drizzle-kit @types/better-sqlite3
```

**Schema example (v0.2 patterns):**
```typescript
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull(),
  token: text('token').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  maxAmount: real('max_amount').notNull(),
  usedAmount: real('used_amount').notNull().default(0),
  status: text('status', { enum: ['active', 'expired', 'revoked'] }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const pendingTransactions = sqliteTable('pending_transactions', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').references(() => sessions.id),
  amount: real('amount').notNull(),
  tier: text('tier', { enum: ['instant', 'notify', 'pending', 'approval'] }).notNull(),
  status: text('status', { enum: ['pending', 'approved', 'rejected', 'expired'] }).notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});
```

**Connection setup:**
```typescript
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';

const sqlite = new Database('~/.waiaas/data/wallet.db');
sqlite.pragma('journal_mode = WAL');  // Write-Ahead Logging for concurrent reads
sqlite.pragma('foreign_keys = ON');
const db = drizzle({ client: sqlite });
```

| Package | Version | Confidence |
|---------|---------|------------|
| `drizzle-orm` | 0.45.1 | HIGH (npm, published ~1 month ago) |
| `better-sqlite3` | 12.6.2 | HIGH (npm, published 2 days ago) |
| `drizzle-kit` | latest | HIGH (official companion tool) |

### In-memory LRU Cache (replacing Redis)

For caching (balance, nonce, RPC results), use a simple in-memory LRU instead of Redis:

```bash
pnpm add lru-cache
```

| Package | Version | Confidence |
|---------|---------|------------|
| `lru-cache` | 11.x | HIGH (isaacs/lru-cache, industry standard) |

The `lru-cache` package by Isaac Schlueter is the de facto standard for Node.js in-memory caching. Zero external dependencies. Single-process daemon does not need a separate cache server.

### Sources
- [Drizzle ORM SQLite Docs](https://orm.drizzle.team/docs/get-started-sqlite)
- [Drizzle npm](https://www.npmjs.com/package/drizzle-orm) -- v0.45.1
- [better-sqlite3 npm](https://www.npmjs.com/package/better-sqlite3) -- v12.6.2
- [Drizzle vs Prisma (Better Stack)](https://betterstack.com/community/guides/scaling-nodejs/drizzle-vs-prisma/)
- [Drizzle Benchmarks](https://orm.drizzle.team/benchmarks)

---

## Comparison 4: Local Key Encryption

### Recommendation: node:crypto (AES-256-GCM) + argon2 (Argon2id)

| Criterion | node:crypto + argon2 | libsodium-wrappers-sumo |
|-----------|---------------------|------------------------|
| **AES-256-GCM** | Full support (hardware + software fallback) | Hardware-only (requires AES-NI) |
| **Argon2id** | Via `argon2` package (native binding) | Built-in `crypto_pwhash` |
| **Additional deps** | 1 package (argon2) | 1 package (libsodium-wrappers-sumo, ~300 KB WASM) |
| **API complexity** | Moderate (must manage IV, tag, AAD) | Simple (misuse-resistant defaults) |
| **Performance** | Excellent (OpenSSL hardware-accelerated) | Excellent for ChaCha20; AES-GCM hardware-only |
| **Hardware requirement** | None (OpenSSL fallback) | AES-NI for AES-GCM (most modern CPUs) |
| **Node.js native** | Yes (no WASM) | No (compiled to WASM) |
| **Bundle impact** | Minimal | ~300 KB WASM blob |

**Why node:crypto + argon2:**
1. **AES-256-GCM must work everywhere.** libsodium's AES-GCM implementation only runs on CPUs with AES-NI hardware instructions. While most modern x86 CPUs have AES-NI, some ARM-based machines (older Raspberry Pi, some cloud ARM instances) do not. node:crypto uses OpenSSL which has software fallbacks. For a self-hosted daemon that runs on user machines, we cannot assume AES-NI.
2. **No WASM overhead.** node:crypto is a native Node.js module. libsodium-wrappers-sumo ships ~300 KB of WASM that must be loaded asynchronously. For a daemon that may restart frequently, instant crypto availability matters.
3. **argon2 package is battle-tested.** 354K weekly downloads, prebuilt binaries for all platforms, TypeScript support. The `argon2` npm package provides Argon2id with configurable memory cost, time cost, and parallelism.
4. **Future-proof.** Node.js core is adding native Argon2 support (nodejs/node#50353). When it lands, we can drop the `argon2` package and use `crypto.argon2()` directly.

**Why NOT libsodium-wrappers-sumo:**
- AES-GCM hardware-only restriction is a dealbreaker for self-hosted
- WASM loading adds async initialization step
- If we wanted ChaCha20-Poly1305 instead of AES-GCM, libsodium would be the winner, but v0.2 spec explicitly calls for AES-256-GCM encrypted files
- libsodium's XChaCha20-Poly1305 is excellent, but switching cipher means all our encrypted key format documentation changes

**Implementation pattern:**
```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import argon2 from 'argon2';

// Key derivation: password -> 32-byte key
async function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  const hash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,  // 64 MiB
    timeCost: 3,
    parallelism: 1,
    salt,
    raw: true,
    hashLength: 32,
  });
  return Buffer.from(hash);
}

// Encrypt: AES-256-GCM
function encrypt(plaintext: Buffer, key: Buffer): { iv: Buffer; ciphertext: Buffer; tag: Buffer } {
  const iv = randomBytes(12);  // 96-bit nonce
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv, ciphertext, tag };
}

// Decrypt: AES-256-GCM
function decrypt(ciphertext: Buffer, key: Buffer, iv: Buffer, tag: Buffer): Buffer {
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
```

**Packages:**
```bash
pnpm add argon2
# node:crypto is built-in, no install needed
```

| Package | Version | Confidence |
|---------|---------|------------|
| `argon2` | 0.44.0 | HIGH (npm, 354K weekly downloads, prebuilts) |
| `node:crypto` | built-in | HIGH (Node.js core module) |

**Alternative considered: @node-rs/argon2**
Rust-based NAPI binding, no node-gyp needed, 2.0.2 on npm. Faster install but fewer weekly downloads. Consider if `argon2` native compilation is problematic on target platforms.

### Sources
- [libsodium AES-256-GCM docs](https://libsodium.gitbook.io/doc/secret-key_cryptography/aead/aes-256-gcm) -- "hardware-accelerated, requires AES-NI"
- [libsodium-wrappers-sumo npm](https://www.npmjs.com/package/libsodium-wrappers-sumo) -- v0.8.0
- [argon2 npm](https://www.npmjs.com/package/argon2) -- v0.44.0
- [Node.js native Argon2 proposal](https://github.com/nodejs/node/issues/34452)
- [@node-rs/argon2 npm](https://www.npmjs.com/package/@node-rs/argon2) -- v2.0.2

---

## Comparison 5: Notification SDKs

### Recommendation: grammY (Telegram) + native fetch (Discord) + ntfy.sh (Push)

The v0.2 spec requires multi-channel notifications: Telegram Bot, Discord Webhook, Push Notification. Each channel has a clear best-fit library.

### 5a: Telegram Bot -- grammY

| Criterion | grammY | Telegraf | node-telegram-bot-api |
|-----------|--------|---------|----------------------|
| **TypeScript** | First-class (built for TS) | Good (v4+, complex types) | External @types |
| **Architecture** | Middleware-based | Middleware-based | Event emitter |
| **Bundle size** | Lightweight | Fewer deps | Minimal |
| **Deno/Bun support** | Yes | No | No |
| **Plugin ecosystem** | Rich, growing | Mature | Limited |
| **API coverage** | Complete Bot API | Complete Bot API | Complete Bot API |

**Why grammY:** Best TypeScript support among Telegram bot libraries. Clean API design, middleware-based (matches Hono patterns), excellent documentation. Built for modern runtimes. Our use case (send notifications, receive approval commands) maps perfectly to grammY's middleware pattern.

```bash
pnpm add grammy
```

| Package | Version | Confidence |
|---------|---------|------------|
| `grammy` | 1.39.x | HIGH (npm, ~1.2M weekly downloads) |

### 5b: Discord Webhook -- Native fetch (no library)

**Why no library:** Discord webhooks are a single HTTP POST endpoint. Using `fetch()` (built into Node 18+) with Discord's embed format is simpler and more maintainable than any wrapper library. The existing Discord webhook libraries (`discord-webhook-node`, `webhook-discord`) are 4-5 years old and unmaintained.

```typescript
// Zero-dependency Discord webhook
async function sendDiscordNotification(webhookUrl: string, message: {
  title: string;
  description: string;
  color: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
}): Promise<void> {
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      embeds: [{
        title: message.title,
        description: message.description,
        color: message.color,
        fields: message.fields,
        timestamp: new Date().toISOString(),
      }],
    }),
  });
}
```

**No package needed.** Confidence: HIGH (Discord webhook API is stable, well-documented).

### 5c: Push Notification -- ntfy.sh

| Criterion | ntfy.sh | Pushover |
|-----------|---------|----------|
| **Self-hosted option** | Yes (open source, Docker) | No (SaaS only) |
| **Pricing** | Free (self-hosted) or $5/mo | $5 one-time per platform |
| **API complexity** | Simple HTTP PUT/POST | Simple HTTP POST |
| **Mobile app** | Android + iOS | Android + iOS |
| **Node.js SDK** | Native fetch (no SDK needed) | pushover-js (TS, promise-based) |
| **Philosophy** | Open, self-hosted first | Commercial SaaS |

**Why ntfy.sh:** Aligns with self-hosted philosophy. The entire notification chain can be self-hosted (ntfy server + our daemon). Simple HTTP API means zero additional dependencies. User can use the public ntfy.sh instance or run their own.

```typescript
// Zero-dependency ntfy push
async function sendPushNotification(topic: string, message: string, options?: {
  title?: string;
  priority?: 1 | 2 | 3 | 4 | 5;
  tags?: string[];
  ntfyUrl?: string;  // default: https://ntfy.sh
}): Promise<void> {
  const url = options?.ntfyUrl ?? 'https://ntfy.sh';
  await fetch(`${url}/${topic}`, {
    method: 'POST',
    headers: {
      'Title': options?.title ?? 'WAIaaS Alert',
      'Priority': String(options?.priority ?? 3),
      'Tags': options?.tags?.join(',') ?? 'warning',
    },
    body: message,
  });
}
```

**Pushover as optional alternative:** If users prefer Pushover, support it as an optional notification channel. Use `pushover-js` (v1.3.2, TypeScript, promise-based).

```bash
# Required
pnpm add grammy

# Optional (if user configures Pushover)
pnpm add pushover-js
```

| Package | Version | Confidence |
|---------|---------|------------|
| `grammy` | 1.39.x | HIGH |
| ntfy.sh (fetch) | N/A | HIGH (standard HTTP API) |
| Discord (fetch) | N/A | HIGH (standard HTTP API) |
| `pushover-js` | 1.3.2 | MEDIUM (optional, 3 years since last publish) |

### Sources
- [grammY Official](https://grammy.dev/) / [npm](https://www.npmjs.com/package/grammy) -- v1.39.2
- [grammY Comparison Page](https://grammy.dev/resources/comparison)
- [Discord Webhooks Guide 2025](https://inventivehq.com/blog/discord-webhooks-guide)
- [ntfy.sh Official](https://ntfy.sh/) / [docs](https://docs.ntfy.sh/)
- [pushover-js npm](https://www.npmjs.com/package/pushover-js)

---

## Comparison 6: Wallet Connection Libraries

### Recommendation: Multi-library approach (no single library covers all methods)

The v0.2 spec requires three connection methods for Owner wallet:
1. Browser extension wallets (Phantom, Backpack, MetaMask)
2. Mobile wallets via QR (WalletConnect)
3. Hardware wallets (Ledger USB)

### 6a: Browser Extension -- @solana/wallet-adapter

| Package | Version | Purpose |
|---------|---------|---------|
| `@solana/wallet-adapter-base` | 0.9.27 | Core adapter interface |
| `@solana/wallet-adapter-react` | 0.15.39 | React hooks + context |
| `@solana/wallet-adapter-react-ui` | 0.9.39 | Connect button, modal |
| `@solana/wallet-adapter-wallets` | 0.19.37 | Pre-built wallet adapters |

**Note:** These packages are designed for React frontend, which pairs with our Tauri + React UI. They are compatible with `@solana/web3.js` 1.x but not yet with `@solana/kit` 3.x directly. The Kit example on Solana docs shows a separate integration path.

**Important caveat:** wallet-adapter is frontend-only. In the Tauri architecture, these run in the WebView (React frontend), and signed messages are relayed to the daemon via IPC/localhost. The daemon never touches the Owner's private key.

```bash
pnpm add @solana/wallet-adapter-base @solana/wallet-adapter-react @solana/wallet-adapter-react-ui @solana/wallet-adapter-wallets
```

### 6b: Mobile/QR -- WalletConnect v2 (Reown WalletKit)

WalletConnect Inc. rebranded to Reown Inc. The `@walletconnect/web3wallet` package (v1.16.1) is the current stable release, with WalletKit being the evolving successor.

| Package | Version | Purpose |
|---------|---------|---------|
| `@walletconnect/web3wallet` | 1.16.1 | WalletConnect v2 Sign + Auth |
| `@walletconnect/core` | latest | Core relay protocol |

**Architecture note:** WalletConnect in our context means the Desktop App acts as a "dapp" that requests signatures from the Owner's mobile wallet. The Owner scans a QR code displayed in the Tauri app to connect their Phantom/Backpack mobile wallet.

```bash
pnpm add @walletconnect/web3wallet @walletconnect/core
```

**Requires:** A WalletConnect Cloud project ID (free tier available).

### 6c: Hardware Wallet -- Ledger HID

| Package | Version | Purpose |
|---------|---------|---------|
| `@ledgerhq/hw-transport-node-hid` | 6.28.x | USB HID transport for Node.js/Electron |
| `@ledgerhq/hw-app-solana` | latest | Solana app commands |
| `@ledgerhq/hw-transport-webhid` | latest | WebHID for browser (Tauri WebView) |

**Architecture consideration:** Two options for Ledger in Tauri:
1. **WebHID in WebView** (`@ledgerhq/hw-transport-webhid`): Works directly in the Tauri WebView. Simpler but requires WebHID API support in the system WebView.
2. **Node HID in sidecar** (`@ledgerhq/hw-transport-node-hid`): Runs in the daemon process. More reliable but requires IPC for signing flow.

**Recommendation:** Start with WebHID in the Tauri WebView. Fall back to Node HID in sidecar if WebView compatibility issues arise. WebHID is standard Web API, supported in Chrome-based WebViews (Windows Edge WebView2, macOS WKWebView with caveats).

```bash
# WebHID approach (preferred for Tauri WebView)
pnpm add @ledgerhq/hw-transport-webhid @ledgerhq/hw-app-solana

# Node HID approach (fallback for sidecar)
pnpm add @ledgerhq/hw-transport-node-hid @ledgerhq/hw-app-solana
```

| Package | Version | Confidence |
|---------|---------|------------|
| `@solana/wallet-adapter-*` | 0.9-0.19.x | HIGH (official Solana, anza-xyz) |
| `@walletconnect/web3wallet` | 1.16.1 | MEDIUM (stable but rebranding to WalletKit) |
| `@ledgerhq/hw-transport-webhid` | latest | MEDIUM (WebHID API support varies by WebView) |
| `@ledgerhq/hw-app-solana` | latest | HIGH (official Ledger SDK) |

### Sources
- [@solana/wallet-adapter GitHub](https://github.com/anza-xyz/wallet-adapter)
- [WalletConnect Web3Wallet SDK](https://specs.walletconnect.com/2.0/specs/meta-clients/web3wallet)
- [Reown (WalletConnect) Docs](https://docs.walletconnect.com/2.0/web3wallet/resources)
- [Ledger Node HID Integration](https://developers.ledger.com/docs/device-interaction/ledgerjs/integration/desktop-application/node-electron-hid)
- [Ledger Web USB/HID](https://developers.ledger.com/docs/device-interaction/ledgerjs/integration/web-application/web-hid-usb)

---

## Comparison 7: Session Token Implementation

### Recommendation: jose (JWT with HS256 for agent sessions, ES256 for Owner signatures)

| Criterion | jose (JWT) | Custom HMAC Token |
|-----------|-----------|-------------------|
| **Standards compliance** | Full RFC 7515-7519 | Custom format |
| **TypeScript** | First-class | Manual |
| **Dependencies** | Zero | node:crypto (built-in) |
| **Token inspection** | Standard (jwt.io, any JWT library) | Custom parsing needed |
| **Expiry handling** | Built-in `exp` claim | Manual implementation |
| **Multi-runtime** | Node, Bun, Deno, Browser | Node-specific |
| **Algorithm selection** | HS256, ES256, RS256, etc. | HMAC-SHA256 only |
| **Ecosystem** | Universal JWT tooling | None |

**Why jose (JWT):**
1. **Standards compliance simplifies session management.** JWT's `exp`, `iat`, `sub` claims map directly to session requirements (expiry, creation time, agent ID). No custom format to document/maintain.
2. **jose is zero-dependency and cross-runtime.** At 0 deps, it adds minimal footprint. Works in Node, Bun, and browser (Tauri WebView) identically.
3. **Agent SDK interoperability.** External agents receive a standard JWT token they can inspect, validate expiry, and include in Authorization headers. Any language's JWT library can work with our tokens.
4. **Two algorithm strategy:**
   - **HS256 (HMAC-SHA256):** For daemon-issued session tokens. Symmetric key stored in daemon's encrypted config. Fast, simple, appropriate for single-issuer scenarios.
   - **ES256 (ECDSA P-256):** For Owner-signed approvals. Owner signs with their wallet key (Ed25519 for Solana, converted or using separate approval key). Verifiable without the signing key.

**Why NOT custom HMAC tokens:**
- Reinventing JWT's claims (`exp`, `sub`, `iat`) adds no value
- External agent SDKs would need custom parsing logic
- No standard tooling for debugging/inspection
- HMAC-only limits future flexibility (e.g., delegated verification)

**Session token structure:**
```typescript
import { SignJWT, jwtVerify } from 'jose';

// Issue session token
async function issueSessionToken(params: {
  agentId: string;
  sessionId: string;
  maxAmount: number;
  perTxLimit: number;
  allowedOps: string[];
  expiresIn: string;  // e.g., '24h'
  secret: Uint8Array;
}): Promise<string> {
  return new SignJWT({
    sid: params.sessionId,
    maxAmt: params.maxAmount,
    perTx: params.perTxLimit,
    ops: params.allowedOps,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(params.agentId)
    .setIssuedAt()
    .setExpirationTime(params.expiresIn)
    .setIssuer('waiaas-daemon')
    .sign(params.secret);
}

// Verify session token
async function verifySessionToken(token: string, secret: Uint8Array) {
  const { payload } = await jwtVerify(token, secret, {
    issuer: 'waiaas-daemon',
  });
  return payload;
}
```

**Packages:**
```bash
pnpm add jose
```

| Package | Version | Confidence |
|---------|---------|------------|
| `jose` | latest | HIGH (panva/jose, zero deps, RFC-compliant, widely used) |

### Sources
- [jose npm](https://www.npmjs.com/package/jose)
- [jose GitHub](https://github.com/panva/jose) -- JWA, JWS, JWE, JWT, JWK, JWKS
- [JWT Token Verification Guide](https://copyprogramming.com/howto/how-can-i-create-a-signed-jwt-using-npm-jose-and-then-verify-this-token)

---

## Complete v0.2 Stack Addition Summary

### New Production Dependencies

```bash
# Desktop App (Tauri)
pnpm add @tauri-apps/api
pnpm add @tauri-apps/plugin-shell @tauri-apps/plugin-notification
pnpm add @tauri-apps/plugin-autostart @tauri-apps/plugin-updater
pnpm add @tauri-apps/plugin-store

# Local API Server
pnpm add hono @hono/node-server @hono/zod-openapi hono-rate-limiter

# Database
pnpm add drizzle-orm better-sqlite3 lru-cache

# Key Encryption
pnpm add argon2
# node:crypto is built-in

# Session Tokens
pnpm add jose

# Notifications
pnpm add grammy
# Discord + ntfy.sh use native fetch (no deps)

# Wallet Connection (frontend)
pnpm add @solana/wallet-adapter-base @solana/wallet-adapter-react
pnpm add @solana/wallet-adapter-react-ui @solana/wallet-adapter-wallets
pnpm add @walletconnect/web3wallet @walletconnect/core
pnpm add @ledgerhq/hw-transport-webhid @ledgerhq/hw-app-solana
```

### New Dev Dependencies

```bash
pnpm add -D @tauri-apps/cli
pnpm add -D drizzle-kit @types/better-sqlite3
```

### What NOT to Add (and Why)

| Technology | Why NOT |
|------------|---------|
| **Electron** | 85+ MB bundle, 250 MB RAM idle. Tauri is 95% smaller, 85% less RAM. |
| **Fastify** | Node.js-only. Hono gives us Bun compatibility with smaller bundle. |
| **Prisma** | Rust engine binary adds cold start latency and bundle size. Drizzle is lighter. |
| **libsodium-wrappers-sumo** | AES-GCM hardware-only restriction. node:crypto works everywhere. |
| **discord.js** | Full Discord bot framework. We only need webhook POST (native fetch). |
| **Telegraf** | grammY has better TypeScript support and cleaner API. |
| **node-telegram-bot-api** | Event emitter pattern, no TypeScript. grammY is modern replacement. |
| **jsonwebtoken** | Legacy, known vulnerabilities. jose is modern, zero-dep, standards-compliant. |
| **Pushover (as primary)** | SaaS-only, conflicts with self-hosted philosophy. Optional secondary. |
| **ioredis** | No Redis server in self-hosted. lru-cache replaces it. |
| **@prisma/client** | Replaced by drizzle-orm for embedded SQLite. |

---

## Version Matrix (2026-02-05)

### Retained from v0.1

| Package | Version | Last Verified | Notes |
|---------|---------|---------------|-------|
| `typescript` | 5.x | 2026-02-04 | LTS |
| `@solana/kit` | 3.0.x | 2026-02-04 | Solana SDK |
| `zod` | 3.x | 2026-02-04 | Schema SSoT |
| `node` | 22.x | 2026-02-04 | LTS until 2027-04 |

### New for v0.2

| Package | Version | Last Verified | Confidence |
|---------|---------|---------------|------------|
| `hono` | 4.11.x | 2026-02-05 | HIGH |
| `@hono/node-server` | latest | 2026-02-05 | HIGH |
| `@hono/zod-openapi` | latest | 2026-02-05 | HIGH |
| `drizzle-orm` | 0.45.1 | 2026-02-05 | HIGH |
| `better-sqlite3` | 12.6.2 | 2026-02-05 | HIGH |
| `drizzle-kit` | latest | 2026-02-05 | HIGH |
| `argon2` | 0.44.0 | 2026-02-05 | HIGH |
| `jose` | latest | 2026-02-05 | HIGH |
| `grammy` | 1.39.x | 2026-02-05 | HIGH |
| `lru-cache` | 11.x | 2026-02-05 | HIGH |
| `@tauri-apps/cli` | 2.x | 2026-02-05 | HIGH |
| `@tauri-apps/api` | 2.x | 2026-02-05 | HIGH |
| `@solana/wallet-adapter-base` | 0.9.27 | 2026-02-05 | HIGH |
| `@walletconnect/web3wallet` | 1.16.1 | 2026-02-05 | MEDIUM |
| `@ledgerhq/hw-transport-webhid` | latest | 2026-02-05 | MEDIUM |
| `@ledgerhq/hw-app-solana` | latest | 2026-02-05 | HIGH |
| `hono-rate-limiter` | 0.5.x | 2026-02-05 | MEDIUM |
| `pushover-js` | 1.3.2 | 2026-02-05 | MEDIUM (optional) |

---

## Roadmap Implications

### Phase Ordering Based on Stack Dependencies

1. **Core Daemon (first)** -- Hono server + Drizzle/SQLite + key encryption + session tokens. These are independent and foundational.
2. **Notification System (early)** -- grammY + Discord + ntfy.sh. Critical for Layer 3 security (monitoring + kill switch). Low complexity.
3. **Wallet Connection (mid)** -- @solana/wallet-adapter + WalletConnect. Needed for Owner authentication, session approval.
4. **Desktop App (later)** -- Tauri shell wrapping the daemon. Can be developed in parallel once daemon API is stable.
5. **CLI Daemon (parallel with Desktop)** -- npm package with `waiaas` commands. Uses same Hono server internally.

### Stack Risk Areas

| Area | Risk | Mitigation |
|------|------|------------|
| Tauri WebView consistency | CSS differences across OS | Extensive cross-platform testing, CSS reset |
| Tauri sidecar packaging | Node.js binary size (~40-70 MB) | Use Bun single-binary build (smaller), or pkg |
| WalletConnect rebranding | Package name may change (web3wallet -> walletkit) | Pin version, monitor Reown releases |
| Ledger WebHID in Tauri | WebHID API may not work in all system WebViews | Fallback to Node HID transport in sidecar |
| better-sqlite3 native compilation | Requires node-gyp toolchain on user machine | Ship prebuilt binaries, test all target platforms |

---

## Sources (Complete)

### HIGH Confidence (Official docs, npm registry)
- [Tauri 2.0 Official](https://v2.tauri.app/) -- v2.10.2
- [Hono Official](https://hono.dev/) -- v4.11.4
- [Drizzle ORM Official](https://orm.drizzle.team/) -- v0.45.1
- [better-sqlite3 npm](https://www.npmjs.com/package/better-sqlite3) -- v12.6.2
- [argon2 npm](https://www.npmjs.com/package/argon2) -- v0.44.0
- [jose npm/GitHub](https://github.com/panva/jose) -- latest
- [grammY Official](https://grammy.dev/) -- v1.39.x
- [ntfy.sh Official](https://ntfy.sh/)
- [Solana Wallet Adapter GitHub](https://github.com/anza-xyz/wallet-adapter)
- [WalletConnect Specs](https://specs.walletconnect.com/2.0/specs/meta-clients/web3wallet)
- [Ledger Developer Portal](https://developers.ledger.com/docs/device-interaction/ledgerjs/integration/desktop-application/node-electron-hid)
- [libsodium AES-256-GCM docs](https://libsodium.gitbook.io/doc/secret-key_cryptography/aead/aes-256-gcm)
- [Fastify npm](https://www.npmjs.com/package/fastify) -- v5.7.1

### MEDIUM Confidence (Verified comparisons, technical blogs)
- [Tauri vs Electron (Hopp)](https://www.gethopp.app/blog/tauri-vs-electron)
- [Hono vs Fastify (Better Stack)](https://betterstack.com/community/guides/scaling-nodejs/hono-vs-fastify/)
- [Drizzle vs Prisma (Better Stack)](https://betterstack.com/community/guides/scaling-nodejs/drizzle-vs-prisma/)
- [Drizzle vs Prisma (Bytebase)](https://www.bytebase.com/blog/drizzle-vs-prisma/)
- [Tauri Node.js Sidecar Guide](https://v2.tauri.app/learn/sidecar-nodejs/)
- [Discord Webhooks Guide 2025](https://inventivehq.com/blog/discord-webhooks-guide)
- [grammY Comparison](https://grammy.dev/resources/comparison)
