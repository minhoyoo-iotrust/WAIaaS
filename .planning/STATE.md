---
gsd_state_version: 1.0
milestone: v31.0
milestone_name: NFT 지원
status: completed
stopped_at: Phase 334 complete -- ready for Phase 335 (NFT Query API)
last_updated: "2026-03-06T02:44:31.620Z"
last_activity: 2026-03-06 -- Phase 334 complete (3 plans, 5 tasks, 48 tests)
progress:
  total_phases: 5
  completed_phases: 2
  total_plans: 5
  completed_plans: 5
  percent: 40
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-06)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** Phase 335 - NFT Query API

## Current Position

Phase: 3 of 5 (Phase 335: NFT Query API)
Plan: 0 of 2 in current phase
Status: Phase 334 complete, ready for Phase 335
Last activity: 2026-03-06 -- Phase 334 complete (3 plans, 5 tasks, 48 tests)

Progress: [████░░░░░░] 40%

## Performance Metrics

**Cumulative:** 85 milestones shipped, 334 phases completed, ~760 plans, ~2,183 reqs, ~6,870+ tests, ~266,814 LOC TS

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 333   | 01-02 | 8 min | 3 | 12 |
| 334   | 01-03 | 14 min | 5 | 19 |

## Accumulated Context

### Decisions

D1: NFT_TRANSFER is 6th discriminatedUnion type (not CONTRACT_CALL)
D2: Indexer dependency -- list needs indexer, transfer doesn't
D3: Metadata cached in DB nft_metadata_cache (24h TTL)
D4: CSP update for IPFS/Arweave gateways (direct reference, no proxy)
D6: APPROVE type extended with nft field for NFT approvals
D7: CAIP-19 NFT namespaces: erc721/erc1155/metaplex (WAIaaS extension)
D8: Smart Account compatible via buildUserOpCalls() NFT_TRANSFER conversion
D9: Dry-Run and Batch compatible (existing patterns apply)
D10: NftTokenInfoSchema separate from TokenInfoSchema (no decimals/symbol for NFTs)
D11: EVM NFT CAIP-19 uses address-tokenId hyphen separator in assetReference
D12: Metaplex uses mint address directly (unique per NFT, no tokenId needed)
D13: DB v44: nft_metadata_cache unique on (contract_address, token_id, chain, network)
D14: INftIndexer 3-method interface (listNfts, getNftMetadata, getNftsByCollection)
D15: AlchemyNftIndexer maps 10 EVM networks, HeliusNftIndexer uses DAS JSON-RPC
D16: NftIndexerClient: retry max 3 (1s/2s/4s), Retry-After respected, cache TTL 300s default
D17: IChainAdapter extended to 25 methods (+3 NFT: buildNftTransferTx, transferNft, approveNft)
D18: ERC-1155 single approval not supported, Solana collection-wide approval not supported
D19: Metaplex NFT transfer reuses SPL token transfer with decimals=0

### Blockers/Concerns

- C1: EIP-712 typehash 온체인 검증 필요 (Anvil fork 테스트 deferred, from v30.8)
- C2: SDK missing provider management methods (deferred)
- C3: ERC-8128 is Draft status -- spec may change

## Session Continuity

Last session: 2026-03-06
Stopped at: Phase 334 complete -- ready for Phase 335 (NFT Query API)
Resume file: None
