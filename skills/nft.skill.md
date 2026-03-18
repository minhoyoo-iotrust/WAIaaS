---
name: "WAIaaS NFT Operations"
description: "NFT query, transfer, and approval operations for ERC-721, ERC-1155, and Metaplex standards"
category: "api"
tags: [wallet, blockchain, nft, erc721, erc1155, metaplex, solana, ethereum, waiass]
version: "2.10.0-rc"
dispatch:
  kind: "tool"
  allowedCommands: ["curl"]
---

# WAIaaS NFT Operations

Complete reference for NFT query, transfer, and approval operations. Supports ERC-721 (EVM), ERC-1155 (EVM), and Metaplex (Solana) standards. All endpoints use base URL `http://localhost:3100`.

> AI agents must NEVER request the master password. Use only your session token.

## 1. Overview

### Supported Standards

| Standard | Chain | Description |
|----------|-------|-------------|
| ERC-721 | EVM (Ethereum, Polygon, etc.) | Unique non-fungible tokens |
| ERC-1155 | EVM | Multi-token standard (fungible + non-fungible) |
| Metaplex | Solana | Solana NFT standard via SPL tokens |

### Prerequisites

- **NFT Query**: Requires NFT indexer API key configured in Admin Settings:
  - **Alchemy** (`alchemy_nft`) for EVM chains
  - **Helius** (`helius`) for Solana
- **NFT Transfer**: Works without indexer (direct on-chain transaction)
- **NFT Approval**: Works without indexer (direct on-chain transaction)

## 2. NFT Query (sessionAuth)

### GET /v1/wallet/nfts -- List NFTs

List NFTs owned by the wallet on a specific network.

```bash
curl -s 'http://localhost:3100/v1/wallet/nfts?network=ethereum-mainnet&limit=20' \
  -H 'Authorization: Bearer wai_sess_eyJ...'
```

Query parameters:
- `network` (required): Network identifier (e.g., `ethereum-mainnet`, `solana-mainnet`)
- `cursor` (optional): Pagination cursor from previous response
- `limit` (optional): Max NFTs per page (default: 20)
- `groupBy` (optional): `collection` to group NFTs by collection
- `walletId` (optional): Target wallet ID for multi-wallet sessions

Response (200):
```json
{
  "nfts": [
    {
      "tokenId": "42",
      "contractAddress": "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D",
      "standard": "erc721",
      "name": "Bored Ape #42",
      "image": "https://ipfs.io/ipfs/Qm...",
      "description": "A Bored Ape",
      "amount": "1",
      "collection": { "name": "BAYC", "address": "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D" },
      "assetId": "eip155:1/erc721:0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d-42"
    }
  ],
  "cursor": "next-page-token",
  "hasMore": true
}
```

### GET /v1/wallet/nfts/{tokenIdentifier} -- NFT Metadata

Get detailed metadata for a specific NFT.

**tokenIdentifier format:**
- EVM: `{contractAddress}:{tokenId}` (e.g., `0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D:42`)
- Solana: `{mintAddress}` (e.g., `DRtXHDgC312wNSSm5HN38sHF2bBN3dV2Y8oVb4xjGJT`)

```bash
curl -s 'http://localhost:3100/v1/wallet/nfts/0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D:42?network=ethereum-mainnet' \
  -H 'Authorization: Bearer wai_sess_eyJ...'
```

Query parameters:
- `network` (required): Network identifier

Response includes:
- `name`, `image`, `description`
- `attributes`: Array of `{ traitType, value }` trait pairs
- `metadata`: Full raw metadata object
- `assetId`: CAIP-19 identifier

Note: Metadata is cached in the database with a 24-hour TTL.

### Admin NFT Query

Operators can query any wallet's NFTs via `GET /v1/wallets/{id}/nfts` -- see docs/admin-manual/wallet-management.md.

## 3. NFT Transfer (sessionAuth)

### POST /v1/transactions/send (type: NFT_TRANSFER)

Transfer an NFT to a recipient address. Default tier: **APPROVAL** (owner must approve unless overridden via settings).

```bash
curl -s -X POST http://localhost:3100/v1/transactions/send \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -d '{
    "type": "NFT_TRANSFER",
    "to": "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD16",
    "token": {
      "address": "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D",
      "tokenId": "42",
      "standard": "erc721"
    },
    "network": "ethereum-mainnet"
  }'
```

Parameters:
- `type` (required): `"NFT_TRANSFER"`
- `to` (required): Recipient address
- `token` (required): NFT token info
  - `address` (required): Contract address (EVM) or mint address (Solana)
  - `tokenId` (required): Token ID within the contract. Use `"0"` for Solana Metaplex.
  - `standard` (required): `"erc721"`, `"erc1155"`, or `"metaplex"`
- `network` (required): Target network
- `amount` (optional): Amount to transfer (default: `"1"`). Relevant for ERC-1155 multi-copy NFTs.
- `walletId` (optional): Target wallet ID for multi-wallet sessions

#### ERC-1155 Multi-Copy Example

```bash
curl -s -X POST http://localhost:3100/v1/transactions/send \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -d '{
    "type": "NFT_TRANSFER",
    "to": "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD16",
    "token": {
      "address": "0x76BE3b62873462d2142405439777e971754E8E77",
      "tokenId": "5",
      "standard": "erc1155"
    },
    "network": "polygon-mainnet",
    "amount": "3"
  }'
```

#### Metaplex (Solana) Example

```bash
curl -s -X POST http://localhost:3100/v1/transactions/send \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -d '{
    "type": "NFT_TRANSFER",
    "to": "9aE476sH92Vz7DMPyq5WLPkrKWivxeuTKEFKd2sZZcde",
    "token": {
      "address": "DRtXHDgC312wNSSm5HN38sHF2bBN3dV2Y8oVb4xjGJT",
      "tokenId": "0",
      "standard": "metaplex"
    },
    "network": "solana-mainnet"
  }'
```

### Policies

- **RATE_LIMIT**: `nft_count` counter limits NFT transfers per period
- **CONTRACT_WHITELIST**: NFT contract must be whitelisted when policy is configured

## 4. NFT Approvals (sessionAuth)

### POST /v1/transactions/send (type: APPROVE with nft field)

Approve a spender for NFT operations.

#### Single NFT Approve (amount: "0")

```bash
curl -s -X POST http://localhost:3100/v1/transactions/send \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -d '{
    "type": "APPROVE",
    "to": "0xMarketplaceAddress",
    "token": { "address": "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D" },
    "nft": { "tokenId": "42", "standard": "erc721" },
    "network": "ethereum-mainnet",
    "amount": "0"
  }'
```

#### Collection-Wide Approve (amount != "0")

Triggers `setApprovalForAll` (ERC-721/1155) or `delegate` (Solana):

```bash
curl -s -X POST http://localhost:3100/v1/transactions/send \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -d '{
    "type": "APPROVE",
    "to": "0xMarketplaceAddress",
    "token": { "address": "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D" },
    "nft": { "tokenId": "0", "standard": "erc721" },
    "network": "ethereum-mainnet",
    "amount": "1"
  }'
```

### GET /v1/wallet/nfts/{tokenIdentifier}/approvals -- Query Approvals

```bash
curl -s 'http://localhost:3100/v1/wallet/nfts/0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D:42/approvals?network=ethereum-mainnet' \
  -H 'Authorization: Bearer wai_sess_eyJ...'
```

Query parameters:
- `network` (required): Network identifier
- `operator` (optional): Filter by specific operator address

## 5. MCP Tools

### list_nfts

List NFTs owned by the wallet.

Parameters:
- `network` (required): Network identifier
- `cursor` (optional): Pagination cursor
- `limit` (optional): Max NFTs per page
- `group_by` (optional): `"collection"`
- `wallet_id` (optional): Target wallet ID

### get_nft_metadata

Get detailed metadata for a specific NFT.

Parameters:
- `token_identifier` (required): EVM: `contractAddress:tokenId`, Solana: `mintAddress`
- `network` (required): Network identifier
- `wallet_id` (optional): Target wallet ID

### transfer_nft

Transfer an NFT to a recipient.

Parameters:
- `to` (required): Recipient address
- `token_address` (required): NFT contract/mint address
- `token_id` (required): Token ID (`"0"` for Solana Metaplex)
- `standard` (required): `"erc721"`, `"erc1155"`, or `"metaplex"`
- `network` (required): Network identifier
- `amount` (optional): Amount (default: `"1"`)
- `wallet_id` (optional): Target wallet ID

## 6. SDK Methods

### TypeScript

```typescript
// List NFTs
const nfts = await client.listNfts({
  network: 'ethereum-mainnet',
  limit: 20,
  groupBy: 'collection',
});

// Get NFT metadata
const metadata = await client.getNftMetadata('0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D:42', {
  network: 'ethereum-mainnet',
});

// Transfer NFT
const tx = await client.transferNft({
  to: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD16',
  token: {
    address: '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D',
    tokenId: '42',
    standard: 'erc721',
  },
  network: 'ethereum-mainnet',
});
```

## 7. Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `NFT_NOT_FOUND` | 404 | NFT not found at the specified address/tokenId |
| `INDEXER_NOT_CONFIGURED` | 400 | NFT indexer API key not set (query operations) |
| `UNSUPPORTED_NFT_STANDARD` | 400 | Unknown NFT standard (not erc721/erc1155/metaplex) |
| `INDEXER_API_ERROR` | 502 | Indexer API returned an error |
| `NFT_METADATA_FETCH_FAILED` | 502 | Failed to fetch NFT metadata from token URI |

## 8. Admin UI

The Admin UI wallet detail page includes an **NFTs** tab showing:
- Grid/list view toggle with image thumbnails
- NFT detail modal with metadata, attributes, and raw JSON
- Network selector to browse NFTs per network
- Empty state guidance when indexer is not configured

NFT indexer API keys can be configured in **Settings > NFT Indexer**.
