---
phase: 372-마켓-조회-포지션-정산
plan: "01"
title: "PolymarketGammaClient + MarketData"
one_liner: "Gamma API HTTP client with Zod parsing and 30s TTL caching service with stale-on-error fallback"
subsystem: polymarket
tags: [gamma-api, market-data, cache, zod, neg-risk]
dependency_graph:
  requires: [config.ts, PM_API_URLS, PM_DEFAULTS, PM_ERRORS, ChainError]
  provides: [PolymarketGammaClient, PolymarketMarketData, GammaMarketSchema, GammaEventSchema, MarketFilterSchema, isNegRisk resolver]
  affects: [order-provider.ts (NegRiskResolver), infrastructure.ts (factory wiring)]
tech_stack:
  added: []
  patterns: [stale-on-error cache, Zod SSoT response parsing, fetch+AbortSignal timeout]
key_files:
  created:
    - packages/actions/src/providers/polymarket/market-schemas.ts
    - packages/actions/src/providers/polymarket/gamma-client.ts
    - packages/actions/src/providers/polymarket/market-data.ts
    - packages/actions/src/providers/polymarket/__tests__/gamma-client.test.ts
    - packages/actions/src/providers/polymarket/__tests__/market-data.test.ts
  modified:
    - packages/actions/src/providers/polymarket/index.ts
decisions:
  - "Zod .passthrough() on GammaMarketSchema/GammaEventSchema to tolerate undocumented fields from Gamma API"
  - "Resolution detection via closed=true + winner=true token (or price=1 fallback)"
metrics:
  duration: ~5min
  completed: 2026-03-11
---

# Phase 372 Plan 01: PolymarketGammaClient + MarketData Summary

Gamma API HTTP client with Zod parsing and 30s TTL caching service with stale-on-error fallback.

## What Was Built

### 1. Market Zod Schemas (market-schemas.ts)
- `GammaMarketSchema`: condition_id, question, tokens[{token_id, outcome, price, winner}], neg_risk, volume, end_date_iso, etc.
- `GammaEventSchema`: id, title, slug, nested markets[], neg_risk
- `MarketFilterSchema`: active, closed, category, limit, offset, order, ascending
- All types derived via `z.infer<>` (Zod SSoT)

### 2. PolymarketGammaClient (gamma-client.ts)
- `getMarkets(filter?)`: GET /markets with query params, returns `GammaMarket[]`
- `getMarket(conditionId)`: GET /markets/{conditionId}, returns `GammaMarket`
- `getEvents(filter?)`: GET /events, returns `GammaEvent[]`
- `searchMarkets(query, limit?)`: GET /markets?_q={query}, returns `GammaMarket[]`
- Native fetch with `AbortSignal.timeout(PM_DEFAULTS.REQUEST_TIMEOUT_MS)`
- All responses parsed through Zod schemas
- Errors wrapped in `ChainError('ACTION_API_ERROR', 'POLYMARKET', ...)`

### 3. PolymarketMarketData (market-data.ts)
- In-memory Map-based cache with configurable TTL (default 30s)
- Stale-on-error: expired cache returned when Gamma API fails
- `isNegRisk(conditionId)`: satisfies `NegRiskResolver` interface for OrderProvider
- `getResolutionStatus(conditionId)`: detects closed markets + winning outcome
- `searchMarkets()`: no cache, direct passthrough to GammaClient
- `clearCache()`: for testing

### 4. Index Re-exports
- All schemas, types, GammaClient, MarketData exported from index.ts

## Test Results

| Suite | Tests | Status |
|-------|-------|--------|
| gamma-client.test.ts | 12 | PASS |
| market-data.test.ts | 13 | PASS |
| **Total** | **25** | **PASS** |

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 3c938861 | GammaClient + market Zod schemas |
| 2 | ee417cc9 | MarketData caching service + index exports |

## Deviations from Plan

None - plan executed exactly as written.
