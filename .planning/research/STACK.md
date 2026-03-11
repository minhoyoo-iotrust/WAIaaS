# Technology Stack: External Action Framework

**Project:** WAIaaS v31.11 External Action Framework Design
**Researched:** 2026-03-11
**Mode:** Subsequent milestone -- stack additions for new capabilities only

## Core Finding: No New Dependencies Required

The External Action framework (ResolvedAction union, ISignerCapability, CredentialVault, async tracking generalization, venue-aware policy, pipeline routing) requires **zero new npm packages**. All cryptographic primitives and infrastructure patterns already exist in the codebase.

This is a design-only milestone (no implementation), but the stack analysis confirms the implementation milestone (v31.12) will not introduce dependency bloat.

---

## Recommended Stack (Additions/Changes)

### HMAC Signing (HmacSignerCapability)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `node:crypto` createHmac | Node.js 22 built-in | HMAC-SHA256/SHA512 signing for CEX API auth | Already used by PolymarketSigner (`packages/actions/src/providers/polymarket/signer.ts`) and WebhookDeliveryQueue (`packages/daemon/src/services/webhook-delivery-queue.ts`). Zero new deps. |

**Existing precedent:** `createHmac('sha256', secret).update(payload).digest('hex')` pattern is proven in two production modules. The new `HmacSignerCapability` adapter will wrap this same `node:crypto` call behind `ISignerCapability.sign()`.

**Supported algorithms:** HMAC-SHA256 (Binance, Coinbase, most CEXs), HMAC-SHA512 (Kraken). Both available via `node:crypto` `createHmac(algorithm, key)`.

### RSA-PSS Signing (RsaPssSignerCapability)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `node:crypto` createSign / createVerify | Node.js 22 built-in | RSA-PSS signatures for external API auth | Node.js crypto module provides full RSA-PSS support (`sign.sign({ key, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength })`). No external library needed. |
| `node:crypto` generateKeyPairSync | Node.js 22 built-in | RSA key pair generation (for CredentialVault key generation utility) | Verified available on Node.js 22.22.0. |

**Why not jose:** jose (v6.1.3, already a dependency) handles JWT/JWS but does not expose raw RSA-PSS signing for arbitrary payloads. `node:crypto` is the correct tool for generic RSA-PSS signing.

**Why not @noble/curves:** Overkill for RSA. @noble/curves excels at elliptic curve crypto; RSA-PSS is natively supported in `node:crypto` with hardware acceleration.

### Ed25519 / ECDSA Arbitrary Bytes Signing (signBytes capability)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `sodium-native` | ^4.3.1 | Ed25519 signBytes for Solana-side arbitrary signing | Already a dependency. Used by keystore for Solana key operations. |
| `viem` signMessage / signTypedData | 2.x (existing) | ECDSA-secp256k1 signing | Already used throughout EVM pipeline. |
| `@solana/kit` | 6.x (existing) | Solana signing utilities | Already used by SolanaAdapter. |

**Decision:** Ed25519 uses sodium-native (already present), ECDSA uses viem (already present). No new deps.

### CredentialVault Encryption

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `settings-crypto.ts` (existing) | N/A (internal) | AES-256-GCM encrypt/decrypt + HKDF key derivation | CredentialVault will import `encryptSettingValue()` / `decryptSettingValue()` directly from `packages/daemon/src/infrastructure/settings/settings-crypto.ts`. Same encryption, different storage table. |

**Key design decision:** CredentialVault uses the **same HKDF(SHA-256) derivation** from master password but with a **different HKDF info string** (e.g., `'credential-vault-v1'` vs existing `'settings-encryption'`). This gives domain separation without introducing a new KDF.

**Per-credential salt consideration:** Unlike SettingsService (fixed salt), CredentialVault SHOULD use a per-credential random salt stored alongside the ciphertext. Reason: per-wallet credentials are higher-value targets than daemon settings, and per-salt prevents rainbow table attacks across credentials. `node:crypto.randomBytes(16)` generates the salt -- no new dependency.

### EIP-712 Typed Data (existing, reused)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `viem` signTypedData | 2.x (existing) | EIP-712 signing for Eip712SignerCapability adapter | Already used by Polymarket (3-domain), Hyperliquid (dual signing), ERC-8004 (AgentWalletSet). The new `Eip712SignerCapability` wraps the existing `privateKeyToAccount().signTypedData()` call. |

### ERC-8128 HTTP Message Signing (existing, reused)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@waiaas/core` erc8128 module | Existing | `Erc8128SignerCapability` wraps `signHttpMessage()` | Already in `packages/core/src/erc8128/`. RFC 9421 signature base + EIP-191 signing. The new capability adapter adds pipeline integration without modifying the module. |

### Zod Schema Extensions (existing, extended)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `zod` | Existing (via @waiaas/core) | ResolvedAction discriminatedUnion, SignedDataAction/SignedHttpAction schemas, CredentialType enum, extended AsyncTrackingResult | Zod SSoT pattern (CLAUDE.md mandate). `z.discriminatedUnion('kind', [...])` for ResolvedAction, same pattern as existing 8-type transaction discriminatedUnion. |

### Database (existing, extended)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Drizzle ORM + better-sqlite3 | Existing | `wallet_credentials` table (DB v55), possible `external_action_status` column on `transactions` | Standard migration pattern (v1.4+). No new DB engine or ORM. |

---

## Alternatives Considered (and Rejected)

| Category | Recommended | Alternative | Why Rejected |
|----------|-------------|-------------|--------------|
| HMAC signing | `node:crypto` createHmac | `@noble/hashes` hmac | Extra dep for something Node.js does natively. Project already uses `node:crypto` for HMAC in 2 modules. |
| RSA-PSS signing | `node:crypto` createSign | `jose` JWS | jose does JWS (JSON Web Signature) not raw RSA-PSS over arbitrary payloads. Wrong abstraction. |
| RSA-PSS signing | `node:crypto` createSign | `node-forge` | Unnecessary JS-only reimplementation. Node.js native crypto uses OpenSSL bindings (faster, FIPS-capable). |
| Credential encryption | Reuse `settings-crypto.ts` | `libsodium` secretbox | AES-256-GCM via settings-crypto is proven, and SettingsService already depends on it. Adding a second encryption primitive creates cognitive overhead. sodium-native's `crypto_secretbox` (XSalsa20-Poly1305) would work but diverges from established pattern. |
| Credential encryption | Reuse `settings-crypto.ts` | Per-credential Argon2id | Argon2id (used by keystore) is 300ms+ per operation. CredentialVault needs fast CRUD. HKDF(SHA-256) from master password is sufficient (same reasoning as SettingsService). |
| Unified signer registry | In-process registry (Map) | Separate microservice | WAIaaS is a self-hosted daemon. Inter-process communication adds latency and complexity for zero benefit. |
| Async tracking storage | Extend `transactions` table columns | Separate `external_actions` table | Design decision for the design phase (R4-4), but extending existing table follows the bridge_status precedent and avoids JOIN complexity. |

---

## What NOT to Add

| Package | Why Not |
|---------|---------|
| `@noble/hashes` | `node:crypto` already provides HMAC-SHA256/SHA512. Adding @noble/hashes creates two paths for the same operation. |
| `@noble/curves` | Already have viem (which wraps @noble/curves internally) and sodium-native. No gap to fill. |
| `node-forge` | Pure JS crypto library. Slower than native `node:crypto`. No reason to use it. |
| `tweetnacl` | Redundant with sodium-native (which is the C binding of the same NaCl primitives). |
| `aws-sdk` / `@aws-sdk/*` | CEX credential management is via CredentialVault, not cloud KMS. Self-hosted mandate. |
| `keytar` / OS keychain | WAIaaS runs headless (daemon/Docker). OS keychain not available. Master password + HKDF is the established pattern. |
| `passport` / auth libraries | CredentialVault auth uses existing sessionAuth/masterAuth middleware. No new auth framework. |
| New ORM or DB driver | Drizzle + better-sqlite3 is the established stack. wallet_credentials is a standard table addition. |

---

## Integration Points with Existing Stack

### 1. ActionProviderRegistry (packages/daemon/src/infrastructure/action/action-provider-registry.ts)
- **Change:** `resolve()` return type widens from `ContractCallRequest` to `ResolvedAction`
- **Normalization:** Registry adds `kind: 'contractCall'` to existing provider results (backward compat)
- **Impact:** Interface change only, no new deps

### 2. sign-message.ts Pipeline (packages/daemon/src/pipeline/sign-message.ts)
- **Change:** Extended to handle `SignedDataAction` (kind: 'signedData') routing
- **Integration:** `ISignerCapability` adapter wraps existing `privateKeyToAccount().signTypedData()` call
- **Impact:** New code path alongside existing personal/typedData branches

### 3. ERC-8128 Module (packages/core/src/erc8128/)
- **Change:** `Erc8128SignerCapability` adapter wraps `signHttpMessage()`
- **Integration:** Existing module untouched; adapter consumes its public API
- **Impact:** New adapter file, no module changes

### 4. SettingsService (packages/daemon/src/infrastructure/settings/)
- **Change:** CredentialVault imports `settings-crypto.ts` encrypt/decrypt functions
- **Coexistence:** Global credentials stay in SettingsService (`actions.{provider}_api_key`). Per-wallet credentials go to CredentialVault. Lookup: per-wallet -> global fallback.
- **Impact:** New service alongside, shared crypto functions

### 5. AsyncPollingService + IAsyncStatusTracker (packages/actions/src/common/)
- **Change:** `AsyncTrackingResult.state` enum extended with off-chain states
- **Integration:** AsyncPollingService already handles arbitrary tracker implementations via `IAsyncStatusTracker` interface
- **Impact:** Enum widening (additive, backward-compatible)

### 6. DatabasePolicyEngine (packages/daemon/src/pipeline/database-policy-engine.ts)
- **Change:** `TransactionParam` extended with `venue`, `actionCategory`, `notionalUsd` fields
- **Integration:** Existing `actionProvider`/`actionName` fields preserved; new fields are additive
- **Impact:** Interface extension, new policy type implementations

---

## Crypto Primitive Summary

All signing primitives needed for the External Action framework are available without new dependencies:

| Signing Scheme | Primitive | Source | Status |
|----------------|-----------|--------|--------|
| EIP-712 typedData | `signTypedData()` | viem 2.x | Already used (Polymarket, Hyperliquid, ERC-8004) |
| personal_sign | `signMessage()` | viem 2.x | Already used (sign-message pipeline) |
| HMAC-SHA256 | `createHmac('sha256', key)` | node:crypto | Already used (Polymarket, Webhooks) |
| HMAC-SHA512 | `createHmac('sha512', key)` | node:crypto | Available (same API, different algorithm string) |
| RSA-PSS | `createSign('RSA-SHA256')` | node:crypto | Available natively (Node.js 22, OpenSSL bindings) |
| ECDSA-secp256k1 | `privateKeyToAccount().sign()` | viem 2.x | Already used (transaction signing) |
| Ed25519 | `sodium.crypto_sign_detached()` | sodium-native 4.x | Already used (Solana keystore) |
| ERC-8128 HTTP | `signHttpMessage()` | @waiaas/core erc8128 | Already implemented (v30.10) |
| AES-256-GCM | `encryptSettingValue()` | settings-crypto.ts | Already used (SettingsService) |

---

## Installation

```bash
# No new packages to install.
# All capabilities are covered by existing dependencies:
#   - node:crypto (built-in) -- HMAC, RSA-PSS, AES-256-GCM, HKDF
#   - viem 2.x -- EIP-712, personal_sign, ECDSA
#   - sodium-native ^4.3.1 -- Ed25519
#   - jose ^6.1.3 -- JWT (session auth, unchanged)
#   - zod (via @waiaas/core) -- schema extensions
#   - drizzle-orm + better-sqlite3 -- DB schema extensions
```

---

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| HMAC-SHA256 via node:crypto | HIGH | Already used in 2 production modules (Polymarket, Webhooks). Verified on Node.js 22.22.0. |
| RSA-PSS via node:crypto | HIGH | Verified `createSign` availability on Node.js 22.22.0. Standard OpenSSL binding, documented in Node.js docs. |
| Ed25519 via sodium-native | HIGH | Already a dependency (^4.3.1). Used by keystore for Solana signing. |
| CredentialVault encryption reuse | HIGH | `settings-crypto.ts` is a clean, tested module with `encryptSettingValue()`/`decryptSettingValue()`. Import-ready. |
| Zod discriminatedUnion for ResolvedAction | HIGH | Same pattern as existing 8-type transaction union. Proven at scale. |
| No new dependencies needed | HIGH | Verified all crypto primitives against existing codebase and Node.js 22 capabilities. |

## Sources

- `packages/actions/src/providers/polymarket/signer.ts` -- HMAC-SHA256 + EIP-712 precedent
- `packages/daemon/src/services/webhook-delivery-queue.ts` -- HMAC-SHA256 precedent
- `packages/daemon/src/infrastructure/settings/settings-crypto.ts` -- AES-256-GCM encryption
- `packages/core/src/erc8128/index.ts` -- ERC-8128 HTTP message signing module
- `packages/daemon/src/pipeline/sign-message.ts` -- sign-message pipeline
- `packages/actions/src/common/async-status-tracker.ts` -- IAsyncStatusTracker interface
- Node.js 22.22.0 `node:crypto` -- verified createHmac, createSign, generateKeyPairSync availability
- `internal/objectives/m31-11-external-action-design.md` -- milestone requirements
