# Architecture Patterns: XRPL Adapter Integration

**Domain:** XRP Ledger chain integration into existing multi-chain Wallet-as-a-Service
**Researched:** 2026-04-03
**Overall Confidence:** HIGH (existing codebase patterns are well-established; XRPL CAIP standards are officially documented)

## Recommended Architecture

XRPL integrates as the 3rd `ChainType` (`'ripple'`) following the exact pattern established by Solana and EVM adapters. The integration is **additive** -- no existing interfaces change, only new implementations and SSoT array extensions.

### High-Level Integration Map

```
@waiaas/shared (SSoT enums)
    |-- CHAIN_TYPES: [..., 'ripple']
    |-- NETWORK_TYPES: [..., 'xrpl-mainnet', 'xrpl-testnet', 'xrpl-devnet']
    |-- RIPPLE_NETWORK_TYPES: new array
    |-- ENVIRONMENT_NETWORK_MAP: + 'ripple:mainnet', 'ripple:testnet'
    v
@waiaas/core (re-exports + Zod schemas + CAIP maps)
    |-- CAIP2_TO_NETWORK: + xrpl:0, xrpl:1, xrpl:2
    |-- NATIVE_SLIP44: + 144 (XRP)
    |-- NATIVE_DECIMALS: + ripple: 6
    |-- NATIVE_SYMBOLS: + ripple: 'XRP'
    v
@waiaas/adapter-ripple (NEW package)
    |-- RippleAdapter implements IChainAdapter (21/25 methods)
    |-- xrpl.js (v4.x) as sole external dependency
    v
@waiaas/daemon
    |-- AdapterPool: + chain === 'ripple' branch
    |-- KeyStore: + chain === 'ripple' Ed25519 + r-address derivation
    |-- Pipeline stage5 buildByType: existing branches work as-is
    |-- DB migration v62: CHECK constraint expansion
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `@waiaas/shared` | SSoT enum arrays (CHAIN_TYPES, NETWORK_TYPES, RIPPLE_NETWORK_TYPES) | All packages (imported) |
| `@waiaas/core` | Re-export enums, Zod schemas, CAIP-2/19 maps, IChainAdapter interface, NATIVE_DECIMALS/SYMBOLS | Adapter, daemon, SDK |
| `@waiaas/adapter-ripple` | RippleAdapter: XRPL-specific blockchain interaction via xrpl.js | @waiaas/core (interface), xrpl (npm) |
| `@waiaas/daemon` AdapterPool | Lazy-create RippleAdapter for chain=ripple | @waiaas/adapter-ripple (dynamic import) |
| `@waiaas/daemon` KeyStore | Ed25519 key gen + r-address derivation for chain=ripple | sodium-native, ripple-keypairs |
| `@waiaas/daemon` Pipeline | Stage 5 buildByType dispatches to adapter; no ripple-specific branches needed | RippleAdapter via IChainAdapter |
| `@waiaas/daemon` DB | Migration v62: expand CHECK constraints to include 'ripple' | SQLite |

### Data Flow: XRPL Transaction Through Pipeline

```
1. POST /v1/wallets/:id/send  { type: "TRANSFER", to: "rN7n3...", amount: "1000000" }
                |
2. Stage 1 (Validate): chain='ripple' validated via ChainTypeEnum
                |
3. Stage 2 (Enrich): estimateFee -> XRPL fee in drops, CAIP-2 enrichment
                |
4. Stage 3 (Policy): spending limits, ALLOWED_NETWORKS check
                |
5. Stage 4 (Delay/Approval): standard delay + owner approval flow
                |
6. Stage 5 (Execute):
   buildByType(adapter, request, publicKey)
     -> case 'TRANSFER': adapter.buildTransaction({from: rAddr, to, amount})
     -> RippleAdapter builds Payment TX with Sequence, Fee, LastLedgerSequence
     -> adapter.simulateTransaction() -> xrpl.Client.submit({...}, {fail_hard: false})
     -> adapter.signTransaction(unsignedTx, privateKey) -> xrpl.sign() with Ed25519
     -> adapter.submitTransaction(signedTx) -> xrpl.Client.submitAndWait()
                |
7. Stage 6 (Confirm): waitForConfirmation -> xrpl.Client.getTransaction()
```

## New Package: `@waiaas/adapter-ripple`

### Location in Monorepo

```
packages/adapters/ripple/
  package.json
  tsconfig.json
  tsconfig.build.json
  vitest.config.ts
  src/
    adapter.ts        -- RippleAdapter implements IChainAdapter
    constants.ts      -- XRPL-specific constants (reserve amounts, fee defaults)
    types.ts          -- XRPL-specific internal types
    address.ts        -- r-address derivation from Ed25519 public key
    index.ts          -- barrel export
    __tests__/
      adapter.test.ts
      address.test.ts
```

### package.json Structure

```json
{
  "name": "@waiaas/adapter-ripple",
  "version": "2.13.0",
  "description": "WAIaaS XRP Ledger chain adapter - Trust Lines/XLS-20 support",
  "license": "MIT",
  "type": "module",
  "publishConfig": { "access": "public" },
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": { ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" } },
  "dependencies": {
    "xrpl": "^4.6.0",
    "@waiaas/core": "workspace:*"
  }
}
```

**Why `xrpl` v4.x:** Official XRPLF SDK, TypeScript-native, includes `ripple-keypairs` and `ripple-binary-codec` internally. Node.js 22 supported. Single dependency covers RPC client, transaction building, signing, and address derivation. HIGH confidence (npm 4.6.0 verified).

### IChainAdapter Method Implementation Map

| Method | XRPL Implementation | Notes |
|--------|---------------------|-------|
| `connect(rpcUrl)` | `new Client(rpcUrl).connect()` | WebSocket-based (wss://); HTTP fallback possible |
| `disconnect()` | `client.disconnect()` | Clean WebSocket close |
| `isConnected()` | `client.isConnected()` | Direct |
| `getHealth()` | `client.request({command: 'server_info'})` | Map server_state to health |
| `getBalance(address)` | `client.getXrpBalance(address)` + reserve calculation | Return available = balance - reserve |
| `buildTransaction(req)` | Build Payment TX JSON | Set Sequence, Fee, LastLedgerSequence |
| `simulateTransaction(tx)` | `client.submit(tx, {fail_hard: false})` dry run | Check `engine_result` |
| `signTransaction(tx, key)` | `xrpl.sign(txJSON, wallet)` | Construct Wallet from Ed25519 key |
| `submitTransaction(signed)` | `client.submit(signed)` | Return txHash |
| `waitForConfirmation(hash)` | `client.request({command: 'tx', transaction: hash})` with polling | Check `validated: true` |
| `getAssets(address)` | XRP balance + `account_lines` for Trust Lines | Map to AssetInfo[] |
| `estimateFee(req)` | `client.request({command: 'fee'})` | Return open_ledger_fee in drops |
| `buildTokenTransfer(req)` | Build Payment TX with Amount = IOU object `{currency, issuer, value}` | Trust Line must exist |
| `getTokenInfo(token)` | Parse `currency.issuer` format; `gateway_balances` for metadata | Return TokenInfo |
| `buildApprove(req)` | Build TrustSet TX `{LimitAmount: {currency, issuer, value}}` | Semantic: "allow receiving this token" |
| `buildContractCall()` | **throw NOT_SUPPORTED** | XRPL has no smart contracts (Hooks not on mainnet) |
| `buildBatch()` | **throw BATCH_NOT_SUPPORTED** | XRPL transactions are atomic single-ops |
| `getTransactionFee(tx)` | Extract Fee field from built TX | Already in drops (bigint) |
| `getCurrentNonce(address)` | `account_info` -> `Sequence` number | Analogous to EVM nonce |
| `sweepAll()` | **Not implemented** (optional method) | Reserve prevents full sweep |
| `parseTransaction(rawTx)` | `xrpl.decode(rawTx)` -> map to ParsedTransaction | Binary codec decode |
| `signExternalTransaction(rawTx, key)` | `xrpl.sign(decoded, wallet)` | Re-sign external TX |
| `buildNftTransferTx(req)` | Build NFTokenCreateOffer TX | XLS-20 sell offer at 0 amount to specific destination |
| `transferNft(req, key)` | CreateOffer + sign + submit | 2-step: create offer, accept requires recipient action |
| `approveNft()` | **throw NOT_SUPPORTED** | XLS-20 has no approval mechanism |

## KeyStore: Ed25519 Reuse + r-Address Derivation

### Current KeyStore Design

The `LocalKeyStore` has a clean `chain` switch in `generateKeyPair()`:
- `'solana'` -> `generateEd25519KeyPair()` (sodium-native)
- `'ethereum'` -> `generateSecp256k1KeyPair()` (crypto.randomBytes + viem)

### XRPL Extension Strategy

**Use Ed25519 (same as Solana)** because:
1. xrpl.js defaults to Ed25519 for new wallets
2. sodium-native already generates Ed25519 keypairs
3. Smaller signatures (64 bytes vs 72 for secp256k1)
4. WAIaaS already has the Ed25519 infrastructure

**Key derivation flow for `chain === 'ripple'`:**

```
1. sodium.crypto_sign_keypair() -> 32-byte publicKey + 64-byte secretKey
   (identical to Solana path)

2. r-address derivation (XRPL-specific):
   a. Prefix publicKey with 0xED -> 33-byte prefixedPubKey
   b. SHA-256(prefixedPubKey) -> 32-byte hash
   c. RIPEMD-160(hash) -> 20-byte accountId
   d. Prepend payload type byte 0x00
   e. Base58Check encode with XRP alphabet -> "r..." address

3. Encrypt 64-byte secretKey with AES-256-GCM + Argon2id
   (identical to Solana path)

4. Store KeystoreFileV1 with curve: 'ed25519', chain: 'ripple'
```

**Implementation choice:** Use `ripple-keypairs` (bundled in `xrpl` package) for `deriveAddress()` to avoid reimplementing Base58Check with XRP-specific alphabet. The adapter package already depends on `xrpl`, so no new dependency in daemon -- import from `ripple-keypairs` directly (it is a sub-package of `xrpl`).

**KeyStore code change:**

```typescript
// In keystore.ts generateKeyPair():
if (chain === 'ripple') {
  return this.generateRippleEd25519KeyPair(walletId, network, masterPassword);
}

// New method:
private async generateRippleEd25519KeyPair(...): Promise<...> {
  const sodium = loadSodium();
  // Same Ed25519 keypair generation as Solana
  const publicKeyBuf = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES);
  const secretKeyBuf = Buffer.alloc(sodium.crypto_sign_SECRETKEYBYTES);
  sodium.crypto_sign_keypair(publicKeyBuf, secretKeyBuf);

  // XRPL r-address derivation via ripple-keypairs
  const prefixedHex = 'ED' + publicKeyBuf.toString('hex').toUpperCase();
  const { deriveAddress } = await import('ripple-keypairs');
  const rAddress = deriveAddress(prefixedHex);

  // Encrypt and store (same as Solana path)
  const encrypted = await encrypt(secretKeyBuf, masterPassword);
  sodium.sodium_memzero(secretKeyBuf);
  // ... write KeystoreFileV1 with chain: 'ripple', curve: 'ed25519', publicKey: rAddress
}
```

**KeystoreFileV1 change:** The `curve` field already supports `'ed25519'`; no schema change needed. The `chain` field stores `'ripple'`.

## CAIP Standard Registration

### CAIP-2 Namespace (Network Mapping)

**Source:** [XRP Ledger CAIP-2 Specification](https://namespaces.chainagnostic.org/xrpl/caip2) (HIGH confidence)

Add to `packages/core/src/caip/network-map.ts`:

```typescript
// XRPL
'xrpl:0': { chain: 'ripple', network: 'xrpl-mainnet' },
'xrpl:1': { chain: 'ripple', network: 'xrpl-testnet' },
'xrpl:2': { chain: 'ripple', network: 'xrpl-devnet' },
```

Network IDs: `0` = livenet/mainnet, `1` = testnet, `2` = devnet. These are the `network_id` values from `server_info` RPC response.

### CAIP-19 Asset Identification

**Source:** [XRP Ledger CAIP-19 Specification](https://namespaces.chainagnostic.org/xrpl/caip19) (HIGH confidence)

| Asset Type | CAIP-19 Format | Example |
|-----------|----------------|---------|
| Native XRP | `xrpl:{net}/slip44:144` | `xrpl:0/slip44:144` |
| Trust Line IOU | `xrpl:{net}/token:{currency}.{issuer}` | `xrpl:0/token:USD.rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B` |
| XLS-20 NFT | `xrpl:{net}/xls20:{nftokenId}` | `xrpl:0/xls20:000800006203...` |

**Changes to `asset-helpers.ts`:**

```typescript
// NATIVE_SLIP44 additions:
'xrpl:0': 144,  // XRP SLIP-44 coin type
'xrpl:1': 144,
'xrpl:2': 144,

// tokenAssetId() extension:
if (namespace === 'xrpl') {
  // Trust Line format: currency.issuer (e.g., "USD.rN7n3...")
  return formatCaip19(caip2, 'token', address);
}

// nftAssetId() extension:
if (standard === 'xls20') {
  return formatCaip19(caip2, 'xls20', tokenId);  // NFTokenID is the reference
}
```

**CAIP-19 regex compatibility check:** The existing `CAIP19_REGEX` pattern `[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}/[-a-z0-9]{3,8}:[-.%a-zA-Z0-9]{1,128}` supports:
- `xrpl` namespace: 4 chars, lowercase alpha -- OK
- `slip44`, `token`, `xls20` asset namespaces -- OK
- Trust Line reference `USD.rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B` -- contains `.` which IS in the `[-.%a-zA-Z0-9]` character class -- OK
- NFTokenID (64-char hex) -- alphanumeric -- OK

No regex changes needed. HIGH confidence.

### `parseAssetId()` Extension

The existing `parseAssetId()` in `asset-resolve.ts` uses `caip2ToNetwork()` which will work once the CAIP-2 map is extended. The `isNative` check uses `slip44` namespace which applies to XRP natively. The `address` extraction for non-native returns `assetReference` which for Trust Lines will be `USD.rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B` -- the adapter must parse this into currency + issuer.

## SSoT Enum Extensions

### `@waiaas/shared/src/networks.ts` Changes

```typescript
// CHAIN_TYPES
export const CHAIN_TYPES = ['solana', 'ethereum', 'ripple'] as const;

// NETWORK_TYPES
export const NETWORK_TYPES = [
  // Solana (3)
  'solana-mainnet', 'solana-devnet', 'solana-testnet',
  // EVM (12)
  'ethereum-mainnet', ..., 'hyperevm-testnet',
  // XRPL (3)
  'xrpl-mainnet', 'xrpl-testnet', 'xrpl-devnet',
] as const;

// NEW: RIPPLE_NETWORK_TYPES
export const RIPPLE_NETWORK_TYPES = ['xrpl-mainnet', 'xrpl-testnet', 'xrpl-devnet'] as const;
export type RippleNetworkType = (typeof RIPPLE_NETWORK_TYPES)[number];

// ENVIRONMENT_NETWORK_MAP additions:
'ripple:mainnet': ['xrpl-mainnet'],
'ripple:testnet': ['xrpl-testnet', 'xrpl-devnet'],

// NETWORK_DISPLAY_NAMES additions:
'xrpl-mainnet': 'XRP Ledger Mainnet',
'xrpl-testnet': 'XRP Ledger Testnet',
'xrpl-devnet': 'XRP Ledger Devnet',

// NETWORK_NATIVE_SYMBOL additions:
'xrpl-mainnet': 'XRP',
'xrpl-testnet': 'XRP',
'xrpl-devnet': 'XRP',

// validateChainNetwork() extension:
} else if (chain === 'ripple') {
  if (!(RIPPLE_NETWORK_TYPES as readonly string[]).includes(network)) {
    throw new Error(`Invalid network '${network}' for chain 'ripple'. Valid: ${RIPPLE_NETWORK_TYPES.join(', ')}`);
  }
}
```

### `@waiaas/core` Changes

```typescript
// enums/chain.ts: re-export RIPPLE_NETWORK_TYPES, RippleNetworkType

// ENVIRONMENT_SINGLE_NETWORK additions:
'ripple:mainnet': 'xrpl-mainnet',
'ripple:testnet': 'xrpl-testnet',  // devnet mapped as secondary testnet

// MAINNET_NETWORKS additions:
'xrpl-mainnet',

// NATIVE_DECIMALS additions:
ripple: 6,  // XRP uses 6 decimal places (1 XRP = 1,000,000 drops)

// NATIVE_SYMBOLS additions:
ripple: 'XRP',
```

## AdapterPool Integration

### Dynamic Import Pattern

Following the existing pattern in `adapter-pool.ts`:

```typescript
// In AdapterPool.resolve():
} else if (chain === 'ripple') {
  const { RippleAdapter } = await import('@waiaas/adapter-ripple');
  adapter = new RippleAdapter(network);
}
```

### RPC URL Configuration

XRPL uses WebSocket by default (wss://). Config key mapping:

```typescript
// rpcConfigKey() extension:
if (chain === 'ripple') {
  // xrpl-mainnet -> xrpl_mainnet
  const suffix = network.startsWith('xrpl-') ? network.slice('xrpl-'.length) : network;
  return `xrpl_${suffix}`;
}
```

This maps to `config.toml` keys:
```toml
[rpc]
xrpl_mainnet = "wss://xrplcluster.com"
xrpl_testnet = "wss://s.altnet.rippletest.net:51233"
xrpl_devnet = "wss://s.devnet.rippletest.net:51233"
```

### RPC Setting Keys for Admin UI

```typescript
export const RIPPLE_RPC_SETTING_KEYS: readonly string[] =
  RIPPLE_NETWORK_TYPES.map((n) => `xrpl_${n.replace('xrpl-', '')}`);
```

## Pipeline Stage Modifications

### Stage 5: `buildByType()` -- NO CHANGES NEEDED

The existing `buildByType()` dispatches based on `request.type`:
- `TRANSFER` -> `adapter.buildTransaction()` -- works
- `TOKEN_TRANSFER` -> `adapter.buildTokenTransfer()` -- works (Trust Line IOU)
- `APPROVE` -> `adapter.buildApprove()` -- works (TrustSet mapping)
- `NFT_TRANSFER` -> `adapter.buildNftTransferTx()` -- works (XLS-20)
- `CONTRACT_CALL` -> `adapter.buildContractCall()` -- RippleAdapter throws NOT_SUPPORTED
- `BATCH` -> `adapter.buildBatch()` -- RippleAdapter throws BATCH_NOT_SUPPORTED
- `CONTRACT_DEPLOY` -> `adapter.buildContractCall()` -- RippleAdapter throws NOT_SUPPORTED

The pipeline is **chain-agnostic by design**. The only chain-specific logic is in the adapter itself. No stage modifications needed.

### Pipeline Helpers: `getRequestAmount()`

XRP amounts are in drops (10^6). The existing pipeline uses `BigInt(amount)` which works with smallest-unit representation. No changes needed as long as REST API/SDK always sends amounts in drops.

### Gas Safety Margin

The existing `(estimatedGas * 120n) / 100n` pattern applies to XRPL fees too. XRPL fees are small (typically 12 drops) so a 20% margin is fine. The adapter's `estimateFee()` returns fee in drops as `bigint`.

## DB Migration: v62

### What Changes

1. **CHECK constraints** on `chain` columns -- currently `CHECK (chain IN ('solana', 'ethereum'))`, must become `CHECK (chain IN ('solana', 'ethereum', 'ripple'))`.
2. **Network CHECK constraints** -- tables with `network IN (...)` need expansion for xrpl-mainnet/testnet/devnet.

### Migration Strategy

Since SQLite cannot ALTER CHECK constraints, the migration uses the standard WAIaaS pattern: **recreate table + copy data**.

```sql
-- For each table with chain CHECK constraint:
-- 1. Create temp table with new CHECK
-- 2. INSERT INTO temp SELECT * FROM original
-- 3. DROP original
-- 4. ALTER TABLE temp RENAME TO original
-- 5. Recreate indexes
```

The existing codebase derives CHECK constraints from `CHAIN_TYPES` array at runtime (`inList(CHAIN_TYPES)`), so the DDL in `schema-ddl.ts` automatically picks up `'ripple'` once `CHAIN_TYPES` is extended. The migration only needs to handle existing DB instances.

### Tables Requiring Migration

From `schema.ts` and `schema-ddl.ts` analysis:

| Table | Constraint | Impact |
|-------|-----------|--------|
| `wallets` | `check_chain` on `chain` | Must expand |
| `incoming_transactions` | `check_incoming_chain` on `chain` | Must expand |
| `defi_positions` | `check_position_chain` on `chain` | Must expand |
| `nft_metadata_cache` | inline `chain IN (...)` | Must expand |

### Schema Version Bump

Current: `LATEST_SCHEMA_VERSION = 61`
New: `LATEST_SCHEMA_VERSION = 62`

Migration file: `packages/daemon/src/infrastructure/database/migrations/v61-v70.ts`

## NOT_SUPPORTED Methods

These methods throw `WAIaaSError('CHAIN_NOT_SUPPORTED')` or equivalent:

| Method | Reason | Error |
|--------|--------|-------|
| `buildContractCall()` | XRPL has no smart contracts (Hooks are not on mainnet) | `CONTRACT_CALL_NOT_SUPPORTED` |
| `buildBatch()` | XRPL transactions are atomic single operations | `BATCH_NOT_SUPPORTED` |
| `sweepAll()` | Optional method; XRPL reserve prevents full sweep | Not implemented (method is optional via `?`) |
| `approveNft()` | XLS-20 NFTs have no approval mechanism (use offers instead) | `NFT_APPROVE_NOT_SUPPORTED` |

## XRPL-Specific Architectural Considerations

### Account Activation (Reserve)

XRP Ledger accounts must hold a minimum **base reserve (currently 1 XRP = 1,000,000 drops)** + **owner reserve (0.2 XRP = 200,000 drops per object)**. The adapter must:
1. In `getBalance()`: return both total and available (total - reserve) in BalanceInfo
2. In `buildTransaction()`: validate that amount + fee does not exceed available balance
3. In `getAssets()`: include reserve info in native asset metadata

### Destination Tag

XRPL uses `DestinationTag` (uint32) for exchange deposits. Map to existing `memo` field with special handling:
- If `memo` is a numeric string, set as `DestinationTag`
- Extend `TransferRequest` with optional `destinationTag?: number` for explicit usage
- The REST API can pass `destinationTag` in the request body alongside `memo`

### WebSocket vs HTTP RPC

XRPL's primary RPC transport is WebSocket. The `xrpl.js` Client uses WebSocket by default:
```typescript
const client = new Client('wss://xrplcluster.com');
await client.connect();
```

This means the adapter maintains a persistent WebSocket connection, unlike HTTP-based adapters. The `isConnected()` method maps directly to `client.isConnected()`. Reconnection logic should be handled internally (xrpl.js Client has built-in reconnect support).

### Fee Model

XRPL fees are in "drops" (1 XRP = 1,000,000 drops = 10^6). Fees are dynamic but very low (typically 10-12 drops). The `estimateFee()` returns fee in drops as `bigint`, matching the pipeline's expectation of smallest-unit amounts.

### Trust Line Semantic Mapping

The `buildApprove()` method maps to XRPL `TrustSet` transaction, but the semantics differ from ERC-20 approve:

| Aspect | ERC-20 approve | XRPL TrustSet |
|--------|---------------|---------------|
| Who initiates | Token holder (sender) | Token receiver |
| What it sets | Spending allowance for spender | Maximum amount willing to hold from issuer |
| Revocation | Set amount to 0 | Set limit to 0 |

The adapter's `buildApprove()` interprets `ApproveParams` as:
- `spender` -> `issuer` (the entity you trust)
- `token.address` -> `currency` code
- `amount` -> Trust Line `limit`

## Patterns to Follow

### Pattern 1: Adapter-as-Package

**What:** Each chain adapter is a separate npm package under `packages/adapters/`
**When:** Adding a new chain type
**Example:** `@waiaas/adapter-ripple` follows `@waiaas/adapter-solana` and `@waiaas/adapter-evm` pattern -- single `adapter.ts` file exporting a class that implements `IChainAdapter`.

### Pattern 2: SSoT Enum Propagation

**What:** Add to `@waiaas/shared` arrays first, then propagate through re-exports
**When:** Adding chain/network types
**Flow:** `shared/networks.ts` -> `core/enums/chain.ts` (re-export) -> daemon/SDK/admin consume
**Why:** Single point of change; CHECK constraints, Zod schemas, and UI dropdowns all derive from these arrays.

### Pattern 3: Dynamic Import in AdapterPool

**What:** Use `await import('@waiaas/adapter-ripple')` in AdapterPool.resolve()
**When:** Creating adapter instances
**Why:** Avoids loading all adapter dependencies at startup; XRPL SDK is not loaded unless a ripple wallet exists.

### Pattern 4: NOT_SUPPORTED Throw Pattern

**What:** Methods that don't apply to XRPL throw typed errors
**When:** buildContractCall, buildBatch, approveNft called on ripple adapter
**Example:**
```typescript
buildContractCall(): Promise<UnsignedTransaction> {
  throw new WAIaaSError('CONTRACT_CALL_NOT_SUPPORTED', {
    message: 'XRP Ledger does not support smart contract calls',
  });
}
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Chain-Specific Logic in Pipeline

**What:** Adding `if (chain === 'ripple')` branches in stage5-execute.ts or other pipeline stages
**Why bad:** Breaks the chain-agnostic pipeline design; every new chain adds complexity
**Instead:** All chain-specific logic lives in the adapter. Pipeline dispatches via IChainAdapter interface only.

### Anti-Pattern 2: Reimplementing Crypto

**What:** Writing custom r-address derivation (RIPEMD-160 + Base58Check)
**Why bad:** Subtle bugs in checksum calculation; security risk
**Instead:** Use `ripple-keypairs.deriveAddress()` from the xrpl package (already a dependency).

### Anti-Pattern 3: Shared Mutable Connection

**What:** Multiple wallets sharing one xrpl.js Client instance across networks
**Why bad:** WebSocket disconnects affect all wallets; network confusion
**Instead:** AdapterPool creates one RippleAdapter per `chain:network` key (same as existing pattern).

### Anti-Pattern 4: Hardcoding CAIP IDs

**What:** Scattering `'xrpl:0'` strings throughout the codebase
**Why bad:** Fragile; missed updates when adding networks
**Instead:** All CAIP-2 mappings in `network-map.ts` SSoT; use `networkToCaip2()` / `caip2ToNetwork()` functions.

## Build Order (Dependency Chain)

The build order must respect package dependencies:

```
Phase 1: SSoT Extension (no code dependencies)
  1.1 @waiaas/shared: CHAIN_TYPES, NETWORK_TYPES, RIPPLE_NETWORK_TYPES, ENVIRONMENT_NETWORK_MAP
  1.2 @waiaas/core: re-exports, CAIP-2/19 maps, NATIVE_DECIMALS/SYMBOLS, Zod schemas
  1.3 DB migration v62: CHECK constraint expansion

Phase 2: Adapter Package (depends on Phase 1)
  2.1 @waiaas/adapter-ripple: scaffold + package.json + build config
  2.2 RippleAdapter: IChainAdapter 21-method implementation
  2.3 Address derivation: Ed25519 pubkey -> r-address utility
  2.4 Tests: unit tests for adapter methods + address derivation

Phase 3: Daemon Integration (depends on Phase 2)
  3.1 KeyStore: generateRippleEd25519KeyPair() + r-address derivation
  3.2 AdapterPool: chain === 'ripple' branch + rpcConfigKey extension
  3.3 Config: XRPL RPC URL settings + Admin Settings keys
  3.4 Pipeline: no changes needed (verification only)

Phase 4: API + UI (depends on Phase 3)
  4.1 REST API: chain=ripple validation passes through (SSoT-driven)
  4.2 Admin UI: Ripple chain option in wallet creation, Trust Line display
  4.3 MCP/SDK: ripple chain support (mostly automatic via SSoT)
  4.4 Skill files: XRPL guide for AI agents
```

## Scalability Considerations

| Concern | Current Scale | XRPL Impact |
|---------|---------------|-------------|
| Adapter instances | 1 per chain:network | +3 max (mainnet/testnet/devnet) |
| WebSocket connections | N/A (HTTP-based for EVM) | 1 persistent WS per network; xrpl.js has built-in reconnect |
| Fee estimation | Per-TX HTTP call | XRPL fees are near-constant; can cache for 30s |
| DB migration | Table recreation | One-time v62 migration; safe with existing pattern |
| Package size | xrpl ~2MB | Acceptable; only loaded when ripple wallets exist (dynamic import) |

## Sources

- [XRP Ledger CAIP-2 Namespace](https://namespaces.chainagnostic.org/xrpl/caip2) -- network IDs 0/1/2 (HIGH confidence)
- [XRP Ledger CAIP-19 Assets](https://namespaces.chainagnostic.org/xrpl/caip19) -- slip44:144, token, xls20 namespaces (HIGH confidence)
- [XRPL Addresses](https://xrpl.org/docs/concepts/accounts/addresses) -- r-address derivation (HIGH confidence)
- [XRPL Cryptographic Keys](https://xrpl.org/docs/concepts/accounts/cryptographic-keys) -- Ed25519 0xED prefix (HIGH confidence)
- [XRPL Reserves](https://xrpl.org/docs/concepts/accounts/reserves) -- base 1 XRP, owner 0.2 XRP (HIGH confidence)
- [xrpl npm package](https://www.npmjs.com/package/xrpl) -- v4.6.0, TypeScript SDK (HIGH confidence)
- [xrpl.js Wallet class](https://js.xrpl.org/classes/Wallet.html) -- Ed25519 default algorithm (HIGH confidence)
- [ripple-keypairs](https://github.com/XRPLF/xrpl.js/tree/main/packages/ripple-keypairs) -- deriveAddress() (HIGH confidence)
- Existing codebase: `adapter-pool.ts`, `keystore.ts`, `stage5-execute.ts`, `network-map.ts`, `networks.ts` (verified by reading)
