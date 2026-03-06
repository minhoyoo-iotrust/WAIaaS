---
phase: 333-nft-foundation
plan: 01
subsystem: api
tags: [zod, nft, erc721, erc1155, metaplex, discriminatedUnion, error-codes]

requires:
  - phase: none
    provides: first phase of v31.0
provides:
  - NFT_TRANSFER as 6th discriminatedUnion type in TransactionRequestSchema
  - NftStandardEnum (ERC-721/ERC-1155/METAPLEX)
  - NftTokenInfoSchema (address, tokenId, standard, assetId)
  - APPROVE schema nft extension for NFT approvals
  - 5 NFT error codes in NFT domain
  - NFT i18n messages (en/ko)
affects: [334-indexer-chain-adapter, 336-nft-transfer-pipeline, 337-interface-integration]

tech-stack:
  added: []
  patterns:
    - "NFT_TRANSFER 6th discriminatedUnion type with NftTokenInfoSchema"
    - "APPROVE nft optional field for ERC-20/NFT approval disambiguation"
    - "NFT error domain (5 codes: NFT_NOT_FOUND, INDEXER_NOT_CONFIGURED, UNSUPPORTED_NFT_STANDARD, INDEXER_API_ERROR, NFT_METADATA_FETCH_FAILED)"

key-files:
  created:
    - packages/core/src/__tests__/nft-schema.test.ts
  modified:
    - packages/core/src/enums/transaction.ts
    - packages/core/src/schemas/transaction.schema.ts
    - packages/core/src/errors/error-codes.ts
    - packages/core/src/schemas/index.ts
    - packages/core/src/index.ts
    - packages/core/src/i18n/en.ts
    - packages/core/src/i18n/ko.ts

key-decisions:
  - "NFT_TRANSFER placed after BATCH in enum (6th in union, SIGN/X402_PAYMENT not in union)"
  - "NftTokenInfoSchema separate from TokenInfoSchema (no decimals/symbol for NFTs)"
  - "APPROVE nft field is optional to maintain backward compatibility"
  - "NFT domain added as 15th ErrorDomain"

patterns-established:
  - "NFT standard enum values: ERC-721, ERC-1155, METAPLEX (hyphenated for EVM)"

requirements-completed: [NFTT-01, NFTT-07, NFTA-04, ERRC-01, ERRC-02, ERRC-03, ERRC-04, ERRC-05]

duration: 5min
completed: 2026-03-06
---

# Phase 333 Plan 01: NFT Schema + Error Codes Summary

**NFT_TRANSFER 6th discriminatedUnion type with NftTokenInfoSchema, APPROVE nft extension, and 5 NFT error codes across 15 domains**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-06T01:59:44Z
- **Completed:** 2026-03-06T02:05:00Z
- **Tasks:** 1
- **Files modified:** 12

## Accomplishments
- NFT_TRANSFER parses as 6th discriminatedUnion type with type/to/token/amount/network
- NftStandardEnum validates ERC-721/ERC-1155/METAPLEX, rejects ERC-20
- APPROVE schema accepts optional nft { tokenId, standard } for NFT approvals
- 5 NFT error codes defined with correct HTTP statuses (404, 400, 502)
- 10 unit tests covering all schema parsing and error code scenarios

## Task Commits

1. **Task 1: NFT_TRANSFER schema + APPROVE nft extension + NFT error codes** - `586fe54c` (feat)

## Files Created/Modified
- `packages/core/src/__tests__/nft-schema.test.ts` - 10 unit tests for NFT schema and error codes
- `packages/core/src/enums/transaction.ts` - Added NFT_TRANSFER to TRANSACTION_TYPES
- `packages/core/src/schemas/transaction.schema.ts` - NftStandardEnum, NftTokenInfoSchema, NftTransferRequestSchema, APPROVE nft extension
- `packages/core/src/errors/error-codes.ts` - 5 NFT error codes in NFT domain
- `packages/core/src/i18n/en.ts` - English NFT error messages
- `packages/core/src/i18n/ko.ts` - Korean NFT error messages

## Decisions Made
- NFT_TRANSFER placed after BATCH in enum array (before SIGN/X402_PAYMENT)
- NftTokenInfoSchema is separate from TokenInfoSchema (NFTs don't need decimals/symbol)
- APPROVE nft field is z.object({ tokenId, standard }).optional() for backward compatibility

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated hardcoded error code counts in existing tests**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** Existing tests (enums.test.ts, errors.test.ts, i18n.test.ts, package-exports.test.ts) had hardcoded counts (7 tx types, 123 error codes, 14 domains)
- **Fix:** Updated to 8 tx types, 128 error codes, 15 domains
- **Files modified:** 4 test files
- **Committed in:** 586fe54c

---

**Total deviations:** 1 auto-fixed (test count updates)
**Impact on plan:** Necessary for correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- NFT type system foundation complete for Phase 334 (Indexer + Chain Adapter)
- TransactionRequestSchema now accepts NFT_TRANSFER for pipeline integration (Phase 336)

---
*Phase: 333-nft-foundation*
*Completed: 2026-03-06*
