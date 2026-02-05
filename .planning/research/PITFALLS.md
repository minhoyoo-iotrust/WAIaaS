# Self-Hosted Agent Wallet Daemon: Domain Pitfalls

**Project:** WAIaaS v0.2 - Self-Hosted Secure Wallet for AI Agents
**Domain:** Self-hosted wallet daemon with local key management and session-based auth
**Researched:** 2026-02-05
**Overall Confidence:** MEDIUM-HIGH (multiple authoritative sources cross-referenced)

---

## Overview

This document catalogs pitfalls specific to building a self-hosted wallet daemon that stores private keys locally, uses session-based authentication, implements time-lock transactions, and communicates with browser wallet extensions. The v0.1 PITFALLS.md covered cloud-centric WaaS concerns (AWS KMS, Nitro Enclaves, Squads Protocol). This document replaces it with pitfalls for the v0.2 self-hosted local daemon architecture.

Each pitfall includes: severity rating, what goes wrong, why it happens, warning signs, a concrete prevention strategy, and which v0.2 phase should address it.

---

## Critical Pitfalls

Mistakes that cause key compromise, fund loss, or require full rewrites.

---

### C-01: AES-256-GCM Nonce Reuse Destroys Both Confidentiality and Authentication

**Severity:** CRITICAL
**Confidence:** HIGH (RFC 5116, NIST research, cryptographic proofs)

**What goes wrong:**
The daemon encrypts the agent private key with AES-256-GCM using a reused or predictable nonce (IV). An attacker who obtains two ciphertexts encrypted under the same key and nonce can XOR them to recover plaintext differences, and more critically, can recover the GHASH authentication key. With the authentication key, the attacker can forge valid ciphertexts and recover the private key.

**Why it happens:**
- Developer uses a static IV stored alongside the encrypted file (common in Android KeyStore implementations)
- Counter-based nonce wraps around after 2^32 encryptions without key rotation
- Random 96-bit nonce collides due to birthday bound (~2^48 encryptions under same key)
- Re-encryption of the same key file after settings change reuses the previous nonce

**Warning signs:**
- IV/nonce stored as a constant in code or config
- No nonce generation on each encryption call
- No key rotation mechanism after N encryptions
- Encrypted key file never changes size despite re-encryption

**Prevention:**
1. Generate a fresh 96-bit random nonce for EVERY encryption operation using `crypto.randomBytes(12)`
2. Prepend the nonce to the ciphertext file: `[12-byte nonce][ciphertext][16-byte auth tag]`
3. Implement key rotation: re-derive the encryption key (from master password via Argon2id with new salt) after every N re-encryptions or on every password change
4. Consider AES-256-GCM-SIV (RFC 8452) for nonce misuse resistance as a defense-in-depth measure
5. Use libsodium's `crypto_aead_xchacha20poly1305_ietf` which uses a 192-bit nonce (birthday bound at ~2^96), dramatically reducing collision risk

**Phase:** Core key management (Phase 1 - encrypted keystore implementation)

---

### C-02: Argon2id Parameter Misconfiguration Weakens Key Derivation

**Severity:** CRITICAL
**Confidence:** HIGH (OWASP Password Storage Cheat Sheet, RFC 9106, 2025 arXiv study)

**What goes wrong:**
The master password that protects the encrypted private key file is derived using Argon2id with weak parameters, making brute-force attacks feasible. An attacker who steals the encrypted key file can crack the password offline.

**Why it happens:**
- Using default parameters from example code (e.g., `m=4096, t=1, p=1` -- only 4 MiB memory)
- Copying parameters from password hashing guides, which target server environments with many concurrent users (low memory per hash), not a single-user desktop daemon
- Not benchmarking on target hardware -- parameters that take 100ms on a dev machine may take 10ms on an attacker's GPU cluster
- Storing only the raw derived key, losing salt and parameters needed for re-derivation

**Warning signs:**
- Key derivation completes in under 500ms on target hardware
- Memory parameter below 46 MiB (OWASP minimum for general use)
- Salt is hardcoded or derived from username instead of being cryptographically random
- Parameters are not stored alongside the encrypted file

**Prevention:**
1. For a single-user local daemon, target **1-3 seconds** derivation time (much higher than server defaults)
2. Recommended minimum: `m=256 MiB, t=3, p=4` -- benchmark on target hardware and adjust upward
3. Generate a 16-byte cryptographically random salt per derivation: `crypto.randomBytes(16)`
4. Store the complete PHC-encoded string: `$argon2id$v=19$m=262144,t=3,p=4$[salt]$[hash]`
5. On every password change, re-derive with fresh salt and optionally increased parameters
6. Use constant-time comparison (`crypto.timingSafeEqual`) when verifying derived keys

**Phase:** Core key management (Phase 1 - encrypted keystore implementation)

---

### C-03: Private Key Lingers in Node.js Process Memory, Exposed via Swap and Core Dumps

**Severity:** CRITICAL
**Confidence:** HIGH (Node.js Issue #18896, #30956, libsodium documentation)

**What goes wrong:**
After decrypting the private key for signing, the key remains in Node.js heap memory as a standard `Buffer`. This memory can be:
- Paged to disk swap file (recoverable after process exit)
- Included in core dumps (if the process crashes)
- Copied during garbage collection (old location not zeroed)
- Visible via `/proc/[pid]/mem` to processes with same UID on Linux

**Why it happens:**
- Node.js does not implement secure memory (`mlock`, `MADV_DONTDUMP`). Issue #30956 remains open with no resolution
- JavaScript's garbage collector moves objects in memory, leaving copies at old addresses
- `Buffer.fill(0)` zeros the current location but cannot track copies the GC already made
- Developers assume "process memory is safe" without considering the OS virtual memory system

**Warning signs:**
- Private key stored in a regular `Buffer` or JavaScript variable
- No explicit zeroing after use
- Process uses standard `node` binary without memory protections
- Swap is enabled on the host machine
- Application does not catch crashes to prevent core dump

**Prevention:**
1. Use `sodium-native` package for secure memory allocation:
   ```
   const secureBuffer = sodium.sodium_malloc(32)
   // ... use for signing ...
   sodium.sodium_memzero(secureBuffer) // guaranteed zero
   ```
   `sodium_malloc` calls `mlock()` (prevents swap), `madvise(MADV_DONTDUMP)` (prevents core dump), and places guard pages around the allocation
2. Minimize key residence time: decrypt -> sign -> zero, all in the same synchronous call path
3. Disable swap on daemon host machines (document in setup guide): `swapoff -a`
4. Set `ulimit -c 0` to prevent core dumps, or configure the daemon to set `prctl(PR_SET_DUMPABLE, 0)` via native addon
5. Never store the raw private key in a JavaScript variable; always keep it in the `sodium_malloc` buffer
6. Document that `sodium-native` is a hard dependency for security, not a convenience choice

**Phase:** Core key management (Phase 1 - signing service implementation)

---

### C-04: Localhost Daemon Exploitable via 0.0.0.0 Day and DNS Rebinding Attacks

**Severity:** CRITICAL
**Confidence:** HIGH (Oligo Security research, GitHub Security blog, CVE-2025-8036)

**What goes wrong:**
The daemon listens on `localhost:3000` and assumes it is only reachable by local processes. A malicious webpage visited in the user's browser exploits the "0.0.0.0 Day" vulnerability or DNS rebinding to send HTTP requests to the daemon, bypassing browser same-origin policy. The attacker can invoke daemon APIs (list transactions, send funds) if no authentication is required for local access.

**How 0.0.0.0 Day works:**
- Browser PNA (Private Network Access) blocks requests to `127.0.0.1` from public websites
- But `0.0.0.0` was NOT on the restricted list (patched in Chrome 128-133, Safari 18, Firefox still unpatched)
- With `mode: "no-cors"`, a public website can POST to `http://0.0.0.0:3000/v1/transactions/send`
- The daemon processes it as a legitimate localhost request

**How DNS rebinding works:**
- Attacker controls `evil.com` which initially resolves to their server
- After the page loads, DNS is re-resolved to `127.0.0.1`
- Browser now considers `evil.com` as same-origin with the local daemon
- Full CORS access to daemon APIs

**Warning signs:**
- Daemon accepts requests without session token validation on any endpoint
- No `Host` header validation
- CORS configured with `Access-Control-Allow-Origin: *`
- Daemon binds to `0.0.0.0` instead of `127.0.0.1`

**Prevention:**
1. **Bind exclusively to 127.0.0.1**, never `0.0.0.0`:
   ```typescript
   server.listen({ port: 3000, host: '127.0.0.1' })
   ```
2. **Require session token on ALL endpoints** including balance queries -- no unauthenticated endpoints
3. **Validate Host header** on every request: reject if not `localhost` or `127.0.0.1`
4. **Validate Origin header** if present: reject unknown origins
5. **CORS policy**: do not set `Access-Control-Allow-Origin: *`. Only allow specific known origins (e.g., the Tauri app's custom scheme or `null` for local file origins)
6. **Implement CSRF tokens** for any state-changing operations accessed from a browser context
7. **Add PNA headers** to preflight responses for defense against future browser implementations:
   ```
   Access-Control-Allow-Private-Network: true
   ```

**Known affected services:** Ray AI clusters (ShadowRay campaign), Selenium Grid, PyTorch TorchServe, and any unauthenticated localhost service.

**Phase:** API server setup (Phase 1 - HTTP server configuration). This MUST be implemented from day one, not added later.

---

### C-05: Session Token with Insufficient Entropy Enables Prediction Attacks

**Severity:** CRITICAL
**Confidence:** HIGH (OWASP Session Management Cheat Sheet, CWE-331, Rapid7 severity upgrade to Critical in 2025)

**What goes wrong:**
Session tokens are generated with insufficient entropy (e.g., timestamp-based, sequential, or using `Math.random()`), allowing attackers to predict valid tokens. Since session tokens in WAIaaS grant transaction signing authority, a predicted token means unauthorized fund transfers.

**Why it happens:**
- Using non-cryptographic RNG (`Math.random()`, `Date.now()`)
- MD5/SHA hashing of predictable inputs (timestamp, incrementing counter) -- the hash output is 128/256 bits but entropy is as low as the input
- Session ID generated from user-visible data (agent name, IP address)
- Copying example code from non-security-focused tutorials

**Warning signs:**
- Token generation does not call `crypto.randomBytes()` or equivalent CSPRNG
- Token format contains recognizable patterns (timestamps, sequential numbers)
- Tokens shorter than 32 bytes (256 bits)
- Token generation is deterministic given known inputs

**Prevention:**
1. Generate session tokens with minimum 256 bits of cryptographic randomness:
   ```typescript
   import { randomBytes } from 'crypto'
   const sessionToken = `wai_sess_${randomBytes(32).toString('base64url')}`
   ```
2. Store server-side as SHA-256 hash (same pattern as API keys in the v0.1 auth model)
3. Include token metadata (expiry, limits) in server-side storage, not encoded in the token itself (avoid JWT for session tokens -- they cannot be revoked without a blocklist)
4. Implement token binding: associate token with creating wallet signature, IP range, or TLS channel
5. Rate-limit authentication attempts: max 5 failed attempts per minute per source

**Phase:** Session auth system (Phase 1 - session token design)

---

## High Pitfalls

Mistakes that cause security degradation, data loss, or significant rework.

---

### H-01: Time-Lock Bypass via TOCTOU Race Condition in Pending Queue

**Severity:** HIGH
**Confidence:** MEDIUM (Bitcoin Core race conditions, Compound Timelock patterns, general TOCTOU literature)

**What goes wrong:**
The time-lock mechanism checks transaction amount -> determines delay tier -> places in pending queue. Between the check and the actual blockchain submission, conditions change. Specific attacks:

1. **Rapid-fire small transactions**: Agent submits 100 transactions of 0.09 SOL each (below the "instant" threshold of 0.1 SOL), draining 9 SOL without triggering any delay
2. **Session limit exhaustion during pending**: Transaction A (4 SOL) enters 10-min pending queue, leaving 6 SOL session budget. Agent immediately submits Transaction B (6 SOL). When A completes, session budget should have been 2 SOL but both executed
3. **Cancel-and-resubmit**: Transaction enters pending queue, owner is notified, owner doesn't respond, transaction auto-cancels, agent immediately resubmits -- creating notification fatigue

**Why it happens:**
- Balance/limit checks happen at submission time, not at execution time
- Pending queue doesn't lock the funds being spent (no "reservation" of session budget)
- No aggregate rate limiting across the instant-execution tier
- No deduplication or cooldown after auto-cancel

**Warning signs:**
- Session budget is checked only at transaction creation, not at signing time
- No "reserved" or "locked" amount tracking for pending transactions
- Instant-tier transactions have no aggregate limit
- No per-minute or per-hour rate limit for instant transactions

**Prevention:**
1. **Reserve session budget at submission time**: When a transaction enters the pending queue, deduct its amount from the available session budget immediately. If the transaction is canceled, refund the reservation
2. **Re-validate at execution time**: When a pending transaction's delay expires, re-check ALL constraints (balance, session limit, per-tx limit) before signing
3. **Aggregate rate limit on instant tier**: Max 5 instant transactions per 10-minute window, and max 0.5 SOL aggregate per 10-minute window for instant tier
4. **Cooldown after cancel**: 5-minute cooldown before re-submitting a transaction that was canceled (by owner or timeout)
5. **Atomic check-and-execute**: Use database transactions with serializable isolation to make limit checks and budget deductions atomic:
   ```sql
   BEGIN;
   SELECT remaining_budget FROM sessions WHERE id = ? FOR UPDATE;
   -- check if sufficient
   UPDATE sessions SET remaining_budget = remaining_budget - ? WHERE id = ?;
   INSERT INTO pending_transactions ...;
   COMMIT;
   ```

**Phase:** Time-lock system (Phase 2 - pending transaction queue)

---

### H-02: SQLite Corruption Under Concurrent Daemon Operations

**Severity:** HIGH
**Confidence:** HIGH (SQLite official docs, better-sqlite3 documentation)

**What goes wrong:**
The daemon uses SQLite for transaction history, session state, and policy configuration. Multiple concurrent operations (agent API calls, pending transaction processing, notification delivery, owner approvals) write to the database simultaneously, causing `SQLITE_BUSY` errors, data loss, or database corruption.

**Why it happens:**
- SQLite in default journal mode allows only one writer at a time; readers block during writes
- WAL mode helps but still limits to a single writer -- concurrent write attempts get `SQLITE_BUSY`
- `better-sqlite3` is synchronous; long-running queries block the entire Node.js event loop
- Database file on network filesystem (NFS, SMB) breaks POSIX file locking, causing silent corruption
- Separating WAL file from database file (e.g., during backup) loses committed transactions

**Warning signs:**
- `SQLITE_BUSY` errors in logs
- `database is locked` error messages
- WAL file growing unboundedly (checkpoint starvation)
- Database file on a Docker volume backed by NFS
- Backup scripts that copy only the `.db` file without `.db-wal` and `.db-shm`

**Prevention:**
1. **Enable WAL mode immediately on database open**:
   ```typescript
   db.pragma('journal_mode = WAL')
   db.pragma('busy_timeout = 5000')  // 5s wait on lock contention
   db.pragma('synchronous = NORMAL') // safe with WAL, much faster
   ```
2. **Single database connection per process**: Use one `better-sqlite3` instance shared across the daemon. It is synchronous and thread-safe within a single Node.js process
3. **Wrap related writes in transactions**: All budget-check-and-deduct operations must be in a single transaction
4. **Periodic WAL checkpoints**: Run `db.pragma('wal_checkpoint(TRUNCATE)')` periodically (every 5 minutes or every 1000 writes) to prevent WAL file growth
5. **Never run on network filesystems**: Document that `~/.waiaas/data/` MUST be on a local filesystem
6. **Atomic backup**: Use SQLite's `.backup()` API or `VACUUM INTO` to create consistent backups, never copy files directly:
   ```typescript
   db.backup(`${backupDir}/waiaas-${Date.now()}.db`)
   ```
7. **If multi-process is needed later** (e.g., separate notification worker), use a single process as database gatekeeper or switch to PostgreSQL

**Phase:** Database setup (Phase 1 - storage layer initialization)

---

### H-03: Owner Wallet Signature Replay Allows Unauthorized Session Creation

**Severity:** HIGH
**Confidence:** MEDIUM (general signature replay patterns, wallet adapter security model)

**What goes wrong:**
The owner signs a message to approve a session. This signed message is replayed by an attacker (or a compromised agent) to create additional unauthorized sessions. The daemon accepts the replay because it only verifies the signature is valid, not that it is fresh.

**Why it happens:**
- Sign message contains no nonce or timestamp: `"Approve session for agent-1"`
- Daemon does not track which signed messages have already been used
- No expiration on the signed approval message itself
- Message format doesn't bind to a specific session creation request

**Warning signs:**
- Same signed message can be submitted to `/v1/sessions` multiple times, each creating a new session
- Signed message payload does not include timestamp, nonce, or request ID
- No used-nonce storage or deduplication
- Session creation logs show multiple sessions with identical signatures

**Prevention:**
1. **Include a nonce in every sign request**: Generate a random nonce server-side, include it in the message the owner signs:
   ```
   WAIaaS Session Approval
   Agent: agent-xyz
   Nonce: a1b2c3d4e5f6
   Timestamp: 2026-02-05T12:00:00Z
   Limits: 10 SOL / 24hr
   ```
2. **Store used nonces**: Track consumed nonces in the database. Reject any signature with a previously-seen nonce
3. **Expiration on the approval itself**: The nonce-bearing message is valid for only 5 minutes. After that, the owner must sign a new message
4. **Bind to session parameters**: The signed message must include the exact session constraints (expiry, limits, allowed operations). Changing any parameter requires a new signature

**Phase:** Session auth system (Phase 2 - owner approval flow)

---

### H-04: Clipboard Hijacking and Address Substitution During Wallet Operations

**Severity:** HIGH
**Confidence:** HIGH (Trust Wallet advisory, Halborn research, multiple real-world incidents)

**What goes wrong:**
When the owner copies a recipient address to paste into the daemon UI (desktop app or CLI), clipboard hijacking malware (clipper malware) replaces the address with an attacker-controlled address. Funds are sent to the wrong destination. Solana addresses are Base58 strings that are difficult for humans to fully verify visually.

**Known malware families:** CryptoShuffler, Laplas Clipper (supports Solana, Ethereum, Bitcoin + 15 other chains), Android/Clipper.C (was in Google Play Store impersonating MetaMask).

**Why it happens:**
- Any application on the system can read and write the clipboard (OS design, not a bug)
- Users copy-paste wallet addresses because they are too long to type
- Laplas generates lookalike addresses (matching first/last characters) making visual comparison unreliable
- Desktop app (Electron/Tauri) does not validate or warn about address changes

**Warning signs:**
- User reports that the pasted address differs from what they copied
- Transaction sent to an address not in the user's address book
- Antivirus detects clipboard monitoring process

**Prevention:**
1. **Address book with verification**: Require all recipient addresses to be pre-registered in an address book. Flag any address not in the address book with a prominent warning
2. **Address confirmation UI**: Show the full address character-by-character in a monospace font with visual grouping (4-char blocks). Highlight characters that differ from the last-used address for this recipient
3. **Clipboard clearing**: After pasting an address, immediately clear the clipboard:
   ```typescript
   navigator.clipboard.writeText('')
   ```
4. **Direct QR/WalletConnect input**: Prefer QR code scanning or WalletConnect deep links over clipboard-based address input
5. **Whitelist enforcement**: In policy engine, restrict transactions to pre-approved addresses only. Any address outside the whitelist requires owner approval (time-lock tier)

**Phase:** Desktop app and owner interface (Phase 3 - transaction UX)

---

### H-05: Encrypted Key File Metadata Leaks Information

**Severity:** HIGH
**Confidence:** MEDIUM (oByte wallet cleartext key in logs, general encrypted storage patterns)

**What goes wrong:**
While the private key itself is encrypted, surrounding metadata leaks sensitive information:
- The encrypted key filename reveals it contains a private key (`~/.waiaas/data/agent-key.enc`)
- File timestamps reveal when the daemon last started (decryption time = file access time)
- SQLite database stores wallet addresses in plaintext, correlating the daemon to specific on-chain wallets
- Log files contain partial key material, derivation parameters, or debug output from signing operations
- Environment variables contain session tokens in shell history

**Why it happens:**
- Focus on encrypting the key itself while ignoring everything around it
- Debug logging enabled in production that logs function arguments
- File naming conventions that make sensitive files obvious targets
- Not considering that `~/.waiaas/` directory listing reveals system architecture

**Warning signs:**
- `ls ~/.waiaas/` reveals files named `private-key.*`, `seed.*`, or `keystore.*`
- Log files contain hexadecimal strings that look like keys or tokens
- `env` or `printenv` shows session tokens
- SQLite database is readable with any SQLite browser, revealing all wallet addresses and transaction history

**Prevention:**
1. **Opaque filenames**: Name encrypted files generically: `store.dat`, not `private-key.enc`
2. **No key material in logs**: Set log level to `warn` in production. Implement a log sanitizer that redacts any string matching key/token patterns. Never log function arguments for crypto operations
3. **Encrypt the entire data directory**: Consider encrypting the SQLite database file itself (via SQLCipher or application-level encryption for sensitive columns)
4. **Secure log storage**: Rotate logs, set restrictive permissions (`0600`), and exclude from backup tools that sync to cloud
5. **Environment variable hygiene**: Never pass session tokens via environment variables in shell. Use a file-based token store with `0600` permissions

**Phase:** Key management and storage (Phase 1 - file layout design)

---

## Moderate Pitfalls

Mistakes that cause delays, degraded UX, or technical debt.

---

### M-01: Notification System Silent Failures Create False Sense of Security

**Severity:** MEDIUM
**Confidence:** MEDIUM (Discord/Telegram API documentation, webhook reliability data)

**What goes wrong:**
The kill switch depends on the owner receiving timely notifications. Notifications fail silently due to rate limiting (Discord: 30 req/min, Telegram: 30 msg/sec), expired webhooks, network issues, or message size limits. The owner believes they will be alerted but receives nothing during a critical event.

**Specific failure modes:**
- Discord webhook returns 429 (rate limited) during burst of suspicious transactions -- alerts are dropped
- Telegram bot silently stops receiving webhook callbacks (reported late 2025, no error surfaced)
- Push notification service (ntfy.sh) is down -- no fallback
- Message body too long for Telegram (4096 char limit) -- HTTP 400, notification lost

**Warning signs:**
- No health checks on notification channels
- No delivery confirmation tracking
- Only one notification channel configured
- No retry logic for failed deliveries
- Rate limit headers from Discord/Telegram not checked

**Prevention:**
1. **Require minimum 2 notification channels**: Daemon refuses to start in production with fewer than 2 configured channels
2. **Delivery confirmation tracking**: Log every notification attempt with success/failure status. Alert the owner (via a different channel) if a channel has failed 3 times consecutively
3. **Exponential backoff with retry**: Respect `Retry-After` headers. Queue failed notifications for retry (up to 3 attempts with backoff)
4. **Message batching**: Aggregate rapid-fire alerts into a single notification per 30-second window to avoid rate limits
5. **Health checks**: Ping each notification channel on daemon startup and every 30 minutes. Surface channel health in daemon status/dashboard
6. **Fallback escalation**: If primary channel fails, immediately attempt all secondary channels. If ALL channels fail, the daemon should enter a defensive mode (reduce session limits by 50%, require explicit owner presence for any transaction)

**Phase:** Notification system (Phase 2 - multi-channel alerts)

---

### M-02: Chain-Agnostic Abstraction Leaks Chain-Specific Semantics

**Severity:** MEDIUM
**Confidence:** MEDIUM (multi-chain development patterns, chain abstraction literature)

**What goes wrong:**
The `ChainAdapter` interface (`createWallet`, `getBalance`, `signTransaction`, `broadcastTransaction`) hides critical chain-specific differences that affect security and correctness:

- **Finality**: Solana "confirmed" (2-3 seconds) vs Ethereum "finalized" (12+ minutes). Checking balance after Solana "confirmed" may show funds that later roll back
- **Fee model**: Solana compute units vs EVM gas. Estimation is fundamentally different. Under-estimating causes tx failure; over-estimating wastes funds
- **Address format**: Solana Base58 (32 bytes) vs Ethereum hex (20 bytes). Address validation logic is chain-specific
- **Token model**: Solana SPL token accounts (separate per mint) vs ERC-20 (single contract). "Get balance" means different API calls
- **Nonce handling**: EVM requires sequential nonces for transaction ordering. Solana uses recent blockhash (no nonce). This affects retry and cancellation logic
- **Transaction simulation**: Both chains support simulation but with different APIs and failure modes

**Warning signs:**
- `ChainAdapter` interface has no method for checking finality
- Balance check does not specify confirmation level
- Error handling is generic (`TransactionFailed`) without chain-specific error codes
- No way to cancel or speed up a pending transaction (EVM-specific)
- Token transfers use the same code path for native tokens and SPL/ERC-20

**Prevention:**
1. **Finality-aware interface**: Add confirmation level to all reads:
   ```typescript
   interface ChainAdapter {
     getBalance(address: string, confirmationLevel: 'pending' | 'confirmed' | 'finalized'): Promise<Balance>
   }
   ```
2. **Chain-specific error types**: Map chain errors to domain errors that preserve the original:
   ```typescript
   class InsufficientFeeError extends TransactionError {
     constructor(public chain: string, public requiredFee: bigint, public nativeError: unknown) {}
   }
   ```
3. **Separate token adapter**: Do not force native transfers and token transfers into the same method. SPL token transfers require ATA (Associated Token Account) creation, which has no EVM equivalent
4. **Simulation before signing**: Make transaction simulation a required step in the adapter, not optional
5. **Start with Solana only**: Implement the Solana adapter completely, including edge cases. Only then design the abstract interface by extracting commonalities. Do NOT design the interface first and force both chains to fit

**Phase:** Chain adapter (Phase 2 - Solana adapter implementation, before EVM adapter)

---

### M-03: Browser-to-Daemon Communication Lacks Mutual Authentication

**Severity:** MEDIUM
**Confidence:** MEDIUM (wallet adapter patterns, localhost security research)

**What goes wrong:**
The owner connects their browser wallet (Phantom, MetaMask) to the local daemon for session approval and transaction signing. This communication path has several weaknesses:

1. **No HTTPS on localhost**: Browser sends wallet signatures over unencrypted HTTP. While localhost traffic doesn't traverse the network, other local processes can sniff it via loopback interface capture
2. **Extension impersonation**: A malicious browser extension can intercept wallet adapter calls, modify the message before signing, or capture the signed result
3. **Origin confusion**: The daemon's local web UI runs on `http://localhost:3000`. Another local app or malicious page could also open `localhost:3000` and interact with the UI if session cookies are used

**Warning signs:**
- Daemon accepts wallet connection requests without verifying the connecting UI is the legitimate Tauri app
- No request signing or HMAC between browser UI and daemon API
- Session cookies used for owner authentication on localhost (vulnerable to CSRF from other local pages)
- Wallet adapter messages do not include the daemon's identity or session ID

**Prevention:**
1. **Tauri IPC instead of HTTP for desktop app**: Use Tauri's native `invoke` commands (Rust backend) instead of HTTP. This eliminates the entire browser-to-localhost attack surface for the desktop app path
2. **For the browser path**: Generate a per-session CSRF token on daemon startup. Include it in all browser-to-daemon requests
3. **Message binding**: Include the daemon's instance ID and request nonce in the message the owner signs:
   ```
   WAIaaS Approval
   Daemon: d-1a2b3c (instance ID displayed in tray icon)
   Action: Approve transaction 0.5 SOL to [address]
   Nonce: [server-generated]
   ```
4. **Consider mTLS for advanced setup**: For Docker/server deployments where the owner connects remotely, use mutual TLS with client certificates

**Phase:** Owner wallet connection (Phase 2 - wallet adapter integration)

---

### M-04: Kill Switch Fails When Daemon Process Is Compromised

**Severity:** MEDIUM
**Confidence:** LOW-MEDIUM (architectural reasoning, no specific incident found for local daemons)

**What goes wrong:**
The kill switch is implemented as a daemon API endpoint (`POST /v1/owner/kill-switch`). If the daemon process is compromised (code injection, dependency supply chain attack), the attacker can:
1. Disable the kill switch handler
2. Continue processing transactions while reporting "frozen" status
3. Suppress notification delivery
4. Modify policy checks to approve all transactions

The owner believes the system is frozen, but the attacker is actively draining funds.

**Why it happens:**
- Kill switch, policy engine, signing service, and notification system all run in the same process
- No out-of-band verification that the daemon is actually in a frozen state
- No hardware-backed integrity check on daemon state

**Warning signs:**
- All security layers run in a single Node.js process
- No external health monitor that can verify daemon state
- No way for the owner to verify the daemon's claimed state matches reality
- No blockchain-level spending controls (unlike v0.1's Squads on-chain limits)

**Prevention:**
1. **On-chain verification of pending transactions**: After the kill switch is activated, the owner should verify on-chain that no new transactions are being submitted from the agent wallet address. The daemon's dashboard should show live blockchain state, not just internal state
2. **External watchdog process**: Run a separate lightweight process that monitors the agent wallet address on-chain. If transactions appear after kill switch activation, this watchdog sends alerts via its own (separate) notification channels
3. **Key deletion as ultimate kill**: The kill switch should have a "nuclear" option that deletes the decrypted key from memory AND overwrites the encrypted key file. This makes recovery harder but guarantees the daemon cannot sign more transactions
4. **Document the trust boundary**: Clearly document that the kill switch protects against agent misbehavior, NOT daemon process compromise. For process compromise, the defense is: shutdown the daemon, revoke session tokens, move funds using the owner wallet directly

**Phase:** Kill switch and monitoring (Phase 3 - defense-in-depth measures)

---

### M-05: Daemon Auto-Start and Persistence Create Unmonitored Execution Windows

**Severity:** MEDIUM
**Confidence:** MEDIUM (desktop daemon patterns, operational security)

**What goes wrong:**
The daemon is configured to auto-start on boot (systemd service, launchd plist, Windows startup). It begins processing agent requests immediately, before the owner has verified system integrity or checked for security updates. During this unmonitored window:
- Stale session tokens may still be valid
- Pending transactions from before shutdown may auto-execute
- A compromised daemon (from prior attack) restarts with the same compromised code

**Warning signs:**
- Daemon starts silently without owner presence confirmation
- Sessions survive daemon restart
- Pending transactions resume without re-approval
- No startup integrity check

**Prevention:**
1. **Require owner presence on first start**: After boot, daemon enters "locked" mode. Owner must actively unlock (e.g., enter password or connect wallet) before any transactions are processed. Balance queries can remain available
2. **Session invalidation on restart**: All active sessions are invalidated when the daemon restarts. Agents must request new sessions
3. **Pending transaction purge**: All pending (unexecuted) transactions are canceled on daemon restart. They can be resubmitted by the agent after session re-creation
4. **Startup integrity check**: On start, verify checksums of daemon binary and configuration files. Alert if they differ from expected values

**Phase:** Daemon lifecycle (Phase 1 - startup and shutdown procedures)

---

## Minor Pitfalls

Annoyances and edge cases that are fixable but should be known.

---

### L-01: SQLite Busy Timeout Too Low Causes Spurious Transaction Failures

**Severity:** LOW
**Confidence:** HIGH (SQLite documentation, better-sqlite3 docs)

**What goes wrong:**
Default SQLite busy timeout is 0ms (immediate failure). When two operations contend for the write lock (e.g., agent transaction + owner approval happening simultaneously), one gets `SQLITE_BUSY` and the transaction fails. The agent sees an error and retries, creating unnecessary noise and potential rate limit triggers.

**Prevention:**
Set `busy_timeout` to at least 5000ms. Wrap retryable database operations in application-level retry with exponential backoff. This is a one-line fix but easy to forget.

**Phase:** Database setup (Phase 1)

---

### L-02: Tauri App Cannot Access Hardware Wallets via WebUSB

**Severity:** LOW
**Confidence:** MEDIUM (Tauri/WebView limitations, Ledger SDK docs)

**What goes wrong:**
Tauri uses the system WebView (not Chromium) which may lack WebUSB/WebHID support needed for direct Ledger/Trezor hardware wallet communication. The owner cannot use their hardware wallet for session approvals.

**Prevention:**
Use Tauri's Rust backend to communicate with hardware wallets via native USB libraries (e.g., `hidapi` crate) instead of WebUSB. Alternatively, use WalletConnect as the bridge between hardware wallets and the daemon. Document supported connection methods clearly.

**Phase:** Desktop app and hardware wallet support (Phase 3)

---

### L-03: Agent SDK Exposes Session Token in Process Environment

**Severity:** LOW
**Confidence:** MEDIUM (standard practice observation)

**What goes wrong:**
The TypeScript/Python SDK documentation shows `process.env.WAIAAS_SESSION` as the recommended way to pass session tokens. Environment variables are:
- Visible in `/proc/[pid]/environ` on Linux
- Logged by some deployment tools
- Inherited by child processes
- Visible in crash reports

**Prevention:**
Recommend file-based token storage (`~/.waiaas/session-token` with `0600` permissions) as the primary method. Support environment variables as a convenience option but document the security tradeoff. The MCP server integration should read from the file by default.

**Phase:** SDK and MCP integration (Phase 3)

---

## Phase-Specific Warning Summary

| Phase | Critical Pitfalls | High Pitfalls | Key Focus Area |
|-------|------------------|---------------|----------------|
| **Phase 1: Core Infrastructure** | C-01, C-02, C-03, C-04, C-05 | H-02, H-05 | Get encryption, key storage, localhost security, and session tokens RIGHT from day one. These cannot be safely retrofitted |
| **Phase 2: Security Layers** | - | H-01, H-03, M-01, M-02 | Time-lock race conditions, owner approval replay, notification reliability |
| **Phase 3: Owner Experience** | - | H-04, M-03, M-04 | Clipboard attacks, browser-daemon auth, kill switch integrity |
| **All Phases** | - | - | Supply chain attacks on dependencies (npm audit, lockfile, SBOM) |

---

## Known Incidents Reference

| Incident | Relevance | Lesson |
|----------|-----------|--------|
| **0.0.0.0 Day** (Oligo Security, 2024) | Direct -- localhost daemon exploitable via browser | Always authenticate localhost endpoints, validate Host headers |
| **oByte Wallet** (Blaze InfoSec) | Direct -- private key in cleartext logs | Never log crypto material, sanitize all log output |
| **LastPass Breach** ($438M+ losses) | Analogous -- encrypted vault stolen, cracked offline | Argon2id parameters must resist offline brute force for years |
| **DEXX Incident** ($30M+, 8620 Solana wallets) | Analogous -- centralized key management failure | Even self-hosted, key management is the #1 attack surface |
| **Frame.sh Audit** (Cure53/Doyensec) | Positive example -- only 2 Low vulns found | Desktop wallet daemon CAN be secure with proper engineering |
| **ShadowRay Campaign** | Direct -- AI services on localhost exploited | Daemon + AI agent combo is a known target pattern |
| **CVE-2025-59956** (Coder AgentAPI) | Direct -- DNS rebinding on localhost agent API | Validate Host/Origin headers on all local HTTP servers |
| **Laplas Clipper** (2023-present) | Direct -- clipboard hijacking with lookalike Solana addresses | Address whitelisting and verification UI are essential |

---

## Sources

### HIGH Confidence
- [SQLite WAL Documentation](https://sqlite.org/wal.html)
- [SQLite File Locking](https://sqlite.org/lockingv3.html)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [RFC 9106 - Argon2](https://www.rfc-editor.org/rfc/rfc9106.html)
- [RFC 8452 - AES-GCM-SIV](https://www.rfc-editor.org/rfc/rfc8452.html)
- [Libsodium Secure Memory](https://libsodium.gitbook.io/doc/memory_management)
- [Node.js Issue #18896 - crypto.alloc()](https://github.com/nodejs/node/issues/18896)
- [Node.js Issue #30956 - Secure Memory](https://github.com/nodejs/node/issues/30956)
- [better-sqlite3 Performance](https://wchargin.com/better-sqlite3/performance.html)
- [Frame Security Audit FRM-01](https://medium.com/@framehq/frame-security-audit-frm-01-7a90975992af)

### MEDIUM Confidence
- [Oligo Security - 0.0.0.0 Day](https://www.oligo.security/blog/0-0-0-0-day-exploiting-localhost-apis-from-the-browser)
- [GitHub Blog - Localhost CORS and DNS Rebinding](https://github.blog/security/application-security/localhost-dangers-cors-and-dns-rebinding/)
- [GitHub Blog - DNS Rebinding Attacks Explained](https://github.blog/security/application-security/dns-rebinding-attacks-explained-the-lookup-is-coming-from-inside-the-house/)
- [elttam - Key Recovery Attacks on GCM](https://www.elttam.com/blog/key-recovery-attacks-on-gcm/)
- [Halborn - Clipper Malware](https://www.halborn.com/blog/post/clipper-malware-how-hackers-steal-crypto-with-clipboard-hijacking)
- [Trust Wallet - Clipboard Hijacking](https://trustwallet.com/blog/security/clipboard-hijacking-attacks-how-to-prevent-them)
- [arXiv - Evaluating Argon2 Adoption (2025)](https://arxiv.org/html/2504.17121v1)
- [CVE-2025-59956 - Coder AgentAPI DNS Rebinding](https://www.miggo.io/vulnerability-database/cve/CVE-2025-59956)
- [Blaze InfoSec - Crypto Wallet Vulnerabilities](https://www.blazeinfosec.com/post/vulnerabilities-crypto-wallets/)
- [CWE-331 - Insufficient Entropy](https://cwe.mitre.org/data/definitions/331.html)
- [Discord Webhook Rate Limits](https://birdie0.github.io/discord-webhooks-guide/other/rate_limits.html)

### LOW Confidence (needs further validation)
- Telegram webhook silent failure reports (community forums, late 2025)
- Specific swap file key extraction techniques (theoretical, no Node.js-specific PoC found)
- Kill switch bypass via daemon process compromise (architectural reasoning, no known incident)
