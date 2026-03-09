---
phase: 366-testnet-transfer-scenarios
plan: 01
subsystem: testing
tags: [agent-uat, testnet, transfer, eth, sol, erc20, spl, hyperliquid, nft, incoming-tx]

requires:
  - phase: 365-agent-uat-format
    provides: scenario template format, _index.md, wallet-crud reference
provides:
  - 7 testnet scenarios (ETH/SOL/ERC-20/SPL/Hyperliquid/NFT/IncomingTX)
  - Self-transfer pattern for all on-chain scenarios
  - Testnet coverage for both EVM (Sepolia) and Solana (Devnet) chains
affects: [366-02, 367, 369]

tech-stack:
  added: []
  patterns: [self-transfer pattern for fund safety, dry-run before execution]

key-files:
  created:
    - agent-uat/testnet/eth-transfer.md
    - agent-uat/testnet/sol-transfer.md
    - agent-uat/testnet/erc20-transfer.md
    - agent-uat/testnet/spl-transfer.md
    - agent-uat/testnet/hyperliquid-spot-perp.md
    - agent-uat/testnet/nft-transfer.md
    - agent-uat/testnet/incoming-tx.md
  modified: []

key-decisions:
  - "Hyperliquid Spot/Perp uses far-from-market limit prices ($1000 ETH) to prevent accidental fills"
  - "NFT scenario includes optional ERC-1155 step (Step 7) for coverage without mandating ERC-1155 ownership"
  - "Incoming TX scenario uses self-transfer as trigger since external transfers are impractical in automated testing"

patterns-established:
  - "Self-transfer pattern: to=own address minimizes fund loss to gas fees only"
  - "5-step flow: balance check -> dry-run -> execute -> tx status -> re-check balance"

requirements-completed: [TEST-01, TEST-02, TEST-03, TEST-04, TEST-05, TEST-06, TEST-07]

duration: 3min
completed: 2026-03-09
---

# Phase 366 Plan 01: Testnet Scenarios Summary

**7 testnet scenarios covering ETH/SOL/ERC-20/SPL transfers, Hyperliquid Spot/Perp orders, NFT transfers, and incoming TX detection on Sepolia+Devnet**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-09T14:18:58Z
- **Completed:** 2026-03-09T14:22:00Z
- **Tasks:** 2
- **Files created:** 7

## Accomplishments
- Created 4 basic transfer scenarios (ETH, SOL, ERC-20, SPL) with self-transfer pattern
- Created Hyperliquid testnet Spot/Perp order create/cancel scenario with safety guards
- Created NFT transfer scenario with ERC-721 primary + ERC-1155 optional coverage
- Created incoming transaction detection scenario covering both Sepolia and Devnet

## Task Commits

Each task was committed atomically:

1. **Task 1: Testnet transfer scenarios (ETH/SOL/ERC-20/SPL)** - `0200bddd` (feat)
2. **Task 2: Advanced testnet scenarios (Hyperliquid/NFT/IncomingTX)** - `55eb88c8` (feat)

## Files Created/Modified
- `agent-uat/testnet/eth-transfer.md` - Sepolia ETH self-transfer scenario (testnet-02)
- `agent-uat/testnet/sol-transfer.md` - Devnet SOL self-transfer scenario (testnet-03)
- `agent-uat/testnet/erc20-transfer.md` - Sepolia ERC-20 token transfer scenario (testnet-04)
- `agent-uat/testnet/spl-transfer.md` - Devnet SPL token transfer scenario (testnet-05)
- `agent-uat/testnet/hyperliquid-spot-perp.md` - Hyperliquid testnet Spot/Perp order scenario (testnet-06)
- `agent-uat/testnet/nft-transfer.md` - Sepolia NFT transfer scenario (testnet-07)
- `agent-uat/testnet/incoming-tx.md` - Incoming TX detection scenario (testnet-08)

## Decisions Made
- Hyperliquid orders use far-from-market limit prices ($1000 ETH buy) to prevent accidental fills on testnet
- NFT scenario Step 7 (ERC-1155) is optional to accommodate users without ERC-1155 tokens
- Incoming TX scenario uses self-transfer as trigger since external transfers require coordination

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 7 testnet scenarios complete, ready for Plan 366-02 (6 mainnet scenarios + _index.md update)
- All scenarios follow template format with 6 mandatory sections

---
*Phase: 366-testnet-transfer-scenarios*
*Completed: 2026-03-09*
