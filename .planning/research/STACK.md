# Technology Stack

**Project:** XRPL DEX Action Provider
**Researched:** 2026-04-04

## Core Finding: No New Dependencies Needed

XRPL DEX is a **protocol-level orderbook** -- not a smart contract protocol. All DEX operations (OfferCreate, OfferCancel, book_offers, account_offers) are native XRPL transaction types and RPC methods already fully supported by the installed `xrpl` package. No external API, SDK, or additional library is required.

**Confidence: HIGH** -- verified against installed `xrpl@4.6.0` source code in `packages/adapters/ripple/node_modules/xrpl/`.

## Existing Stack (No Changes)

### Core Library
| Technology | Version | Purpose | Status |
|------------|---------|---------|--------|
| xrpl | 4.6.0 | XRPL WebSocket client, transaction types, RPC methods | Already installed in @waiaas/adapter-ripple |
| ripple-keypairs | 2.0.0 | Key derivation (already used by adapter) | Already installed |

### xrpl.js Types Available for DEX

All of the following are exported from `xrpl` and ready to import -- verified in installed source:

#### Transaction Types (from `xrpl/src/models/transactions/`)

```typescript
import type { OfferCreate, OfferCancel } from 'xrpl';
```

**OfferCreate** (`xrpl/src/models/transactions/offerCreate.ts`):
```typescript
interface OfferCreate extends BaseTransaction {
  TransactionType: 'OfferCreate';
  Flags?: number | OfferCreateFlagsInterface;
  Expiration?: number;        // Ripple Epoch seconds
  OfferSequence?: number;     // Replace existing offer
  TakerGets: Amount;          // What creator provides
  TakerPays: Amount;          // What creator receives
  DomainID?: string;          // Permissioned domain (v4.6+)
}
```

**OfferCancel** (`xrpl/src/models/transactions/offerCancel.ts`):
```typescript
interface OfferCancel extends BaseTransaction {
  TransactionType: 'OfferCancel';
  OfferSequence: number;      // Sequence of offer to cancel
}
```

#### Transaction Flags (from `xrpl/src/models/transactions/offerCreate.ts`)

```typescript
import { OfferCreateFlags } from 'xrpl';
```

| Flag | Hex Value | Purpose | Use Case |
|------|-----------|---------|----------|
| `tfPassive` | 0x00010000 | Don't consume matching offers, sit in book | Maker orders |
| `tfImmediateOrCancel` | 0x00020000 | Fill what you can, cancel rest immediately | **Swap (instant execution)** |
| `tfFillOrKill` | 0x00040000 | Fill entire amount or cancel entirely | Exact-amount swaps |
| `tfSell` | 0x00080000 | Exchange entire TakerGets even if overpaying | Sell-side orders |
| `tfHybrid` | 0x00100000 | Part of domain + open orderbook (v4.6+) | Not needed |

**For WAIaaS DEX swap**: Use `tfImmediateOrCancel` because it matches the "swap" mental model -- execute what's available immediately, don't leave residual orders that the AI agent would need to track.

**For WAIaaS DEX limit_order**: Use no flags (default) or `tfPassive` depending on maker intent. Default OfferCreate without IOC/FOK naturally becomes a limit order on the book.

#### Amount Type (from `xrpl/src/models/common/`)

```typescript
// XRP native: string in drops
type Amount = IssuedCurrencyAmount | string;

// IOU token: object with currency/issuer/value
interface IssuedCurrencyAmount {
  currency: string;   // 3-char ISO or 40-char hex
  issuer: string;     // Issuer r-address
  value: string;      // Decimal string (up to 15 sig digits)
}
```

**Critical distinction for DEX**:
- XRP amounts are **strings in drops** (e.g., `"50000000"` = 50 XRP)
- IOU amounts are **objects** with currency/issuer/value
- Both TakerGets and TakerPays use the same `Amount` type
- The adapter already has `xrpToDrops()` and `smallestUnitToIou()` helpers

#### RPC Methods (from `xrpl/src/models/methods/`)

```typescript
import type {
  BookOffersRequest, BookOffersResponse, BookOffer,
  AccountOffersRequest, AccountOffersResponse, AccountOffer,
} from 'xrpl';
```

**book_offers** -- Orderbook depth query:
```typescript
interface BookOffersRequest {
  command: 'book_offers';
  taker_gets: BookOfferCurrency;  // { currency, issuer? }
  taker_pays: BookOfferCurrency;  // { currency, issuer? }
  limit?: number;                 // Max offers to return
  taker?: string;                 // Perspective account
}

interface BookOffer extends Offer {
  owner_funds?: string;           // Available balance of maker
  taker_gets_funded?: Amount;     // Max gettable given funding
  taker_pays_funded?: Amount;     // Max payable given funding
  quality?: string;               // Price ratio (pays/gets)
}
```

**account_offers** -- My active orders:
```typescript
interface AccountOffersRequest {
  command: 'account_offers';
  account: string;
  limit?: number;                 // 10-400 range
  marker?: unknown;               // Pagination cursor
}

interface AccountOffer {
  flags: number;
  seq: number;                    // Offer Sequence (use for cancel)
  taker_gets: Amount;
  taker_pays: Amount;
  quality: string;
  expiration?: number;
}
```

#### Ledger Object (from `xrpl/src/models/ledger/Offer.ts`)

```typescript
interface Offer {
  LedgerEntryType: 'Offer';
  Account: string;
  Sequence: number;
  TakerPays: Amount;              // Remaining requested amount
  TakerGets: Amount;              // Remaining offered amount
  BookDirectory: string;
  Expiration?: number;
}

enum OfferFlags {
  lsfPassive = 0x00010000,
  lsfSell = 0x00020000,
  lsfHybrid = 0x00040000,
}
```

## Integration with Existing RippleAdapter

### What Already Works

The existing `RippleAdapter` in `packages/adapters/ripple/src/adapter.ts` provides:

1. **WebSocket Client management** -- `connect()`, `disconnect()`, `getClient()` with connection state
2. **autofill()** -- Automatically populates `Sequence`, `Fee`, `LastLedgerSequence`
3. **Fee safety margin** -- `(baseFee * 120n) / 100n` pattern
4. **Sign + Submit pipeline** -- `signTransaction()` uses `Wallet.fromEntropy()` with Ed25519, `submitTransaction()` handles tx_blob
5. **Confirmation polling** -- `waitForConfirmation()` with validated ledger check
6. **Error mapping** -- `mapError()` classifies xrpl.js errors to ChainError types
7. **Amount utilities** -- `xrpToDrops()`, `dropsToXrp()`, `smallestUnitToIou()`, `iouToSmallestUnit()`, `parseTrustLineToken()`

### What Needs Extension

The XrplDexProvider will use the adapter's existing `Client` instance (via `AdapterPool`) for RPC queries (`book_offers`, `account_offers`), and construct `OfferCreate`/`OfferCancel` transactions that flow through the existing pipeline.

**Key pattern decision**: Since XRPL DEX uses native transaction types (not contract calls), the provider's `resolve()` must return a `ContractCallRequest` that maps to the pipeline's `CONTRACT_CALL` type. The existing adapter's `buildContractCall()` currently throws -- it needs to be extended to handle `OfferCreate`/`OfferCancel` transaction JSON passed via `ContractCallRequest.data`.

Alternative: Use the `signExternalTransaction()` path, but this bypasses policy evaluation. The `ContractCallRequest` approach is preferred because it integrates with the full 6-stage pipeline (policy checks, delay, approval).

### tx-parser.ts Extension

The existing `parseRippleTransaction()` handles `Payment` and `TrustSet` types. It needs to be extended with `OfferCreate` and `OfferCancel` cases for sign-only parsing and transaction display.

## What NOT to Add

| Candidate | Why Not |
|-----------|---------|
| Any DEX aggregator SDK | XRPL DEX is the native orderbook -- no aggregation layer exists or is needed |
| AMM libraries | Excluded from scope (m33-10), XRPL AMM is a separate transaction type |
| Price feed oracle | Orderbook itself IS the price discovery mechanism |
| WebSocket subscription library | xrpl.js Client already supports `subscribe` for order updates |
| Additional RPC client | xrpl.js Client handles all needed RPC methods |
| ripple-lib (deprecated) | Replaced by xrpl.js v4.x, already using correct package |

## Version Compatibility

| Package | Installed | Required | Notes |
|---------|-----------|----------|-------|
| xrpl | 4.6.0 | >=4.0.0 | OfferCreate/OfferCancel types available since v2.x, fully typed in v4.x |
| ripple-keypairs | 2.0.0 | >=2.0.0 | No change needed |
| @waiaas/core | workspace:* | No change | ContractCallRequest already supports the needed return pattern |
| @waiaas/adapter-ripple | workspace:* | Minor extension | buildContractCall() needs OfferCreate/OfferCancel support |

## Installation

```bash
# No new packages needed. Zero dependency additions.
# All required types and APIs are in the existing xrpl@4.6.0 package.
```

## New Imports Required (in XrplDexProvider)

```typescript
// Transaction types
import type { OfferCreate, OfferCancel } from 'xrpl';
import { OfferCreateFlags } from 'xrpl';

// RPC response types
import type {
  BookOffersRequest,
  BookOffersResponse,
  BookOffer,
  AccountOffersRequest,
  AccountOffersResponse,
  AccountOffer,
  BookOfferCurrency,
} from 'xrpl';

// Amount types (already used by adapter)
import type { Amount, IssuedCurrencyAmount } from 'xrpl';

// Existing adapter utilities
import {
  xrpToDrops,
  dropsToXrp,
  XRP_DECIMALS,
  parseTrustLineToken,
  smallestUnitToIou,
  iouToSmallestUnit,
  IOU_DECIMALS,
} from '@waiaas/adapter-ripple';
```

## Sources

- **xrpl@4.6.0 source code** (installed, verified): `packages/adapters/ripple/node_modules/xrpl/src/models/` -- HIGH confidence
  - `transactions/offerCreate.ts` -- OfferCreate interface + OfferCreateFlags enum
  - `transactions/offerCancel.ts` -- OfferCancel interface
  - `methods/bookOffers.ts` -- BookOffersRequest/Response + BookOffer
  - `methods/accountOffers.ts` -- AccountOffersRequest/Response + AccountOffer
  - `ledger/Offer.ts` -- Offer ledger entry + OfferFlags
  - `common/index.ts` -- Amount = IssuedCurrencyAmount | string
- **RippleAdapter source** (verified): `packages/adapters/ripple/src/adapter.ts` -- existing autofill/sign/submit pipeline
- **currency-utils.ts** (verified): IOU_DECIMALS=15, iouToSmallestUnit/smallestUnitToIou conversion utilities
