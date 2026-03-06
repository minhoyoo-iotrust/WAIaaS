---
phase: 342-research-design
plan: 01
subsystem: defi
tags: [dcent, swap, aggregator, dex, exchange, caip-19, action-provider]

# Dependency graph
requires: []
provides:
  - "DCent Swap API 7-endpoint research with actual response structures"
  - "CAIP-19 <-> DCent Currency ID bidirectional conversion rules"
  - "DEX Swap pipeline mapping (BATCH[APPROVE, CONTRACT_CALL])"
  - "Exchange pipeline mapping (TRANSFER to payInAddress + status polling)"
  - "DcentSwapActionProvider interface design (4 actions)"
  - "MCP/SDK/policy/Admin Settings integration design"
  - "17 design decisions (DS-01 through DS-17)"
  - "Phase 345 scope reduction (DCent handles multi-hop internally)"
affects: [343-currency-mapping-dex-swap, 344-exchange-status-tracking, 345-auto-routing, 346-integration-testing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DCent Swap dual-flow pattern: DEX (txdata -> CONTRACT_CALL) vs Exchange (payInAddress -> TRANSFER)"
    - "Currency ID mapper pattern: CAIP-19 <-> DCent with hardcoded native + rule-based token conversion"

key-files:
  created:
    - "internal/design/77-dcent-swap-aggregator.md"
  modified: []

key-decisions:
  - "DS-01: Use swapbuy-beta.dcentwallet.com (includes Exchange providers, agent-swap has DEX only)"
  - "DS-02: Self-encode ERC-20 approve (DCent API partially unimplemented for some providers)"
  - "DS-03: Default to flexible exchange rate (fixed rate risks validUntil expiry during async approval)"
  - "DS-04: Phase 345 reduced to fallback-only (DCent providers handle multi-hop internally)"
  - "DS-07: Separate query methods from resolve() for informational actions (get_quotes, swap_status)"
  - "DS-08: DEX router addresses require manual CONTRACT_WHITELIST (no auto-allow for security)"

patterns-established:
  - "DCent dual-flow: swap/cross_swap -> txdata -> CONTRACT_CALL vs exchange -> payInAddress -> TRANSFER"
  - "3 providerType classification: swap (same-chain DEX), cross_swap (cross-chain DEX), exchange (custodial)"

requirements-completed: [RSRCH-01, RSRCH-02, RSRCH-03, RSRCH-04, RSRCH-05, RSRCH-06]

# Metrics
duration: 7min
completed: 2026-03-06
---

# Phase 342 Plan 01: DCent Swap API Research + Integration Design Summary

**DCent Swap API 7-endpoint deep research with actual responses, CAIP-19 bidirectional conversion rules, DEX/Exchange dual-pipeline mapping, and 17 design decisions in 936-line design doc 77**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-06T13:08:07Z
- **Completed:** 2026-03-06T13:15:09Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Documented 7 DCent Swap API endpoints with actual HTTP request/response structures from live API calls
- Discovered 3 provider types (swap, cross_swap, exchange) across 2 API instances (agent-swap DEX-only vs swapbuy-beta full)
- Confirmed DCent providers handle multi-hop routing internally -- Phase 345 (Auto Routing) scope reduced to fallback strategy
- Designed CAIP-19 <-> DCent Currency ID bidirectional conversion covering 7 ID patterns (native, CHAN, ERC20, BEP20, POLYGON-ERC20, CH20, SPL-TOKEN)
- Designed DEX Swap pipeline (approve + txdata -> BATCH[CONTRACT_CALL, CONTRACT_CALL]) and Exchange pipeline (payInAddress -> TRANSFER + status polling)
- Designed DcentSwapActionProvider with 4 actions, 4 MCP tools, 4 SDK methods, policy integration, and Admin Settings

## Task Commits

Each task was committed atomically:

1. **Task 1+2: DCent Swap API research + integration design** - `2cf03e5` (docs)

**Plan metadata:** TBD (docs: complete plan)

## Files Created/Modified

- `internal/design/77-dcent-swap-aggregator.md` - 936-line design doc with 11 sections covering API research, provider analysis, multi-hop verification, currency ID mapping, DEX/Exchange pipeline design, ActionProvider interface, MCP/SDK/policy integration, and 17 design decisions

## Decisions Made

- **DS-01**: Use `swapbuy-beta.dcentwallet.com` as default endpoint (includes Exchange providers; agent-swap has DEX only)
- **DS-02**: Self-encode ERC-20 approve calldata (DCent API `get_evm_dex_approve_calldata` unimplemented for sushi_swap and potentially others)
- **DS-03**: Default to `_flexible` exchange rate type (fixed rate `validUntil` conflicts with async AI agent approval flow)
- **DS-04**: Phase 345 (Auto Routing) scope reduced to fallback strategy -- DCent providers handle multi-hop internally
- **DS-05**: WAIaaS self-rate-limiting (get_quotes 2s interval, currencies 24h TTL cache)
- **DS-07**: Informational actions (get_quotes, swap_status) separated from resolve() -- use dedicated query methods
- **DS-08**: DEX router CONTRACT_WHITELIST manual addition required (no auto-allow for security)
- **DS-09**: Exchange payInAddress exempt from CONTRACT_WHITELIST (TRANSFER type not subject to contract whitelist)
- **DS-14**: cross_swap providers use DEX Swap flow (txdata-based, not payInAddress)
- **DS-15**: is_supported_by_currency_id endpoint not used (returns empty object, replaced by currencies cache)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- DCent `get_evm_dex_approve_calldata` returned `"approveProviderTransaction not implemented"` for sushi_swap -- resolved by documenting DS-02 decision to self-encode approve calldata
- DCent `is_supported_by_currency_id` returns empty `{}` for all queries -- resolved by DS-15 decision to not use this endpoint
- `create_exchange_transaction` returns empty body (HTTP 200, 0 bytes) for cross_swap providers -- this is expected; Exchange creation only works with `providerType: "exchange"` providers

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Design document complete, ready for Phase 343 (Currency Mapping + DEX Swap) implementation
- Currency ID conversion rules fully specified for `currency-mapper.ts` implementation
- DEX Swap pipeline mapping ready for `DcentSwapActionProvider.resolve('dex_swap')` implementation
- Phase 345 scope confirmed as optional fallback -- may be skipped based on runtime `fail_no_available_provider` frequency

---
*Phase: 342-research-design*
*Completed: 2026-03-06*
