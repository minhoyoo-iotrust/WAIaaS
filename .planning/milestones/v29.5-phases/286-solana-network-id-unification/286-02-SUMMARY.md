---
plan: 286-02
title: "인프라 레이어: adapter-pool, config, hot-reload, oracle, DeFi 프로바이더"
status: complete
started: "2026-02-28"
completed: "2026-02-28"
---

# Summary: 286-02 Infrastructure Layer Update

## What Was Built

Updated all infrastructure-layer components to use `solana-mainnet`/`solana-devnet`/`solana-testnet` network format while maintaining config.toml backward compatibility through bidirectional key mapping.

## Tasks Completed

1. **T1: adapter-pool bidirectional mapping** - `rpcConfigKey` strips `solana-` prefix (solana-mainnet -> solana_mainnet), `configKeyToNetwork` adds prefix (solana_mainnet -> solana-mainnet)
2. **T2: hot-reload, oracle, incoming-tx, Kamino** - Updated solanaNetworks Sets, networkToConfigKey, CoinGecko/Pyth feed mappings, EVM confirmation thresholds (fixed mainnet/sepolia -> ethereum-mainnet/ethereum-sepolia), Kamino provider network refs

## Commits

1. `feat(286-02): update infrastructure layer for solana-{network} format`

## Key Files

### key-files.modified
- `packages/daemon/src/infrastructure/adapter-pool.ts`
- `packages/daemon/src/infrastructure/settings/hot-reload.ts`
- `packages/daemon/src/infrastructure/oracle/coingecko-platform-ids.ts`
- `packages/daemon/src/infrastructure/oracle/price-cache.ts`
- `packages/daemon/src/infrastructure/oracle/pyth-feed-ids.ts`
- `packages/daemon/src/services/incoming/incoming-tx-workers.ts`
- `packages/actions/src/providers/kamino/index.ts`

## Self-Check: PASSED

- [x] rpcConfigKey('solana', 'solana-mainnet') produces 'solana_mainnet'
- [x] configKeyToNetwork('solana_mainnet') produces 'solana-mainnet'
- [x] hot-reload solanaNetworks uses solana-mainnet format
- [x] Kamino provider uses 'solana-mainnet'
- [x] Oracle feed mappings use solana-mainnet key
