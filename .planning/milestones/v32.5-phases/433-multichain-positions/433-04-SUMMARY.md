---
phase: 433-multichain-positions
plan: 04
subsystem: actions/solana-providers
tags: [solana, dynamic-network, ctx-networks, hyperliquid-guard]
dependency_graph:
  requires: [PositionQueryContext]
  provides: [dynamic-solana-network-extraction]
  affects: [jito-staking, kamino, drift, position-tracker]
tech_stack:
  added: []
  patterns: [ctx.networks[0]-extraction]
key_files:
  created: []
  modified:
    - packages/actions/src/providers/jito-staking/index.ts
    - packages/actions/src/providers/kamino/index.ts
    - packages/actions/src/providers/drift/index.ts
    - packages/actions/src/__tests__/jito-staking.test.ts
    - packages/actions/src/__tests__/kamino-provider.test.ts
    - packages/actions/src/__tests__/drift-provider.test.ts
decisions:
  - "ctx.networks[0] with 'solana-mainnet' fallback for Solana single-network extraction"
  - "Jito uses networkToCaip2() for correct CAIP-2 per network"
  - "Hyperliquid chain guards already satisfied in Phase 432 (MCHN-09 verified)"
metrics:
  duration: 4min
  completed: 2026-03-16
---

# Phase 433 Plan 04: Solana Provider Dynamic Network + Hyperliquid Guard Summary

Jito/Kamino/Drift use ctx.networks[0] instead of hardcoded 'solana-mainnet', with Jito using networkToCaip2 for correct CAIP-2. Hyperliquid chain guards confirmed.

## Changes

### Jito (index.ts)
- `const network = ctx.networks[0] ?? 'solana-mainnet'` after chain guard
- `networkToCaip2(network)` for CAIP-2 identifier (was hardcoded Solana genesis hash)

### Kamino (index.ts)
- `const network = ctx.networks[0] ?? 'solana-mainnet'` after chain guard
- All `network: 'solana-mainnet'` in PositionUpdate replaced with dynamic `network`

### Drift (index.ts)
- Same pattern: dynamic network from ctx.networks[0]

### Tests
- Added MCHN-08 test to each provider: ctx.networks=['solana-devnet'] verifies network field

### Hyperliquid (MCHN-09)
- Verified existing chain guards: `if (ctx.chain !== 'ethereum') return []` in both perp and spot providers
- No code changes needed

## Deviations from Plan

None - plan executed exactly as written.

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Solana dynamic network + Hyperliquid verification | 8e3fadbe | 6 files |
