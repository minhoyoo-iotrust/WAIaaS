---
phase: 267-push-relay-payload-transform
plan: 01
subsystem: push-relay
tags: [zod, toml, transformer, payload, push-relay]

requires: []
provides:
  - PayloadConfigSchema Zod schema for [relay.push.payload] config section
  - IPayloadTransformer interface for push payload transformation
  - ConfigurablePayloadTransformer implementing static_fields + category_map injection
  - PayloadConfig type export from config.ts
affects: [267-02, push-relay pipeline]

tech-stack:
  added: []
  patterns: [configurable-payload-transform, merge-priority-chain]

key-files:
  created:
    - packages/push-relay/src/transformer/payload-transformer.ts
    - packages/push-relay/src/__tests__/payload-transformer.test.ts
  modified:
    - packages/push-relay/src/config.ts
    - packages/push-relay/src/__tests__/config.test.ts
    - packages/push-relay/src/index.ts

key-decisions:
  - "Merge priority: original data > category_map > static_fields (original payload data never overwritten)"
  - "PayloadConfigSchema uses z.record() for flexible key-value pairs"
  - "payload field is optional in PushConfigSchema for backward compatibility"

patterns-established:
  - "Payload transform chain: static_fields (base) → category_map (category-specific) → original data (preserved)"

requirements-completed: [RLAY-01, RLAY-02]

duration: 8min
completed: 2026-02-26
---

# Plan 267-01: PayloadConfigSchema + ConfigurablePayloadTransformer Summary

**Zod-validated [relay.push.payload] config section with TDD-implemented ConfigurablePayloadTransformer that injects static_fields and category-specific fields into push payloads**

## Performance

- **Duration:** 8 min
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- PayloadConfigSchema Zod schema with static_fields + category_map parsing
- IPayloadTransformer interface and ConfigurablePayloadTransformer class
- 5 config parsing tests for payload section variations
- 8 unit tests for transformer behavior
- Full backward compatibility (missing [relay.push.payload] returns undefined)

## Task Commits

1. **Task 1+2: Schema + Transformer TDD** - `0650bf98` (feat)

## Files Created/Modified
- `packages/push-relay/src/config.ts` - Added PayloadConfigSchema, CategoryFieldsSchema, PayloadConfig type export
- `packages/push-relay/src/transformer/payload-transformer.ts` - IPayloadTransformer interface + ConfigurablePayloadTransformer class
- `packages/push-relay/src/__tests__/config.test.ts` - 5 new tests for payload section parsing
- `packages/push-relay/src/__tests__/payload-transformer.test.ts` - 8 unit tests for transformer
- `packages/push-relay/src/index.ts` - Export PayloadConfig, IPayloadTransformer, ConfigurablePayloadTransformer

## Decisions Made
- Merge priority: original data > category_map > static_fields — ensures original payload data is never lost
- PayloadConfigSchema uses z.record() for flexible key-value pairs rather than fixed fields

## Deviations from Plan
None - plan executed exactly as written

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- ConfigurablePayloadTransformer ready for pipeline integration in 267-02
- IPayloadTransformer interface available for NtfySubscriber opts

---
*Phase: 267-push-relay-payload-transform*
*Completed: 2026-02-26*
