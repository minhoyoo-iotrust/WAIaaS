# Requirements: WAIaaS NFT Support (EVM + Solana)

**Defined:** 2026-03-06
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다

## v31.0 Requirements

Requirements for NFT support milestone. Each maps to roadmap phases.

### NFT Query (조회)

- [x] **NFTQ-01**: User can list NFTs owned by session wallet (`GET /v1/wallet/nfts`, sessionAuth)
- [x] **NFTQ-02**: Admin can list NFTs for any wallet (`GET /v1/wallets/{id}/nfts`, masterAuth)
- [x] **NFTQ-03**: NFT list includes tokenId, contractAddress/mintAddress, standard, name, image, description, amount, collection, assetId
- [x] **NFTQ-04**: NFT list supports cursor-based pagination
- [x] **NFTQ-05**: NFT list requires `network` query parameter
- [x] **NFTQ-06**: NFT list supports collection grouping (`?groupBy=collection`)
- [x] **NFTQ-07**: User can get individual NFT metadata (`GET /v1/wallet/nfts/{tokenIdentifier}`)
- [x] **NFTQ-08**: EVM metadata parsed from tokenURI with IPFS gateway auto-conversion
- [x] **NFTQ-09**: Solana metadata parsed from Metaplex JSON
- [x] **NFTQ-10**: Metadata cached in DB with 24h TTL (`nft_metadata_cache`)
- [x] **NFTQ-11**: Metadata includes attributes/traits array

### NFT Transfer (전송)

- [x] **NFTT-01**: NFT_TRANSFER type added to TransactionRequestSchema (6th discriminatedUnion type)
- [x] **NFTT-02**: EVM ERC-721 transfer via `safeTransferFrom(from, to, tokenId)`
- [x] **NFTT-03**: EVM ERC-1155 transfer via `safeTransferFrom(from, to, tokenId, amount, data)`
- [x] **NFTT-04**: Solana Metaplex transfer via SPL Token transfer instruction
- [x] **NFTT-05**: NFT_TRANSFER passes through 6-stage pipeline
- [x] **NFTT-06**: Smart Account (ERC-4337) compatible via `buildUserOpCalls()` NFT_TRANSFER conversion
- [x] **NFTT-07**: NFT_TRANSFER request body supports type/to/token/amount/network fields

### NFT Approval (승인)

- [x] **NFTA-01**: EVM `approve` for single NFT approval
- [x] **NFTA-02**: EVM `setApprovalForAll` for collection-wide approval
- [x] **NFTA-03**: Solana `delegate` for token delegation
- [x] **NFTA-04**: Existing APPROVE type extended with optional `nft` field (`{ tokenId, standard }`)
- [x] **NFTA-05**: Approval status query API (`GET /v1/wallet/nfts/{tokenIdentifier}/approvals`)

### Indexer (인덱서)

- [x] **INDX-01**: `INftIndexer` interface defined with `listNfts()`, `getNftMetadata()`, `getNftsByCollection()`
- [x] **INDX-02**: EVM indexer: Alchemy NFT API implementation
- [x] **INDX-03**: Solana indexer: Helius DAS API implementation
- [x] **INDX-04**: Indexer API keys stored in settings table (AES-256-GCM encrypted)
- [x] **INDX-05**: Graceful fallback when indexer not configured (transfer still works)
- [x] **INDX-06**: Indexer response caching with configurable TTL
- [x] **INDX-07**: Rate limit/retry with exponential backoff (max 3 retries, Retry-After)

### Chain Adapter (체인 어댑터)

- [x] **CHADP-01**: IChainAdapter extended with `transferNft()`, `approveNft()`, `buildNftTransferTx()`
- [x] **CHADP-02**: SolanaAdapter Metaplex NFT transfer implementation
- [x] **CHADP-03**: EvmAdapter ERC-721/ERC-1155 transfer implementation
- [x] **CHADP-04**: NFT standard auto-detection via ERC-165 `supportsInterface`

### Admin UI

- [ ] **ADUI-01**: Wallet detail page NFT tab with grid/list view
- [ ] **ADUI-02**: NFT image thumbnails with CSP `img-src` update (IPFS/Arweave gateways)
- [ ] **ADUI-03**: NFT detail modal showing metadata and attributes
- [ ] **ADUI-04**: Indexer settings UI in System Settings

### MCP + SDK

- [ ] **MCPSK-01**: MCP tools: `list_nfts`, `get_nft_metadata`, `transfer_nft`
- [ ] **MCPSK-02**: SDK methods: `listNfts()`, `getNftMetadata()`, `transferNft()`
- [ ] **MCPSK-03**: connect-info NFT summary (graceful omission when indexer not configured)

### Policy (정책)

- [x] **PLCY-01**: RATE_LIMIT applied to NFT_TRANSFER (count-based, separate `nft_count` counter)
- [x] **PLCY-02**: CONTRACT_WHITELIST restricts allowed NFT contracts
- [x] **PLCY-03**: NFT transfer default tier: APPROVAL

### CAIP-19

- [x] **CAIP-01**: NFT namespaces added: `erc721`, `erc1155`, `metaplex`
- [x] **CAIP-02**: `nftAssetId()` helper in `asset-helpers.ts`
- [x] **CAIP-03**: NFT responses include optional `assetId` field
- [x] **CAIP-04**: ALLOWED_TOKENS policy supports NFT CAIP-19 matching

### Skill Files (스킬)

- [x] **SKIL-01**: `skills/nft.skill.md` created with NFT query/transfer/approval docs
- [x] **SKIL-02**: `skills/wallet.skill.md` updated with NFT tab info
- [x] **SKIL-03**: `skills/transactions.skill.md` updated with NFT_TRANSFER type

### Error Codes (에러)

- [x] **ERRC-01**: `NFT_NOT_FOUND` (404)
- [x] **ERRC-02**: `INDEXER_NOT_CONFIGURED` (400)
- [x] **ERRC-03**: `UNSUPPORTED_NFT_STANDARD` (400)
- [x] **ERRC-04**: `INDEXER_API_ERROR` (502)
- [x] **ERRC-05**: `NFT_METADATA_FETCH_FAILED` (502)

### DB Migration (마이그레이션)

- [x] **DBMG-01**: v44 migration: `nft_metadata_cache` table
- [x] **DBMG-02**: Migration test: schema snapshot + data transformation

## Future Requirements

### NFT Marketplace Integration

- **MKTPL-01**: OpenSea listing/offer/purchase integration (EVM)
- **MKTPL-02**: Magic Eden listing/purchase integration (Solana)
- **MKTPL-03**: NFT price oracle for spending limit policies

### NFT Incoming Detection

- **INCNFT-01**: ERC-721 Transfer event detection in IncomingTxMonitor
- **INCNFT-02**: ERC-1155 TransferSingle/TransferBatch event detection
- **INCNFT-03**: incoming_transactions schema extension for NFT fields

## Out of Scope

| Feature | Reason |
|---------|--------|
| NFT marketplace integration (OpenSea, Magic Eden) | 기본 기능 안정화 우선, Action Provider 패턴으로 별도 마일스톤 |
| NFT incoming detection (IncomingTxMonitor) | incoming_transactions 스키마 확장 필요, 별도 마일스톤 |
| NFT price-based spending limits | 가격 오라클 부재, 마켓플레이스 연동 시 검토 |
| Admin UI에서 NFT 전송 | API/SDK/MCP를 통해서만 전송 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| NFTT-01 | Phase 333 | Complete |
| NFTT-07 | Phase 333 | Complete |
| NFTA-04 | Phase 333 | Complete |
| ERRC-01 | Phase 333 | Complete |
| ERRC-02 | Phase 333 | Complete |
| ERRC-03 | Phase 333 | Complete |
| ERRC-04 | Phase 333 | Complete |
| ERRC-05 | Phase 333 | Complete |
| DBMG-01 | Phase 333 | Complete |
| DBMG-02 | Phase 333 | Complete |
| CAIP-01 | Phase 333 | Complete |
| CAIP-02 | Phase 333 | Complete |
| CAIP-03 | Phase 333 | Complete |
| CAIP-04 | Phase 333 | Complete |
| INDX-01 | Phase 334 | Complete |
| INDX-02 | Phase 334 | Complete |
| INDX-03 | Phase 334 | Complete |
| INDX-04 | Phase 334 | Complete |
| INDX-05 | Phase 334 | Complete |
| INDX-06 | Phase 334 | Complete |
| INDX-07 | Phase 334 | Complete |
| CHADP-01 | Phase 334 | Complete |
| CHADP-02 | Phase 334 | Complete |
| CHADP-03 | Phase 334 | Complete |
| CHADP-04 | Phase 334 | Complete |
| NFTQ-01 | Phase 335 | Complete |
| NFTQ-02 | Phase 335 | Complete |
| NFTQ-03 | Phase 335 | Complete |
| NFTQ-04 | Phase 335 | Complete |
| NFTQ-05 | Phase 335 | Complete |
| NFTQ-06 | Phase 335 | Complete |
| NFTQ-07 | Phase 335 | Complete |
| NFTQ-08 | Phase 335 | Complete |
| NFTQ-09 | Phase 335 | Complete |
| NFTQ-10 | Phase 335 | Complete |
| NFTQ-11 | Phase 335 | Complete |
| NFTT-02 | Phase 336 | Complete |
| NFTT-03 | Phase 336 | Complete |
| NFTT-04 | Phase 336 | Complete |
| NFTT-05 | Phase 336 | Complete |
| NFTT-06 | Phase 336 | Complete |
| NFTA-01 | Phase 336 | Complete |
| NFTA-02 | Phase 336 | Complete |
| NFTA-03 | Phase 336 | Complete |
| NFTA-05 | Phase 336 | Complete |
| PLCY-01 | Phase 336 | Complete |
| PLCY-02 | Phase 336 | Complete |
| PLCY-03 | Phase 336 | Complete |
| MCPSK-01 | Phase 337 | Pending |
| MCPSK-02 | Phase 337 | Pending |
| MCPSK-03 | Phase 337 | Pending |
| ADUI-01 | Phase 337 | Pending |
| ADUI-02 | Phase 337 | Pending |
| ADUI-03 | Phase 337 | Pending |
| ADUI-04 | Phase 337 | Pending |
| SKIL-01 | Phase 337 | Complete |
| SKIL-02 | Phase 337 | Complete |
| SKIL-03 | Phase 337 | Complete |

**Coverage:**
- v31.0 requirements: 58 total
- Mapped to phases: 58
- Unmapped: 0
- Phase 333: 14 requirements (NFTT-01, NFTT-07, NFTA-04, ERRC-01~05, DBMG-01~02, CAIP-01~04)
- Phase 334: 11 requirements (INDX-01~07, CHADP-01~04)
- Phase 335: 11 requirements (NFTQ-01~11)
- Phase 336: 12 requirements (NFTT-02~06, NFTA-01~03, NFTA-05, PLCY-01~03)
- Phase 337: 10 requirements (MCPSK-01~03, ADUI-01~04, SKIL-01~03)

---
*Requirements defined: 2026-03-06*
*Last updated: 2026-03-06 after roadmap creation -- traceability populated*
