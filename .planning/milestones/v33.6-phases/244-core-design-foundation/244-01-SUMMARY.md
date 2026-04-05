---
phase: 244-core-design-foundation
plan: 01
subsystem: api
tags: [defi, action-provider, slippage, allowance-holder, config-toml, admin-settings]

# Dependency graph
requires:
  - phase: research
    provides: "m28-defi-SUMMARY, STACK, ARCHITECTURE, PITFALLS research artifacts"
provides:
  - "DEFI-01 confirmed package structure (packages/actions/ directory tree, package.json, registerBuiltInProviders lifecycle)"
  - "DEFI-02 confirmed API conversion patterns (ActionApiClient base, ContractCallRequest mappings, 8 DeFi error codes, SlippageHelper branded types)"
  - "APIC-05 AllowanceHolder flow for 0x EVM Swap (Permit2 replaced)"
  - "config.toml [actions.*] schema pattern with per-provider slippage fields"
  - "Admin Settings vs config.toml boundary matrix"
affects: [245-policy-async-test-design, m28-01, m28-02, m28-03, m28-04, m28-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ActionApiClient: fetch + AbortController + Zod response validation base class"
    - "SlippageHelper: branded types (SlippageBps/SlippagePct) preventing unit confusion"
    - "Config-driven provider registration with registerBuiltInProviders()"
    - "Settings snapshot at resolve() entry (Pitfall P19 prevention)"
    - "AllowanceHolder standard ERC-20 approve for 0x (NOT Permit2)"

key-files:
  created: []
  modified:
    - "internal/objectives/m28-00-defi-basic-protocol-design.md"
    - "internal/objectives/m28-02-0x-evm-swap.md"

key-decisions:
  - "DEFI-01/DEFI-02 confirmed as design sections in m28-00 (PKGS-01~04 + APIC-01~05)"
  - "AllowanceHolder adopted over Permit2 for 0x EVM Swap (server-side simplicity, no EIP-712)"
  - "Slippage uses API-native units with branded types to prevent bps/pct confusion"
  - "ChainError -> WAIaaSError conversion at Action Route Handler level (not Stage 5)"
  - "8 DeFi error codes added to error hierarchy (ACTION_API_ERROR through QUOTE_EXPIRED)"
  - "Admin Settings boundary: api_key + slippage + operational params are hot-reload, enabled + urls + addresses are config.toml only"

patterns-established:
  - "ActionApiClient base pattern: native fetch, AbortController timeout, Zod schema.parse on every response"
  - "SlippageHelper branded types: SlippageBps/SlippagePct with factory functions and clamp helpers"
  - "Provider registration lifecycle: 6-step config-driven loading at DaemonLifecycle Step 4"
  - "Settings snapshot pattern: snapshot at resolve() entry, immutable through pipeline execution"

requirements-completed: [PKGS-01, PKGS-02, PKGS-03, PKGS-04, APIC-01, APIC-02, APIC-03, APIC-04, APIC-05]

# Metrics
duration: 9min
completed: 2026-02-23
---

# Phase 244 Plan 01: Core Design Foundation Summary

**DEFI-01 package structure + DEFI-02 API conversion patterns confirmed with ActionApiClient base, branded SlippageHelper, 8 error codes, and AllowanceHolder flow replacing Permit2**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-23T04:42:25Z
- **Completed:** 2026-02-23T04:51:25Z
- **Tasks:** 2/2
- **Files modified:** 2

## Accomplishments

- DEFI-01 package structure finalized with 5-provider directory tree, package.json, registerBuiltInProviders() 6-step lifecycle, config.toml [actions.*] schema pattern, and Admin Settings boundary matrix (PKGS-01~04)
- DEFI-02 API conversion patterns finalized with ActionApiClient base class (fetch + Zod), Solana/EVM ContractCallRequest mappings, 8 DeFi error codes, branded slippage types, and AllowanceHolder flow (APIC-01~05)
- m28-02 objective updated from Permit2 to AllowanceHolder across all sections (endpoints, decisions, tests, file structure, risks)

## Task Commits

Each task was committed atomically:

1. **Task 1: DEFI-01 package structure + DEFI-02 API patterns in m28-00** - `6799b898` (feat)
2. **Task 2: m28-02 AllowanceHolder update** - `2837cdfb` (feat)

## Files Created/Modified

- `internal/objectives/m28-00-defi-basic-protocol-design.md` - DEFI-01 (sections 1.1~1.4: PKGS-01~04) and DEFI-02 (sections 2.2~2.6: APIC-01~05) confirmed design sections replacing previous "design scope/deliverables" drafts
- `internal/objectives/m28-02-0x-evm-swap.md` - Permit2 replaced with AllowanceHolder throughout: endpoints, component descriptions, technical decisions, E2E scenarios, risks, file structure

## Decisions Made

1. **AllowanceHolder over Permit2** -- 0x officially recommends AllowanceHolder for server-side integrations. Eliminates EIP-712 signing complexity, reduces gas costs, uses standard ERC-20 approve flow that already integrates with WAIaaS APPROVE pipeline type.
2. **Slippage branded types** -- `SlippageBps` and `SlippagePct` as branded number types with factory functions (`asBps`, `asPct`) and clamp helpers. Config keys use `_bps`/`_pct` suffixes matching API-native units. Prevents Pitfall P8 (unit confusion).
3. **ChainError at resolve(), WAIaaSError at route handler** -- ActionApiClient throws ChainError (per CLAUDE.md convention). Conversion to WAIaaSError happens in Action Route Handler, not Stage 5, because resolve() executes before pipeline entry.
4. **8 DeFi error codes** -- `ACTION_API_ERROR` (502), `ACTION_API_TIMEOUT` (504), `ACTION_RATE_LIMITED` (429), `PRICE_IMPACT_TOO_HIGH` (422), `ACTION_REQUIRES_APPROVAL` (409), `BRIDGE_ROUTE_NOT_FOUND` (404), `JITO_UNAVAILABLE` (503), `QUOTE_EXPIRED` (410).
5. **Admin Settings boundary** -- `api_key` is hot-reloadable despite being a credential (operational necessity for zero-downtime key rotation). `enabled` and `api_base_url` require restart.
6. **config.toml validation bounds** -- Jupiter bps: 1-10000. 0x/LI.FI pct: 0.001-1.0. Rejected at config loading time, not at API call time.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- DEFI-01/DEFI-02 confirmed designs are ready for consumption by m28-01 (Jupiter Swap) implementation
- m28-02 objective is aligned with AllowanceHolder decision from research
- Phase 244 Plan 02 (DEFI-03 policy integration, DEFI-04 async tracking, DEFI-05 test strategy) can proceed with the confirmed DEFI-01/02 foundation

---
*Phase: 244-core-design-foundation*
*Completed: 2026-02-23*
