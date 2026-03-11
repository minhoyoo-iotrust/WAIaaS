---
phase: 370-설계-및-리서치
plan: 01
subsystem: design
tags: [polymarket, eip-712, clob, ctf, prediction-market, polygon]

# Dependency graph
requires:
  - phase: none
    provides: first phase, no dependencies
provides:
  - "Design document 80: Polymarket prediction market integration (12 sections, 1345 lines)"
  - "EIP-712 3-domain signing architecture (ClobAuth, CTF Exchange, Neg Risk)"
  - "Hyperliquid comparison matrix with shared abstraction scope decision"
  - "Dual provider architecture design (PolymarketOrderProvider + PolymarketCtfProvider)"
  - "DB migration v53-v54 schema design (3 tables)"
  - "REST API 9 routes + MCP 18 tools + SDK PolymarketClient design"
affects: [371-CLOB-주문-구현, 372-마켓-조회-포지션-정산, 373-인터페이스-통합, 374-테스트-검증]

# Tech tracking
tech-stack:
  added: []
  patterns: [dual-provider-architecture, eip-712-direct-struct-signing, hmac-l2-auth, lazy-api-key-creation]

key-files:
  created:
    - internal/design/80-polymarket-prediction-market.md

key-decisions:
  - "DS-01: Direct struct EIP-712 signing (no phantom agent like Hyperliquid)"
  - "DS-02: signatureType=0 (EOA) as default, proxy wallet only if CLOB rejects EOA"
  - "DS-03: No code-level shared abstraction with Hyperliquid, pattern-level reuse only"
  - "DS-04: Auto USDC approve (type(uint256).max) on first order, configurable via Admin Settings"
  - "DS-05: Dual provider (Order + CTF) to separate requiresSigningKey semantics"
  - "DS-06: DB schema based on hyperliquid_orders pattern with Polymarket-specific columns"

patterns-established:
  - "Dual provider: CLOB off-chain (ApiDirectResult) + CTF on-chain (ContractCallRequest)"
  - "3-domain EIP-712: ClobAuth (API key) + CTF Exchange (binary) + Neg Risk Exchange (multi-outcome)"
  - "Neg Risk routing: Gamma API neg_risk flag determines exchange contract and signing domain"

requirements-completed: [DSGN-01, DSGN-02, DSGN-03, DSGN-04]

# Metrics
duration: 6min
completed: 2026-03-11
---

# Phase 370 Plan 01: Polymarket Design Doc 80 Summary

**Polymarket CLOB/CTF hybrid architecture design with EIP-712 3-domain signing, dual provider architecture, and Hyperliquid pattern comparison -- 12 sections, 1345 lines**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-10T15:37:01Z
- **Completed:** 2026-03-10T15:43:01Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Complete design document (doc 80) with 12 sections covering architecture, CLOB auth, EIP-712 signing, Hyperliquid comparison, Neg Risk routing, dual providers, DB migration, REST/MCP/SDK, Admin UI, policy engine, and test strategy
- EIP-712 3-domain signing architecture fully specified with TypeScript code examples (PolymarketSigner class)
- Hyperliquid comparison matrix: identified pattern-level reuse (7 items) vs code-level differences (5 items), decision to not share code
- 6 design decisions documented for all Phase 371-374 implementation guidance

## Task Commits

Each task was committed atomically:

1. **Task 1: Polymarket research + design doc sections 1-6** - `b57efe49` (docs)
2. **Task 2: Implementation design sections 7-12** - `b57efe49` (same commit, full doc written atomically)

## Files Created/Modified
- `internal/design/80-polymarket-prediction-market.md` - Polymarket prediction market integration design document (12 sections, 1345 lines)

## Decisions Made
- DS-01: Direct struct EIP-712 signing -- Polymarket uses simpler direct struct signing, no phantom agent indirection like Hyperliquid
- DS-02: EOA signatureType=0 as default -- Proxy wallet only if CLOB API rejects EOA, verified at first mainnet smoke test
- DS-03: No shared abstraction with Hyperliquid -- signing/auth/API fundamentally different, pattern-level reuse only
- DS-04: Auto USDC approve on first order -- type(uint256).max for DX, configurable via Admin Settings
- DS-05: Dual provider architecture -- Order provider (requiresSigningKey: true, ApiDirectResult) + CTF provider (requiresSigningKey: false, ContractCallRequest)
- DS-06: DB schema follows hyperliquid_orders pattern -- 3 new tables (polymarket_orders, polymarket_positions, polymarket_api_keys) in v53-v54

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Design doc 80 provides complete implementation guide for Phase 371-374
- All EIP-712 type definitions, contract addresses, API endpoints documented at code level
- DB schema, REST routes, MCP tools, Admin UI structure fully specified
- Known risks documented with mitigation strategies (no testnet CLOB, EOA acceptance TBD)

---
*Phase: 370-설계-및-리서치*
*Completed: 2026-03-11*
