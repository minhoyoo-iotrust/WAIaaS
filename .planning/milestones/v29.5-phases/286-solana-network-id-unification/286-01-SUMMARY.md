---
plan: 286-01
title: "Core SSoT 상수 변경 + DB migration v29"
status: complete
started: "2026-02-28"
completed: "2026-02-28"
---

# Summary: 286-01 Core SSoT 상수 변경 + DB migration v29

## What Was Built

Renamed all Solana network SSoT constants from bare names (`mainnet`, `devnet`, `testnet`) to prefixed format (`solana-mainnet`, `solana-devnet`, `solana-testnet`) across the core package, and created DB migration v29 to transform existing data.

## Tasks Completed

1. **T1: Core SSoT constant renaming** - Updated `SOLANA_NETWORK_TYPES`, `NETWORK_TYPES`, `ENVIRONMENT_NETWORK_MAP`, `ENVIRONMENT_SINGLE_NETWORK`, and `MAINNET_NETWORKS` in `chain.ts`
2. **T2: CAIP/Explorer/RPC defaults** - Updated CAIP-2 bidirectional mapping, explorer URL keys, RPC default keys, and JSDoc examples in asset-helpers
3. **T3: DB migration v29** - 12-step table recreation for `transactions`, `policies`, `defi_positions` (CHECK constraints); simple UPDATE for `incoming_transactions`, `incoming_tx_cursors`, `token_registry`. `LATEST_SCHEMA_VERSION` bumped to 29.

## Commits

1. `feat(286-01): rename Solana network SSoT constants to solana-{network} format`
2. `feat(286-01): update CAIP mappings, explorer URLs, and RPC defaults for solana-{network}`
3. `feat(286-01): add DB migration v29 for Solana network ID renaming`

## Key Files

### key-files.created
- (none - all modifications)

### key-files.modified
- `packages/core/src/enums/chain.ts`
- `packages/core/src/caip/network-map.ts`
- `packages/core/src/caip/asset-helpers.ts`
- `packages/core/src/utils/explorer-url.ts`
- `packages/core/src/rpc/built-in-defaults.ts`
- `packages/daemon/src/infrastructure/database/migrate.ts`

## Self-Check: PASSED

- [x] SOLANA_NETWORK_TYPES = ['solana-mainnet', 'solana-devnet', 'solana-testnet']
- [x] NETWORK_TYPES has no legacy 'mainnet', 'devnet', 'testnet'
- [x] DB migration v29 handles 6 tables
- [x] LATEST_SCHEMA_VERSION === 29
- [x] CAIP-2, explorer URL, RPC defaults use solana-mainnet format
