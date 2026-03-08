---
phase: 349-core-infra-perp
plan: 04
subsystem: api
tags: [hyperliquid, rest-api, mcp, sdk, connect-info]

requires:
  - phase: 349-03
    provides: HyperliquidPerpProvider, MarketData
provides:
  - 6 GET query endpoints for Hyperliquid data
  - 6 MCP query tools (waiaas_hl_get_*)
  - 13 SDK methods (7 action + 6 query)
  - connect-info hyperliquid capability
  - Route registration in daemon server
affects: [349-05, 350, 351]

tech-stack:
  added: []
  patterns: [Hono plain routes for dynamic response types, settings-based capability]

key-files:
  created:
    - packages/daemon/src/api/routes/hyperliquid.ts
    - packages/mcp/src/tools/hyperliquid.ts
  modified:
    - packages/daemon/src/api/routes/index.ts
    - packages/daemon/src/api/routes/connect-info.ts
    - packages/daemon/src/api/server.ts
    - packages/mcp/src/server.ts
    - packages/sdk/src/client.ts

key-decisions:
  - "Query routes use plain Hono (not OpenAPIHono) to avoid typed response schema mismatch"
  - "Action tools auto-registered via mcpExpose=true on provider, query tools manually registered"
  - "HyperliquidMarketData passed as optional dep to createApp for query endpoints"
  - "connect-info capability derived from settings (actions.hyperliquid_enabled)"

requirements-completed: [HPERP-12, HACCT-01, HACCT-02, HACCT-03, HACCT-04, HINT-02]

duration: 20min
completed: 2026-03-08
---

# Phase 349 Plan 04: REST API, MCP Tools, and SDK Methods Summary

**6 GET query endpoints, 6+7 MCP tools, 13 SDK methods, and connect-info capability for Hyperliquid integration**

## Performance

- **Duration:** 20 min
- **Tasks:** 2 (combined in single commit)
- **Files created:** 2
- **Files modified:** 5

## Accomplishments
- 6 REST GET endpoints: positions, orders, markets, funding-rates, account, fills
- 6 MCP query tools manually registered (action tools auto-registered via provider)
- 13 SDK methods: 7 action convenience methods + 6 query methods
- connect-info: hyperliquid capability + prompt hint for AI agents
- Route registration in daemon server with HyperliquidMarketData dependency

## Task Commits

1. **Task 1+2: REST API routes, MCP tools, SDK methods** - `0589453d` (feat)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed SERVICE_UNAVAILABLE error code**
- **Issue:** WAIaaSError('SERVICE_UNAVAILABLE') is not a valid error code
- **Fix:** Changed to ACTION_VALIDATION_FAILED

**2. [Rule 1 - Bug] Fixed OpenAPIHono typed response mismatch**
- **Issue:** z.any()/z.unknown() response schemas cause TypedResponse<never> mismatch with typed MarketData returns
- **Fix:** Switched from OpenAPIHono createRoute to plain Hono routes for dynamic response types

---
*Phase: 349-core-infra-perp*
*Completed: 2026-03-08*
