---
phase: 404-typed-mcp-schemas-response-enrichment
plan: 01
subsystem: api, mcp
tags: [zod-to-json-schema, mcp, openapi, action-provider, typed-schema]

requires:
  - phase: 402-schema-hardening
    provides: Provider Zod schema descriptions with unit information
provides:
  - GET /v1/actions/providers inputSchema JSON Schema field
  - MCP typed schema registration via jsonSchemaToZodParams
  - safeZodToJsonSchema fallback for broken schemas
affects: [phase-405-humanAmount, phase-406-sdk-skill]

tech-stack:
  added: [zod-to-json-schema]
  patterns: [JSON Schema -> Zod type mapping, typed MCP tool registration]

key-files:
  created:
    - packages/mcp/src/__tests__/action-provider-schema.test.ts
  modified:
    - packages/daemon/src/api/routes/actions.ts
    - packages/daemon/src/__tests__/api-actions.test.ts
    - packages/mcp/src/tools/action-provider.ts

key-decisions:
  - "zod-to-json-schema with target openApi3 for schema conversion"
  - "JSON Schema properties flattened into individual MCP tool params (not nested under params key)"
  - "Handler re-wraps typed fields into params object for REST API backward compatibility"

patterns-established:
  - "safeZodToJsonSchema: try-catch with { type: object } fallback for any Zod->JSON conversion"
  - "jsonSchemaToZodParams: JSON Schema type -> Zod type mapping with optional/description support"

requirements-completed: [MCP-01, MCP-02, MCP-03, TEST-03]

duration: 8min
completed: 2026-03-14
---

# Phase 404 Plan 01: Typed MCP Schema Registration + Provider Metadata inputSchema API Summary

**zodToJsonSchema-based inputSchema field in provider listing + jsonSchemaToZodParams typed MCP tool registration with fallback**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-14T07:18:11Z
- **Completed:** 2026-03-14T07:26:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- GET /v1/actions/providers now returns inputSchema JSON Schema for each action
- MCP tools registered with individual typed params instead of generic params bag when inputSchema is available
- Safe fallback to { type: "object" } (REST) and z.record(z.unknown()) (MCP) when conversion fails

## Task Commits

1. **Task 1: GET /v1/actions/providers inputSchema field** - `b18af242` (feat)
2. **Task 2: MCP typed schema registration + fallback** - `08fde1eb` (feat)

## Files Created/Modified
- `packages/daemon/src/api/routes/actions.ts` - Added safeZodToJsonSchema helper + inputSchema in provider response
- `packages/daemon/src/__tests__/api-actions.test.ts` - 3 new tests for inputSchema presence, JSON Schema fields, fallback
- `packages/mcp/src/tools/action-provider.ts` - jsonSchemaToZodParams helper + typed/fallback tool registration
- `packages/mcp/src/__tests__/action-provider-schema.test.ts` - 10 new tests for type mapping + MCP integration

## Decisions Made
- Used zod-to-json-schema with `target: 'openApi3'` for Zod -> JSON Schema conversion
- MCP tool params are flattened (individual fields) rather than nested under `params` key -- handler re-wraps them for REST API compatibility
- JSON Schema type mapping: string->z.string(), number/integer->z.number(), boolean->z.boolean(), array->z.array(z.unknown()), unknown->z.unknown()

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- inputSchema available in REST API and consumed by MCP tool registration
- Ready for Plan 404-02 (response enrichment)

---
*Phase: 404-typed-mcp-schemas-response-enrichment*
*Completed: 2026-03-14*
