# Self-Hosted Agent Wallet Daemon: Architecture Patterns

**Domain:** Self-Hosted AI Agent Wallet Daemon (v0.2)
**Researched:** 2026-02-05
**Overall Confidence:** MEDIUM-HIGH (Cross-verified with official sources and v0.1 design artifacts)

---

## 1. Executive Summary

This document defines the architecture for WAIaaS v0.2: a self-hosted wallet daemon that removes all cloud dependencies (AWS KMS, Nitro Enclaves, PostgreSQL, Redis) while preserving the security guarantees designed in v0.1 (Dual Key separation, 4-level escalation, agent lifecycle state machine, chain abstraction).

The core architectural shift is from "cloud services provide security boundaries" to "the daemon process itself is the security boundary." Every component that previously relied on an external service must now be reimplemented as an in-process module with equivalent guarantees.

**Key architectural decisions:**
- Monolithic daemon process with modular internal architecture (not microservices)
- Local encrypted keystore using AES-256-GCM + Argon2id (Ethereum Keystore V3-inspired format)
- Session tokens issued via SIWE/SIWS-style wallet signature verification
- SQLite with WAL mode via better-sqlite3 (or Drizzle ORM) for persistent storage
- In-memory transaction queue with time-lock scheduling
- Hono or Fastify HTTP server with graceful shutdown handlers
- IBlockchainAdapter interface preserved from v0.1, stripped of Squads dependency

---

## 2. v0.1 Integration Analysis

### 2.1 Components to Reuse Directly

| v0.1 Component | Source Document | v0.2 Usage | Modification Needed |
|----------------|-----------------|------------|---------------------|
| `IBlockchainAdapter` interface | ARCH-05 (12-multichain-extension.md) | Chain abstraction layer | Remove `createSmartWallet`, `addMember`, `removeMember` (Squads-specific). Keep `buildTransaction`, `simulateTransaction`, `submitTransaction`, `getBalance`, `getAssets`, `healthCheck`. |
| Agent lifecycle 5-state model | REL-03 (15-agent-lifecycle-management.md) | Agent state management | Remove Squads-specific transitions (SpendingLimit removal). Keep CREATING/ACTIVE/SUSPENDED/TERMINATING/TERMINATED with local policy engine as enforcement. |
| 4-level escalation framework | ARCH-03 (10-transaction-flow.md) | Transaction tier routing | Remove Enclave/Squads layers. Replace with: Session validation -> Local policy engine -> Time-lock queue -> In-process signing. |
| Emergency trigger patterns | REL-04 (16-emergency-recovery.md) | Kill switch + auto-suspend | Remove Squads Vault operations. Keep 4 trigger types (manual, circuit_breaker, anomaly_detection, inactivity_timeout) with local enforcement. |
| RBAC + ABAC hybrid auth model | API-03 (19-permission-policy-model.md) | Permission model | Replace API Key with Session Token as primary auth. Keep 4 roles (owner, agent, viewer, auditor) and ABAC policy attributes. |
| Domain models (Wallet, Transaction, Policy) | ARCH-02 (09-system-components.md) | Core domain layer | Remove Solana-specific types (PublicKey, etc). Use chain-agnostic string types. |
| Monorepo structure | ARCH-02 (09-system-components.md) | Package organization | Promote `packages/selfhost` to primary path. Rename to `packages/daemon`. |
| Zod SSoT pattern | API-01, API-04 | Schema validation | Reuse entirely. Zod schemas -> TypeScript types + runtime validation + OpenAPI. |
| Error code system (46 codes) | API-04 (20-error-codes.md) | Error handling | Reuse entirely. Add session-specific error codes. |

### 2.2 Components to Redesign

| v0.1 Component | Why Redesign | v0.2 Replacement |
|----------------|--------------|------------------|
| `IKeyManagementService` | References AWS KMS / Nitro Enclave | New `ILocalKeyStore` interface: encrypt/decrypt/sign with local keystore file |
| `CloudKeyManagementService` | AWS-dependent | `LocalKeyStoreService`: AES-256-GCM + Argon2id file encryption |
| `IPolicyEngine` (3-layer: Server + Enclave + Squads) | Enclave and Squads removed | Single-layer `LocalPolicyEngine` with equivalent rule evaluation |
| API Key authentication | Persistent keys inappropriate for self-hosted | Session token system: owner-wallet-signature -> short-lived JWT |
| PostgreSQL + Redis storage | External dependencies | SQLite (better-sqlite3 + WAL) + In-memory LRU cache |
| Transaction flow (8 steps) | Enclave + Squads steps removed | 6-step flow: Receive -> Validate session -> Policy check -> Time-lock -> Sign -> Submit |

### 2.3 Entirely New Components

| Component | Purpose | No v0.1 Equivalent |
|-----------|---------|---------------------|
| `SessionManager` | Issue, validate, revoke session tokens via owner wallet signature | v0.1 used permanent API Keys |
| `TimeLockQueue` | Hold transactions in pending state with configurable delay | v0.1 delegated to Squads on-chain |
| `NotificationDispatcher` | Multi-channel alerts (Telegram, Discord, Push) | v0.1 used AWS SNS/Webhooks |
| `OwnerConnectionBridge` | Local HTTP server <-> browser wallet communication | v0.1 assumed server-to-server KMS calls |
| `DaemonLifecycle` | Process startup, shutdown, signal handling | v0.1 assumed EC2 managed infrastructure |
| `CLIInterface` | `waiaas init/start/status/stop` commands | v0.1 had no CLI |
| `BackupManager` | Encrypted keystore backup/restore | v0.1 relied on AWS KMS backup |

---

## 3. Local Key Management Architecture

**Confidence: HIGH** (Cross-verified with Ethereum Keystore V3 spec, libsodium official docs, cryptographic best practices)

### 3.1 Keystore File Format

Use an Ethereum Keystore V3-inspired JSON format, upgraded with modern cryptography:

```
File: ~/.waiaas/keystore/<agent-id>.json
```

```json
{
  "version": 1,
  "id": "uuid-v4",
  "type": "agent-key",
  "chain": "solana",
  "publicKey": "base58-encoded-public-key",
  "crypto": {
    "cipher": "aes-256-gcm",
    "cipherparams": {
      "iv": "hex-encoded-96-bit-nonce"
    },
    "ciphertext": "hex-encoded-encrypted-secret-key",
    "tag": "hex-encoded-128-bit-gcm-auth-tag",
    "kdf": "argon2id",
    "kdfparams": {
      "salt": "hex-encoded-32-byte-salt",
      "opslimit": 3,
      "memlimit": 67108864,
      "parallelism": 1,
      "hashLength": 32
    }
  },
  "metadata": {
    "createdAt": "ISO-8601",
    "lastUsedAt": "ISO-8601",
    "rotatedAt": null,
    "agentId": "agent-uuid"
  }
}
```

**Why this format over raw encrypted binary:**
- Human-inspectable structure (debuggability)
- Self-describing KDF parameters (forward-compatible)
- Consistent with Ethereum ecosystem patterns (developer familiarity)
- Separate metadata from crypto material (can read metadata without decryption)

**Differences from Ethereum V3:**
- Uses AES-256-GCM instead of AES-128-CTR (stronger, built-in authentication)
- Uses Argon2id instead of scrypt/PBKDF2 (memory-hard, side-channel resistant)
- Includes GCM authentication tag (replaces separate MAC field)
- No separate MAC calculation needed (GCM provides AEAD)

### 3.2 Key Derivation Parameters

```
Algorithm: Argon2id (crypto_pwhash_ALG_ARGON2ID13)
Salt: 32 bytes from CSPRNG
Memory: 64 MB (MEMLIMIT_MODERATE) — tuned for >= 300ms on target hardware
Operations: 3 (OPSLIMIT_MODERATE)
Output: 32 bytes (256-bit AES key)
```

**Parameter Tuning Guidance:**
- Default parameters should target approximately 300ms derivation time on consumer hardware
- For server deployments (Docker), can increase to OPSLIMIT_SENSITIVE / MEMLIMIT_SENSITIVE
- Parameters are stored in the keystore file, allowing per-file tuning
- Users should NOT need to remember or configure these directly -- CLI wizard sets them

### 3.3 Memory Safety

**Library Choice: `sodium-native` (not `libsodium-wrappers`)**

Use `sodium-native` for its critical memory safety features:

| Feature | `sodium-native` | `libsodium-wrappers` |
|---------|-----------------|----------------------|
| `sodium_memzero()` | Direct binding | Not exposed |
| `sodium_mlock()` | Direct binding | Not exposed |
| `sodium_malloc()` | Guarded heap allocation | Not available |
| `sodium_mprotect_noaccess()` | Page-level protection | Not available |
| Performance | Native C bindings | WASM (slower) |

**Memory safety protocol for key material:**

```
1. Allocate key buffer via sodium_malloc() (guarded memory)
2. Decrypt secret key into guarded buffer
3. Perform signing operation
4. Immediately sodium_memzero() the key buffer
5. sodium_mprotect_noaccess() when not actively signing
```

**Fallback for environments where `sodium-native` cannot compile:**
Use `libsodium-wrappers` with manual buffer zeroing (`buffer.fill(0)`) and accept the reduced guarantee. Document this as a known limitation.

### 3.4 ILocalKeyStore Interface

```typescript
// packages/core/src/interfaces/ILocalKeyStore.ts

/**
 * Replaces IKeyManagementService from v0.1.
 * All operations are local -- no network calls.
 */
export interface ILocalKeyStore {
  /**
   * Initialize keystore with master password.
   * Derives encryption key via Argon2id.
   * Holds derived key in guarded memory.
   */
  unlock(password: string): Promise<void>;

  /**
   * Zeroize all key material from memory.
   */
  lock(): void;

  /**
   * Generate new ED25519 keypair, encrypt and persist.
   * @returns Public key of generated keypair
   */
  createKey(agentId: string, chain: ChainId): Promise<string>;

  /**
   * Sign message with agent's key.
   * Requires keystore to be unlocked.
   * Key is decrypted into guarded memory, used, then zeroed.
   */
  sign(agentId: string, message: Uint8Array): Promise<Uint8Array>;

  /**
   * Get public key for agent (does not require unlock).
   */
  getPublicKey(agentId: string): Promise<string>;

  /**
   * Rotate agent key: generate new, keep old for grace period.
   */
  rotateKey(agentId: string): Promise<string>;

  /**
   * Permanently delete key material.
   */
  destroyKey(agentId: string): Promise<void>;

  /**
   * Export encrypted keystore for backup.
   */
  exportBackup(agentId: string): Promise<EncryptedBackup>;

  /**
   * Import keystore from backup.
   */
  importBackup(backup: EncryptedBackup, password: string): Promise<void>;

  /**
   * Health check: keystore accessible and key material loadable.
   */
  healthCheck(): Promise<boolean>;
}
```

### 3.5 Key Hierarchy

```
Master Password (user input)
    |
    v  [Argon2id KDF]
Master Encryption Key (MEK) -- held in guarded memory while daemon runs
    |
    +---> Agent Key 1 (encrypted with MEK, stored in keystore file)
    +---> Agent Key 2 (encrypted with MEK, stored in keystore file)
    +---> ...Agent Key N
```

**Important: The daemon does NOT generate or store the Owner's private key.**
The Owner authenticates by signing messages with their external wallet (Phantom, MetaMask, Ledger). The daemon only stores the Owner's public key/address for verification.

---

## 4. Session Token Architecture

**Confidence: HIGH** (Based on SIWE EIP-4361 standard, SIWS specification, JWT best practices)

### 4.1 Session Lifecycle

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Session Token Lifecycle                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. Agent requests session                                           │
│     POST /v1/sessions { agentId, requestedScopes, requestedLimits }  │
│                                                                      │
│  2. Daemon creates challenge                                         │
│     → Generates nonce + SIWS/SIWE message                           │
│     → Notifies owner via configured channels                        │
│                                                                      │
│  3. Owner signs challenge via wallet                                 │
│     → Browser extension / WalletConnect / CLI                        │
│     → Signs structured message containing:                           │
│       domain, address, nonce, agentId, scopes, limits, expiry       │
│                                                                      │
│  4. Daemon verifies signature + issues token                         │
│     → Verify ED25519/ECDSA signature against owner public key       │
│     → Verify nonce (anti-replay)                                    │
│     → Generate JWT with embedded claims                              │
│     → Store session record in SQLite                                 │
│                                                                      │
│  5. Agent uses token for API calls                                   │
│     Authorization: Bearer <session-token>                            │
│                                                                      │
│  6. Token expires or is revoked                                      │
│     → Auto-expire at TTL                                             │
│     → Owner can revoke via DELETE /v1/sessions/:id                  │
│     → Kill Switch revokes ALL sessions                               │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 Token Structure

Use locally-signed JWTs (HS256 with daemon-generated secret, NOT asymmetric):

```json
{
  "header": {
    "alg": "HS256",
    "typ": "JWT"
  },
  "payload": {
    "sub": "agent-uuid",
    "iss": "waiaas-daemon",
    "iat": 1738700000,
    "exp": 1738786400,
    "jti": "session-uuid",
    "scopes": ["transactions:execute", "wallets:read"],
    "limits": {
      "maxTotalAmount": "10000000000",
      "maxPerTxAmount": "1000000000",
      "allowedOps": ["transfer", "swap"],
      "allowedChains": ["solana"]
    },
    "ownerAddress": "owner-public-key"
  }
}
```

**Why JWT instead of opaque tokens:**
- Self-contained: daemon can validate without database lookup on every request
- Embedded claims: limits and scopes checked at validation time
- Standard format: agent SDKs can decode (not verify) to check remaining limits
- Revocation handled via SQLite blocklist (checked only for long-lived sessions)

**Why HS256 instead of RS256/ES256:**
- Single-process daemon: no need for asymmetric verification by external parties
- Faster: HS256 is significantly faster than asymmetric alternatives
- Simpler key management: single HMAC secret rotated on daemon restart

### 4.3 Session Storage Schema (SQLite)

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,           -- UUID
  agent_id TEXT NOT NULL,
  owner_address TEXT NOT NULL,
  token_hash TEXT NOT NULL,      -- SHA-256 of JWT (for revocation lookup)
  scopes TEXT NOT NULL,          -- JSON array
  limits TEXT NOT NULL,          -- JSON object
  total_spent INTEGER DEFAULT 0, -- Lamports/Wei spent in this session
  tx_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,   -- Unix timestamp
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  revocation_reason TEXT,
  last_used_at INTEGER,
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE INDEX idx_sessions_agent ON sessions(agent_id);
CREATE INDEX idx_sessions_active ON sessions(expires_at) WHERE revoked_at IS NULL;
```

### 4.4 Session Validation Flow (per request)

```
Request arrives with Authorization: Bearer <token>
    |
    v
1. Decode JWT (no DB call)
    |
    v
2. Verify HMAC signature with daemon secret
    |-- FAIL --> 401 INVALID_TOKEN
    v
3. Check exp claim
    |-- EXPIRED --> 401 SESSION_EXPIRED
    v
4. Check jti against revocation blocklist (in-memory LRU, backed by SQLite)
    |-- REVOKED --> 401 SESSION_REVOKED
    v
5. Check scopes against requested operation
    |-- INSUFFICIENT --> 403 SCOPE_INSUFFICIENT
    v
6. Check limits.maxPerTxAmount against request amount
    |-- EXCEEDED --> 403 PER_TX_LIMIT_EXCEEDED
    v
7. Check limits.maxTotalAmount against session total_spent (from cache/DB)
    |-- EXCEEDED --> 403 SESSION_LIMIT_EXCEEDED
    v
8. Proceed to policy engine
```

Steps 1-5 are purely in-memory (no DB). Step 6-7 require a cache lookup (LRU with SQLite fallback).

### 4.5 Owner Wallet Connection for Session Approval

**Pattern: Local HTTP server + SIWS/SIWE message signing**

The daemon runs a local HTTP server. The Owner connects via:

**Option A: Browser-based approval page (Primary)**
```
1. Daemon serves approval UI at http://localhost:3000/approve
2. Page loads Solana Wallet Adapter / wagmi for EVM
3. Owner connects wallet via browser extension (Phantom, MetaMask)
4. Daemon presents SIWS/SIWE message for signing
5. Owner signs in wallet popup
6. Signature sent to daemon via localhost API
7. Daemon verifies and issues session token
```

**Option B: CLI-based approval**
```
1. Daemon prints challenge message to stdout
2. Owner signs message using external tool (solana CLI, cast, etc.)
3. Owner pastes signature back into CLI
4. Daemon verifies and issues session token
```

**Option C: WalletConnect relay (Remote approval)**
```
1. Daemon generates WalletConnect pairing URI
2. Owner scans QR code with mobile wallet
3. Sign request sent via WalletConnect relay
4. Owner approves on mobile
5. Signature relayed back to daemon
```

**Security considerations for localhost:**
- Bind to `127.0.0.1` only (never `0.0.0.0`)
- Set strict CORS: `Access-Control-Allow-Origin: http://localhost:3000`
- Implement CSRF protection via nonce
- Be aware of DNS rebinding attacks -- validate `Host` header
- Rate-limit approval attempts

---

## 5. Transaction Queue Architecture

**Confidence: HIGH** (Based on v0.1 escalation design + standard queue patterns)

### 5.1 Transaction Processing Pipeline

```
┌─────────────────────────────────────────────────────────────────────┐
│                 Transaction Processing Pipeline                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Agent Request                                                       │
│       |                                                              │
│       v                                                              │
│  [1. Session Validation] ── FAIL ──> 401/403 Response               │
│       |                                                              │
│       v  PASS                                                        │
│  [2. Request Parsing + Zod Validation] ── FAIL ──> 400 Response     │
│       |                                                              │
│       v  PASS                                                        │
│  [3. Policy Evaluation]                                              │
│       |  Checks: amount limits, whitelist, time rules,              │
│       |          session limits, agent status                        │
│       |── REJECTED ──> 403 POLICY_VIOLATION + Escalation            │
│       v  ALLOWED                                                     │
│  [4. Escalation Tier Routing]                                        │
│       |                                                              │
│       +──── IMMEDIATE (< 0.1 SOL) ────> [5. Sign + Submit]         │
│       |                                                              │
│       +──── NOTIFY (0.1-1 SOL) ────> [5. Sign + Submit]            │
│       |                                + Notify Owner               │
│       |                                                              │
│       +──── TIME_LOCK (1-5 SOL) ────> [Pending Queue]              │
│       |                                 Wait 10 min                 │
│       |                                 Owner can cancel            │
│       |                                 ── timeout ──> [5. Sign]    │
│       |                                                              │
│       +──── APPROVAL (> 5 SOL) ────> [Pending Queue]               │
│                                        Require Owner signature      │
│                                        ── approved ──> [5. Sign]    │
│                                        ── timeout ──> Auto-reject   │
│                                                                      │
│  [5. Build + Simulate + Sign + Submit]                               │
│       |                                                              │
│       v                                                              │
│  [6. Confirmation + Notification]                                    │
│       |                                                              │
│       v                                                              │
│  [7. Update session spent + Log]                                     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 Pending Transaction Queue

```typescript
// packages/core/src/services/TimeLockQueue.ts

interface PendingTransaction {
  id: string;                  // UUID
  agentId: string;
  sessionId: string;
  request: TransactionRequest; // Chain-agnostic request
  tier: 'TIME_LOCK' | 'APPROVAL';
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';
  createdAt: number;           // Unix timestamp
  expiresAt: number;           // Auto-reject time
  unlockAt: number | null;     // For TIME_LOCK: when auto-approved
  approvedBy: string | null;   // Owner address if manually approved
  rejectedReason: string | null;
}
```

**Queue implementation:**
- **Storage:** SQLite table + in-memory Map for active items
- **Scheduling:** `setInterval` checking queue every second for expired/unlocked items
- **No external queue needed:** Transaction volume is low (agent wallets, not exchange)
- **Persistence:** All pending txs survive daemon restart via SQLite

### 5.3 Pending Transaction Table (SQLite)

```sql
CREATE TABLE pending_transactions (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  request TEXT NOT NULL,           -- JSON serialized TransactionRequest
  tier TEXT NOT NULL,              -- 'TIME_LOCK' | 'APPROVAL'
  status TEXT NOT NULL DEFAULT 'PENDING',
  chain TEXT NOT NULL,
  amount INTEGER NOT NULL,         -- In smallest unit (lamports/wei)
  destination TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  unlock_at INTEGER,
  approved_by TEXT,
  rejected_reason TEXT,
  resolved_at INTEGER,
  tx_signature TEXT,               -- After submission
  FOREIGN KEY (agent_id) REFERENCES agents(id),
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE INDEX idx_pending_status ON pending_transactions(status)
  WHERE status = 'PENDING';
CREATE INDEX idx_pending_agent ON pending_transactions(agent_id);
```

### 5.4 Queue Processing Logic

```
Every 1 second:
  FOR EACH pending tx WHERE status = 'PENDING':
    IF tier = 'TIME_LOCK' AND now >= unlock_at:
      -> Move to signing pipeline
      -> Update status = 'APPROVED' (auto)
    ELSE IF now >= expires_at:
      -> Update status = 'EXPIRED'
      -> Notify agent of rejection

Owner approval endpoint:
  POST /v1/owner/approve/:txId
    -> Verify owner wallet signature
    -> Update status = 'APPROVED'
    -> Move to signing pipeline

Owner rejection endpoint:
  POST /v1/owner/reject/:txId
    -> Update status = 'REJECTED'
    -> Notify agent

Kill Switch:
  -> Set ALL pending txs to 'CANCELLED'
  -> Revoke ALL active sessions
  -> Set ALL agents to SUSPENDED
```

---

## 6. Chain Adapter Pattern (v0.2)

**Confidence: HIGH** (Based on v0.1 IBlockchainAdapter + removal of Squads-specific methods)

### 6.1 Simplified Interface for Self-Hosted

The v0.1 `IBlockchainAdapter` included Squads-specific smart wallet management. For v0.2 self-hosted, the adapter is simplified to raw chain operations:

```typescript
// packages/core/src/interfaces/IBlockchainAdapter.ts (v0.2)

export interface IBlockchainAdapter {
  // ---- Chain Identification ----
  getChainId(): ChainId;       // 'solana' | 'ethereum' | 'polygon' | ...
  getNetwork(): string;         // 'mainnet-beta' | 'devnet' | 'mainnet' | ...

  // ---- Transaction Lifecycle ----
  buildTransaction(request: TransactionRequest): Promise<UnsignedTransaction>;
  simulateTransaction(tx: UnsignedTransaction): Promise<SimulationResult>;
  submitTransaction(signedTx: SignedTransaction): Promise<TransactionResult>;
  getTransactionStatus(txHash: string): Promise<TransactionStatus>;

  // ---- Balance & Assets ----
  getBalance(address: string, asset?: AssetId): Promise<Balance>;
  getAssets(address: string): Promise<Asset[]>;

  // ---- Address Utilities ----
  isValidAddress(address: string): boolean;
  getAddressFromPublicKey(publicKey: Uint8Array): string;

  // ---- Connection ----
  healthCheck(): Promise<boolean>;
  getBlockHeight(): Promise<number>;
  estimateFee(tx: UnsignedTransaction): Promise<FeeEstimate>;
}
```

**Removed from v0.1:**
- `createSmartWallet()` -- no Squads multisig
- `addMember()` / `removeMember()` -- no Squads member management
- `updateWalletConfig()` -- policy managed locally, not on-chain

**Added for v0.2:**
- `isValidAddress()` -- chain-specific address validation
- `getAddressFromPublicKey()` -- derive address from Ed25519/secp256k1 pubkey
- `estimateFee()` -- needed for policy engine (amount + fee check)

### 6.2 Solana Adapter Implementation

```typescript
// packages/adapters/solana/SolanaAdapter.ts

export class SolanaAdapter implements IBlockchainAdapter {
  private connection: Connection;  // @solana/web3.js or @solana/kit

  constructor(config: SolanaConfig) {
    this.connection = new Connection(config.rpcUrl, config.commitment);
  }

  async buildTransaction(request: TransactionRequest): Promise<UnsignedTransaction> {
    // 1. Get recent blockhash
    // 2. Create transfer/swap instruction based on request type
    // 3. Return serialized unsigned transaction
  }

  async simulateTransaction(tx: UnsignedTransaction): Promise<SimulationResult> {
    // 1. Deserialize transaction
    // 2. Call connection.simulateTransaction()
    // 3. Return success/failure + compute units
  }

  async submitTransaction(signedTx: SignedTransaction): Promise<TransactionResult> {
    // 1. Send raw transaction with confirmation strategy
    // 2. Wait for confirmation (configurable: processed/confirmed/finalized)
    // 3. Return tx signature + status
  }
}
```

### 6.3 EVM Adapter Implementation (Stub)

```typescript
// packages/adapters/evm/EVMAdapter.ts

export class EVMAdapter implements IBlockchainAdapter {
  private provider: ethers.JsonRpcProvider;  // ethers.js v6

  constructor(config: EVMConfig) {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
  }

  // Implementation follows same pattern:
  // buildTransaction -> ethers.Transaction
  // simulateTransaction -> provider.call()
  // submitTransaction -> provider.broadcastTransaction()
}
```

### 6.4 Adapter Registry

```typescript
// packages/core/src/services/AdapterRegistry.ts

export class AdapterRegistry {
  private adapters: Map<ChainId, IBlockchainAdapter> = new Map();

  register(adapter: IBlockchainAdapter): void {
    this.adapters.set(adapter.getChainId(), adapter);
  }

  get(chainId: ChainId): IBlockchainAdapter {
    const adapter = this.adapters.get(chainId);
    if (!adapter) throw new ChainNotSupportedError(chainId);
    return adapter;
  }

  getSupportedChains(): ChainId[] {
    return Array.from(this.adapters.keys());
  }
}
```

### 6.5 Signing Architecture (Adapter + KeyStore Coordination)

In v0.1, the Enclave performed both signing and policy verification. In v0.2, these are separate concerns:

```
TransactionService
    |
    +---> PolicyEngine.evaluate(tx)      -- Policy check (local)
    |         |
    |         v
    +---> KeyStore.sign(agentId, txBytes) -- Signing (local)
    |         |
    |         v
    +---> Adapter.submitTransaction(signedTx) -- Submission (network)
```

The adapter never touches key material. The keystore never touches blockchain APIs. Clean separation of concerns.

---

## 7. Daemon Process Architecture

**Confidence: MEDIUM-HIGH** (Based on Hono/Fastify official docs + Node.js daemon best practices)

### 7.1 Process Lifecycle

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Daemon Process Lifecycle                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  [waiaas start]                                                      │
│       |                                                              │
│       v                                                              │
│  1. Load configuration (~/.waiaas/config.toml)                      │
│       |                                                              │
│       v                                                              │
│  2. Initialize SQLite (WAL mode, run migrations)                    │
│       |                                                              │
│       v                                                              │
│  3. Initialize KeyStore (prompt for master password if interactive)  │
│       |                                                              │
│       v                                                              │
│  4. Register chain adapters (Solana, EVM based on config)           │
│       |                                                              │
│       v                                                              │
│  5. Initialize services (SessionManager, PolicyEngine, TxQueue)     │
│       |                                                              │
│       v                                                              │
│  6. Start HTTP server (bind 127.0.0.1:3000)                        │
│       |                                                              │
│       v                                                              │
│  7. Start background workers:                                        │
│       - Pending queue processor (1s interval)                       │
│       - Session expiry cleanup (60s interval)                       │
│       - Health check heartbeat (30s interval)                       │
│       - WAL checkpoint (300s interval)                               │
│       |                                                              │
│       v                                                              │
│  8. Register signal handlers (SIGINT, SIGTERM, SIGHUP)              │
│       |                                                              │
│       v                                                              │
│  [RUNNING -- serving requests]                                       │
│       |                                                              │
│  [SIGINT/SIGTERM received]                                           │
│       |                                                              │
│       v                                                              │
│  Graceful Shutdown:                                                  │
│  1. Stop accepting new connections                                   │
│  2. Set Connection: close on all responses                          │
│  3. Wait for in-flight requests (max 30s timeout)                   │
│  4. Persist pending queue state to SQLite                            │
│  5. Run WAL checkpoint (TRUNCATE)                                   │
│  6. Lock keystore (zeroize key material)                            │
│  7. Close SQLite connection                                          │
│  8. Exit process                                                     │
│                                                                      │
│  [SIGHUP received]                                                   │
│       |                                                              │
│       v                                                              │
│  Reload configuration without restart                                │
│  (policy rules, notification channels, tier thresholds)              │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.2 Component Dependency Graph

```
DaemonLifecycle (orchestrator)
    |
    +---> ConfigLoader
    |       |
    |       v
    +---> Database (SQLite + better-sqlite3)
    |       |
    |       v
    +---> LocalKeyStore (sodium-native)
    |       |
    |       v
    +---> AdapterRegistry
    |       +---> SolanaAdapter
    |       +---> EVMAdapter (optional)
    |       |
    |       v
    +---> SessionManager
    |       |
    |       v
    +---> PolicyEngine
    |       |
    |       v
    +---> TimeLockQueue
    |       |
    |       v
    +---> TransactionService (coordinates Adapter + KeyStore + Policy)
    |       |
    |       v
    +---> NotificationDispatcher
    |       +---> TelegramChannel
    |       +---> DiscordChannel
    |       +---> WebhookChannel
    |       |
    |       v
    +---> HttpServer (Hono or Fastify)
    |       +---> SessionAuthMiddleware
    |       +---> OwnerAuthMiddleware
    |       +---> RateLimitMiddleware
    |       +---> Routes
    |       |
    |       v
    +---> BackgroundWorkers
            +---> QueueProcessor
            +---> SessionCleaner
            +---> HealthChecker
            +---> WalCheckpointer
```

### 7.3 HTTP Server Choice: Hono (Recommended) vs Fastify

| Criterion | Hono | Fastify |
|-----------|------|---------|
| Bundle size | ~14KB | ~2MB with plugins |
| Runtime support | Node, Bun, Deno, CF Workers | Node primarily |
| TypeScript | Native, excellent DX | Good with @types |
| Middleware pattern | Web Standards (Request/Response) | Plugin-based |
| Performance | Comparable to Fastify | Industry-leading for Node |
| Graceful shutdown | Via @hono/node-server | Built-in |
| Ecosystem | Growing rapidly (2024-2025) | Mature, extensive plugins |
| Future portability | Can run on Bun/Deno if needed | Node-locked |

**Recommendation: Hono** for v0.2 because:
1. Lighter footprint suits a daemon better than a full web framework
2. Web Standards APIs enable future runtime portability (Bun)
3. Middleware pattern is cleaner for the auth pipeline (session -> RBAC -> ABAC)
4. v0.1 already listed Hono as an alternative to Fastify

**Note:** If the team has deep Fastify expertise from v0.1 prototyping, Fastify remains a valid choice. The architecture is framework-agnostic at the service layer.

### 7.4 Data Directory Layout

```
~/.waiaas/
    config.toml              # Daemon configuration
    data/
        waiaas.db            # SQLite database
        waiaas.db-wal        # WAL file
        waiaas.db-shm        # Shared memory file
    keystore/
        <agent-id>.json      # Encrypted agent keys
    logs/
        daemon.log           # Application log
        audit.log            # Security audit log
    backups/
        <timestamp>.backup   # Encrypted keystore backups
```

### 7.5 Configuration File (config.toml)

```toml
[daemon]
host = "127.0.0.1"
port = 3000
log_level = "info"

[owner]
address = "owner-wallet-public-key"
chain = "solana"

[chains.solana]
enabled = true
rpc_url = "https://api.mainnet-beta.solana.com"
# rpc_url = "https://mainnet.helius-rpc.com/?api-key=xxx"
network = "mainnet-beta"
commitment = "confirmed"

[chains.ethereum]
enabled = false
rpc_url = "https://eth-mainnet.g.alchemy.com/v2/xxx"
chain_id = 1

[security]
session_ttl = "24h"
max_sessions_per_agent = 3
time_lock_duration = "10m"
approval_timeout = "1h"
auto_lock_timeout = "30m"  # Lock keystore after idle

[policy.tiers]
immediate_max = "0.1 SOL"       # < 0.1 SOL: execute immediately
notify_max = "1 SOL"            # 0.1-1 SOL: execute + notify
time_lock_max = "5 SOL"         # 1-5 SOL: time-lock + notify
# > 5 SOL: require owner approval

[notifications]
telegram_bot_token = ""
telegram_chat_id = ""
discord_webhook_url = ""

[backup]
auto_backup = true
backup_interval = "24h"
max_backups = 7
```

---

## 8. Complete Data Flow

**Confidence: HIGH** (Synthesized from all research areas)

### 8.1 Agent Transaction Request (Happy Path)

```
┌───────────┐       ┌───────────────────────────────────────────────┐
│ AI Agent  │       │              WAIaaS Daemon                     │
│           │       │                                                │
│ SDK/MCP   │       │  HTTP   Session   Policy  Queue  KeyStore     │
│           │       │  Server  Mgr      Engine        Adapter       │
└─────┬─────┘       └───┬──────┬────────┬───────┬──────┬─────┬─────┘
      │                  │      │        │       │      │     │
      │ POST /v1/tx      │      │        │       │      │     │
      │ Bearer <token>   │      │        │       │      │     │
      │─────────────────>│      │        │       │      │     │
      │                  │      │        │       │      │     │
      │                  │ validate()    │       │      │     │
      │                  │─────>│        │       │      │     │
      │                  │      │ verify │       │      │     │
      │                  │      │ JWT    │       │      │     │
      │                  │      │ check  │       │      │     │
      │                  │      │ limits │       │      │     │
      │                  │<─────│ OK     │       │      │     │
      │                  │      │        │       │      │     │
      │                  │ evaluate()    │       │      │     │
      │                  │──────────────>│       │      │     │
      │                  │              check    │      │     │
      │                  │              amount   │      │     │
      │                  │              whitelist│      │     │
      │                  │              time     │      │     │
      │                  │              circuit  │      │     │
      │                  │<──────────────│ ALLOW  │      │     │
      │                  │              tier=    │      │     │
      │                  │              IMMEDIATE│      │     │
      │                  │               │       │      │     │
      │                  │ buildTx()     │       │      │     │
      │                  │──────────────────────────────────>│
      │                  │                              build│
      │                  │<─────────────────────────────────│
      │                  │                                   │
      │                  │ simulateTx()  │       │      │   │
      │                  │──────────────────────────────────>│
      │                  │<─────────────────────────────────│
      │                  │               │       │          │
      │                  │ sign()        │       │          │
      │                  │──────────────────────>│          │
      │                  │               unlock  │          │
      │                  │               decrypt │          │
      │                  │               sign    │          │
      │                  │               zeroize │          │
      │                  │<─────────────────────│          │
      │                  │               │       │          │
      │                  │ submitTx()    │       │          │
      │                  │──────────────────────────────────>│
      │                  │               │       │    submit│
      │                  │               │       │    confirm
      │                  │<─────────────────────────────────│
      │                  │               │       │          │
      │  200 OK          │               │       │          │
      │  { signature,    │               │       │          │
      │    status }      │               │       │          │
      │<─────────────────│               │       │          │
      │                  │               │       │          │
      │                  │ updateSpent() │       │          │
      │                  │─────>│        │       │          │
      │                  │      │ +amount│       │          │
      │                  │      │        │       │          │
      │                  │ notify()      │       │          │
      │                  │──────────────────> owner         │
```

### 8.2 Time-Lock Transaction Flow

```
Agent Request (amount = 2 SOL, tier = TIME_LOCK)
    |
    v
[Session + Policy check passes]
    |
    v
[Queue: Insert pending_transaction with unlock_at = now + 10min]
    |
    v
[Return 202 Accepted { pendingTxId, unlockAt, status: "PENDING" }]
    |
    +---> [Notify owner: "2 SOL transfer queued, auto-executes in 10min"]
    |
    +---> [Owner can: POST /v1/owner/reject/:txId to cancel]
    |
    [10 minutes pass, no cancellation]
    |
    v
[QueueProcessor: detect unlock_at <= now]
    |
    v
[Build -> Simulate -> Sign -> Submit]
    |
    v
[Notify agent via webhook: "Transaction confirmed"]
[Notify owner: "2 SOL transfer executed"]
```

### 8.3 Approval-Required Transaction Flow

```
Agent Request (amount = 10 SOL, tier = APPROVAL)
    |
    v
[Session + Policy check passes]
    |
    v
[Queue: Insert pending_transaction with expires_at = now + 1h]
    |
    v
[Return 202 Accepted { pendingTxId, status: "AWAITING_APPROVAL" }]
    |
    +---> [Notify owner: "10 SOL transfer requires your approval"]
    |       |
    |       +---> [Owner opens localhost:3000/approve]
    |       +---> [Signs approval message with wallet]
    |       +---> [POST /v1/owner/approve/:txId]
    |               |
    |               v
    |       [Build -> Simulate -> Sign -> Submit]
    |               |
    |               v
    |       [Notify agent: "Transaction confirmed"]
    |
    OR
    |
    [1 hour passes, no approval]
    |
    v
[QueueProcessor: detect expires_at <= now]
    |
    v
[Update status = 'EXPIRED']
[Notify agent: "Transaction expired - owner did not approve"]
```

---

## 9. Recommended Monorepo Structure (v0.2)

```
waiaas/
├── packages/
│   ├── core/                        # Chain-agnostic domain & interfaces
│   │   ├── src/
│   │   │   ├── domain/
│   │   │   │   ├── wallet/          # Wallet, WalletStatus
│   │   │   │   ├── transaction/     # Transaction, TransactionRequest
│   │   │   │   ├── policy/          # AgentPolicy, PolicyRule, PolicyViolation
│   │   │   │   ├── session/         # Session, SessionLimits [NEW]
│   │   │   │   └── emergency/       # EmergencyTrigger (from v0.1)
│   │   │   ├── interfaces/
│   │   │   │   ├── IBlockchainAdapter.ts    # Simplified from v0.1
│   │   │   │   ├── ILocalKeyStore.ts        # NEW (replaces IKeyManagementService)
│   │   │   │   ├── IPolicyEngine.ts         # Simplified (single layer)
│   │   │   │   ├── ISessionManager.ts       # NEW
│   │   │   │   ├── INotificationChannel.ts  # NEW
│   │   │   │   └── IRepository.ts           # Generic data access
│   │   │   ├── services/
│   │   │   │   ├── TransactionService.ts    # Coordinates adapter + keystore + policy
│   │   │   │   ├── PolicyEngine.ts          # Local rule evaluation
│   │   │   │   ├── SessionManager.ts        # NEW: token issuance/validation
│   │   │   │   ├── TimeLockQueue.ts         # NEW: pending tx management
│   │   │   │   └── AlertService.ts          # NEW: multi-channel notifications
│   │   │   └── utils/
│   │   │       ├── crypto.ts
│   │   │       └── validation.ts            # Zod schemas (SSoT)
│   │   └── package.json
│   │
│   ├── daemon/                      # Self-hosted daemon (was selfhost)
│   │   ├── src/
│   │   │   ├── infrastructure/
│   │   │   │   ├── keystore/
│   │   │   │   │   ├── LocalKeyStoreService.ts     # sodium-native impl
│   │   │   │   │   └── KeystoreFileManager.ts      # File I/O
│   │   │   │   ├── database/
│   │   │   │   │   ├── SQLiteDatabase.ts           # better-sqlite3 + WAL
│   │   │   │   │   ├── migrations/                 # Schema migrations
│   │   │   │   │   └── repositories/               # SQLite implementations
│   │   │   │   ├── cache/
│   │   │   │   │   └── LRUCache.ts                 # In-memory cache
│   │   │   │   └── notifications/
│   │   │   │       ├── TelegramChannel.ts
│   │   │   │       ├── DiscordChannel.ts
│   │   │   │       └── WebhookChannel.ts
│   │   │   ├── server/
│   │   │   │   ├── app.ts                          # Hono app setup
│   │   │   │   ├── middleware/
│   │   │   │   │   ├── sessionAuth.ts
│   │   │   │   │   ├── ownerAuth.ts
│   │   │   │   │   └── rateLimit.ts
│   │   │   │   ├── routes/
│   │   │   │   │   ├── wallet.ts
│   │   │   │   │   ├── transactions.ts
│   │   │   │   │   ├── sessions.ts
│   │   │   │   │   ├── owner.ts
│   │   │   │   │   └── health.ts
│   │   │   │   └── owner-ui/                       # Static approval page
│   │   │   │       ├── index.html
│   │   │   │       └── approve.js                  # Wallet adapter integration
│   │   │   └── lifecycle/
│   │   │       ├── DaemonLifecycle.ts              # Startup/shutdown orchestrator
│   │   │       ├── BackgroundWorkers.ts            # Queue processor, cleaners
│   │   │       └── SignalHandler.ts                # SIGINT/SIGTERM/SIGHUP
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── adapters/                    # Chain-specific implementations
│   │   ├── solana/
│   │   │   ├── SolanaAdapter.ts
│   │   │   └── package.json
│   │   └── evm/
│   │       ├── EVMAdapter.ts
│   │       └── package.json
│   │
│   ├── cli/                         # CLI interface
│   │   ├── src/
│   │   │   ├── commands/
│   │   │   │   ├── init.ts          # waiaas init
│   │   │   │   ├── start.ts         # waiaas start
│   │   │   │   ├── stop.ts          # waiaas stop
│   │   │   │   ├── status.ts        # waiaas status
│   │   │   │   ├── link-owner.ts    # waiaas link-owner
│   │   │   │   └── backup.ts        # waiaas backup / restore
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── bin/
│   │       └── waiaas              # Entry point
│   │
│   ├── sdk/                         # TypeScript SDK
│   │   ├── src/
│   │   │   └── WAIaaS.ts
│   │   └── package.json
│   │
│   └── mcp/                         # MCP Server
│       ├── src/
│       │   └── server.ts
│       └── package.json
│
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml
│
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

**Key changes from v0.1:**
- `packages/selfhost` renamed to `packages/daemon` (promoted to primary)
- `packages/cloud` removed (out of scope for v0.2)
- `packages/api` merged into `packages/daemon/src/server/` (single deployable unit)
- `packages/adapters/` separated from daemon (pluggable)
- `packages/cli/` added (new)
- `packages/mcp/` separated (can run standalone)
- No `prisma/` directory (using Drizzle or raw better-sqlite3 with manual migrations)

---

## 10. Storage Architecture

**Confidence: HIGH** (better-sqlite3 official docs, SQLite WAL mode well-documented)

### 10.1 SQLite Configuration

```typescript
import Database from 'better-sqlite3';

const db = new Database(path.join(dataDir, 'waiaas.db'));

// Critical: Enable WAL mode for concurrent reads + single writer
db.pragma('journal_mode = WAL');

// Performance: NORMAL synchronous (safe for WAL mode, much faster)
db.pragma('synchronous = NORMAL');

// Safety: Enable foreign keys
db.pragma('foreign_keys = ON');

// Performance: 64MB cache (generous for a daemon)
db.pragma('cache_size = -64000');

// Performance: Memory-mapped I/O for reads
db.pragma('mmap_size = 268435456');  // 256MB
```

### 10.2 Core Schema

```sql
-- Agent definitions
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  chain TEXT NOT NULL,
  public_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'CREATING',  -- 5-state lifecycle
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  suspended_at INTEGER,
  suspension_reason TEXT
);

-- Sessions (see section 4.3)
-- sessions table already defined above

-- Pending transactions (see section 5.3)
-- pending_transactions table already defined above

-- Transaction history
CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  chain TEXT NOT NULL,
  type TEXT NOT NULL,          -- 'transfer' | 'swap' | ...
  amount INTEGER NOT NULL,     -- Smallest unit
  destination TEXT,
  tx_hash TEXT,                -- Blockchain tx signature
  status TEXT NOT NULL,
  tier TEXT NOT NULL,           -- Escalation tier used
  fee INTEGER,
  created_at INTEGER NOT NULL,
  submitted_at INTEGER,
  confirmed_at INTEGER,
  error TEXT,
  FOREIGN KEY (agent_id) REFERENCES agents(id),
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE INDEX idx_tx_agent ON transactions(agent_id);
CREATE INDEX idx_tx_session ON transactions(session_id);
CREATE INDEX idx_tx_status ON transactions(status);

-- Policy rules (per agent)
CREATE TABLE policy_rules (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  rule_type TEXT NOT NULL,     -- 'amount_limit' | 'whitelist' | 'time_restrict' | 'rate_limit'
  config TEXT NOT NULL,        -- JSON
  enabled INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

-- Audit log (append-only)
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL,         -- 'agent:<id>' | 'owner' | 'system'
  details TEXT NOT NULL,       -- JSON
  severity TEXT NOT NULL       -- 'info' | 'warning' | 'critical'
);

CREATE INDEX idx_audit_type ON audit_log(event_type);
CREATE INDEX idx_audit_time ON audit_log(timestamp);

-- Notification channels
CREATE TABLE notification_channels (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,           -- 'telegram' | 'discord' | 'webhook'
  config TEXT NOT NULL,         -- JSON (encrypted sensitive fields)
  enabled INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL
);
```

### 10.3 In-Memory LRU Cache

```typescript
// Replace Redis with simple in-memory LRU

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class LRUCache<T> {
  private cache: Map<string, CacheEntry<T>>;
  private maxSize: number;

  // Used for:
  // - Session validation results (avoid JWT decode on every request)
  // - Revocation blocklist
  // - Policy context (accumulated spend per session)
  // - Balance cache (reduce RPC calls)
  // - Rate limit counters
}
```

**Cache strategy:**
- Session tokens: Cache valid token JTIs for 60s (avoid repeated JWT verification)
- Revocation list: Cache all revoked JTIs (small set, always in memory)
- Policy spend tracking: Cache per-session total_spent (write-through to SQLite)
- Balance: Cache for 10s (avoid RPC spam)
- Rate limit: Sliding window counters in memory

### 10.4 ORM Choice: Drizzle ORM (Recommended)

**Why Drizzle over raw better-sqlite3:**
- TypeScript-first schema definition (no separate schema file)
- 1:1 SQL mapping (transparent, no magic)
- ~7.4KB bundle (negligible for daemon)
- Native better-sqlite3 driver support
- Migration toolkit included

**Why Drizzle over Prisma:**
- No engine binary (Prisma requires a Rust query engine process)
- Better SQLite support for embedded use cases
- Lighter weight for a daemon (Prisma is designed for servers)
- Schema-in-code aligns with the monorepo TypeScript approach

---

## 11. Notification Architecture

**Confidence: MEDIUM** (Telegram/Discord APIs well-documented, push notification options less certain)

### 11.1 Notification Channel Interface

```typescript
// packages/core/src/interfaces/INotificationChannel.ts

export interface INotificationChannel {
  readonly type: ChannelType;  // 'telegram' | 'discord' | 'webhook' | 'push'

  send(notification: Notification): Promise<boolean>;
  healthCheck(): Promise<boolean>;
}

interface Notification {
  severity: 'info' | 'warning' | 'critical';
  title: string;
  body: string;
  actionUrl?: string;   // e.g., localhost:3000/approve/<txId>
  metadata?: Record<string, string>;
}
```

### 11.2 Alert Priority Matrix

| Event | Severity | Channels | Immediate |
|-------|----------|----------|-----------|
| Session created | info | Telegram, Discord | No (batched) |
| Transaction executed (IMMEDIATE tier) | info | -- (silent) | No |
| Transaction executed (NOTIFY tier) | info | All configured | Yes |
| Transaction queued (TIME_LOCK) | warning | All configured | Yes |
| Transaction pending approval | critical | All configured | Yes |
| Session limit 90% reached | warning | All configured | Yes |
| Circuit breaker triggered | critical | All configured | Yes |
| Kill switch activated | critical | All configured | Yes |
| Agent suspended | critical | All configured | Yes |

---

## 12. Build Order Recommendation

**Based on component dependencies, the suggested build order is:**

### Phase A: Foundation (no external dependencies)
```
1. packages/core   -- Domain models, interfaces, Zod schemas
2. SQLite schema   -- Database initialization, migrations
3. LRU Cache       -- In-memory cache implementation
```
**Rationale:** Everything depends on core types. Database must exist before services can store data.

### Phase B: Security Layer (depends on Phase A)
```
4. LocalKeyStore   -- AES-256-GCM + Argon2id keystore (sodium-native)
5. PolicyEngine    -- Local rule evaluation engine
6. SessionManager  -- JWT issuance + validation
```
**Rationale:** KeyStore is the security foundation. PolicyEngine and SessionManager both depend on core types but are independent of each other. They can be built in parallel.

### Phase C: Chain Adapters (depends on Phase A)
```
7. SolanaAdapter   -- @solana/web3.js or @solana/kit integration
8. EVMAdapter      -- ethers.js v6 integration (stub, basic transfer)
9. AdapterRegistry -- Chain resolution service
```
**Rationale:** Adapters depend only on IBlockchainAdapter interface from core. Can be built in parallel with Phase B.

### Phase D: Transaction Pipeline (depends on Phase B + C)
```
10. TransactionService  -- Coordinates adapter + keystore + policy
11. TimeLockQueue       -- Pending transaction management
12. Background Workers  -- Queue processor, session cleaner
```
**Rationale:** TransactionService is the integration point that requires all previous components.

### Phase E: HTTP Layer (depends on Phase D)
```
13. HTTP Server        -- Hono app + routes
14. Auth Middleware     -- Session token + owner signature verification
15. Owner Approval UI  -- Static HTML + wallet adapter JS
```
**Rationale:** Routes call TransactionService. Auth middleware uses SessionManager.

### Phase F: CLI + Packaging (depends on Phase E)
```
16. CLI Interface      -- waiaas init/start/stop/status
17. DaemonLifecycle    -- Startup/shutdown orchestration
18. Docker packaging   -- Dockerfile + docker-compose
```
**Rationale:** CLI wraps the daemon. Lifecycle manages the shutdown sequence.

### Phase G: Notifications + Polish (depends on Phase D)
```
19. NotificationDispatcher  -- Multi-channel alerts
20. Telegram/Discord channels
21. SDK (TypeScript)
22. MCP Server
```
**Rationale:** Notifications are non-blocking and can be added after the core pipeline works.

### Dependency Graph Summary

```
Phase A (Foundation)
    |
    +---> Phase B (Security)  ----+
    |                              |
    +---> Phase C (Adapters) -----+---> Phase D (Pipeline)
                                           |
                                           +---> Phase E (HTTP)
                                           |         |
                                           |         +---> Phase F (CLI/Docker)
                                           |
                                           +---> Phase G (Notifications)
```

**Phases B and C can be built in parallel.** Phase D is the critical integration point. Phase E is the first user-visible deliverable. Phases F and G can proceed in parallel after E.

---

## 13. Anti-Patterns to Avoid

### 13.1 Do NOT Store Owner Private Key

The daemon MUST NOT generate, store, or handle the Owner's private key in any form. The Owner authenticates exclusively through external wallet signatures (SIWS/SIWE). If the daemon stores the Owner's key, a daemon compromise means total fund loss.

### 13.2 Do NOT Use Async SQLite

Use better-sqlite3 (synchronous) not node-sqlite3 (async). The async driver causes mutex thrashing and is actually slower for the single-writer pattern. better-sqlite3's synchronous API is faster and simpler in a daemon context.

### 13.3 Do NOT Skip Transaction Simulation

Always simulate before signing. The simulation catches issues (insufficient balance, invalid instruction, etc.) that would waste a signature and potentially gas/fees. This is a carry-over from v0.1's design principle.

### 13.4 Do NOT Expose to 0.0.0.0

Always bind to `127.0.0.1`. If remote access is needed, use a reverse proxy (nginx, caddy) with TLS termination and authentication. The daemon itself should never be directly internet-exposed.

### 13.5 Do NOT Share HMAC Secret Across Restarts Without Consideration

If the daemon's JWT HMAC secret is regenerated on every restart, all existing session tokens become invalid. This is a security feature (forced re-authentication), but may be inconvenient. Make this configurable: persistent secret (in keystore) vs ephemeral secret (on restart).

### 13.6 Do NOT Block the Event Loop with Argon2id

Argon2id with MODERATE parameters takes approximately 300ms. Use `sodium.crypto_pwhash_async()` (if available via sodium-native) or run in a worker thread to avoid blocking HTTP request handling during keystore unlock.

---

## 14. Security Architecture Summary

### 14.1 Threat Model Comparison: v0.1 vs v0.2

| Threat | v0.1 Mitigation | v0.2 Mitigation |
|--------|-----------------|-----------------|
| Key theft | TEE (Nitro Enclave), KMS HSM | AES-256-GCM encrypted file, guarded memory, session limits |
| Server compromise | Enclave isolation, on-chain policy | Session TTL, policy engine, time-lock queue |
| API key leak | Key rotation, IP whitelist | Short-lived session tokens (24h), wallet signature auth |
| Brute force | Rate limiting, Fail2Ban | Rate limiting, Argon2id (300ms per attempt) |
| Insider threat | IAM roles, CloudTrail audit | Single-user daemon, audit log, owner-only operations |
| DNS rebinding | N/A (server environment) | Host header validation, localhost binding |

### 14.2 v0.2 Security Layers

```
Layer 1: Session-Based Auth
    - Short-lived tokens (24h default)
    - Per-session spend limits
    - Owner wallet signature for issuance
    - Instant revocation capability

Layer 2: Local Policy Engine
    - Amount limits (per-tx, per-session, per-day)
    - Address whitelist
    - Time-of-day restrictions
    - Operation type restrictions
    - Circuit breaker (5 consecutive failures)

Layer 3: Time-Lock + Approval
    - 4-tier escalation (immediate/notify/time-lock/approval)
    - 10-minute cancellation window for medium transactions
    - Owner signature required for large transactions
    - Auto-expiry for unapproved transactions

Layer 4: Monitoring + Kill Switch
    - Real-time notifications (Telegram, Discord)
    - Manual kill switch (owner-triggered)
    - Automatic suspension (circuit breaker, anomaly rules)
    - All-sessions revocation on kill switch
```

### 14.3 What v0.2 Loses vs v0.1

| Lost Guarantee | Impact | Mitigation |
|---------------|--------|------------|
| TEE isolation (Nitro Enclave) | Key material exposed in process memory | Guarded memory (sodium_malloc), session time limits |
| HSM-backed keys (AWS KMS) | No FIPS 140-2 hardware protection | AES-256-GCM + Argon2id software encryption |
| On-chain policy enforcement (Squads) | No immutable on-chain rules | Local policy engine (equivalent rules, not immutable) |
| Multi-region redundancy | Single point of failure | User responsibility (backups, Docker restart) |
| CloudTrail audit | No tamper-proof external log | Local audit log (SQLite append-only table) |

**This is an acceptable tradeoff for self-hosted because:** the user has physical control of the machine, the daemon manages modest amounts per agent session, and the primary threat model shifts from "cloud infrastructure attack" to "agent code compromise" -- which sessions and time-locks address effectively.

---

## Sources

### Official Documentation (HIGH confidence)
- [Ethereum Web3 Secret Storage Definition](https://ethereum.org/developers/docs/data-structures-and-encoding/web3-secret-storage) -- Keystore V3 format specification
- [EIP-4361: Sign-In with Ethereum](https://eips.ethereum.org/EIPS/eip-4361) -- SIWE standard
- [Phantom Sign In With Solana](https://phantom.com/learn/developers/sign-in-with-solana) -- SIWS specification
- [Sign In With Solana (SIWS) Docs](https://siws.web3auth.io) -- Implementation guide
- [better-sqlite3 GitHub](https://github.com/WiseLibs/better-sqlite3) -- SQLite driver documentation
- [Hono Framework Docs](https://hono.dev/docs/) -- HTTP framework
- [sodium-native GitHub](https://github.com/LiskHQ/sodium-native) -- Low-level libsodium bindings
- [Drizzle ORM SQLite](https://orm.drizzle.team/docs/get-started-sqlite) -- ORM documentation

### Cryptographic Best Practices (HIGH confidence)
- [Cryptographic Best Practices (atoponce)](https://gist.github.com/atoponce/07d8d4c833873be2f68c34f9afc5a78a) -- Cipher/KDF recommendations
- [Key Management Best Practices (Ubiq)](https://dev.ubiqsecurity.com/docs/key-mgmt-best-practices) -- Key wrapping patterns

### Community & Ecosystem (MEDIUM confidence)
- [SIWE TypeScript Library](https://github.com/spruceid/siwe) -- Reference implementation
- [Drizzle vs Prisma 2026 Deep Dive](https://medium.com/@codabu/drizzle-vs-prisma-choosing-the-right-typescript-orm-in-2026-deep-dive-63abb6aa882b) -- ORM comparison
- [SQLite is All You Need: One-Person Stack 2026](https://dev.to/zilton7/sqlite-is-all-you-need-the-one-person-stack-for-2026-23kg) -- SQLite in production trend
- [PM2 Guide (Better Stack)](https://betterstack.com/community/guides/scaling-nodejs/pm2-guide/) -- Process management
- [Hono Graceful Shutdown Discussion](https://github.com/orgs/honojs/discussions/3731) -- Production shutdown patterns

### Project Internal (HIGH confidence)
- v0.1 ARCH-01 (08-dual-key-architecture.md) -- Dual Key design, selfhost key derivation code
- v0.1 ARCH-02 (09-system-components.md) -- Monorepo structure, IKeyManagementService
- v0.1 ARCH-03 (10-transaction-flow.md) -- Transaction pipeline, escalation tiers
- v0.1 ARCH-05 (12-multichain-extension.md) -- IBlockchainAdapter interface
- v0.1 REL-03 (15-agent-lifecycle-management.md) -- Agent state machine
- v0.1 REL-04 (16-emergency-recovery.md) -- Emergency triggers
- v0.1 API-02 (18-authentication-model.md) -- Auth model
- v0.1 API-03 (19-permission-policy-model.md) -- RBAC + ABAC
