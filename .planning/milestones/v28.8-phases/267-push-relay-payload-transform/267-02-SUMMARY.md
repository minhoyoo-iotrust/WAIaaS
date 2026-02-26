---
phase: 267-push-relay-payload-transform
plan: 02
subsystem: push-relay
tags: [ntfy, subscriber, pipeline, integration, push-relay]

requires:
  - phase: 267-push-relay-payload-transform
    provides: IPayloadTransformer, ConfigurablePayloadTransformer, PayloadConfig
provides:
  - NtfySubscriber pipeline with optional payload transformer integration
  - Conditional transformer instantiation in bin.ts based on config
  - End-to-end pipeline integration tests
affects: [push-relay deployment, config.toml documentation]

tech-stack:
  added: []
  patterns: [optional-pipeline-step, conditional-initialization]

key-files:
  created:
    - packages/push-relay/src/__tests__/pipeline-integration.test.ts
  modified:
    - packages/push-relay/src/subscriber/ntfy-subscriber.ts
    - packages/push-relay/src/bin.ts
    - packages/push-relay/src/__tests__/ntfy-subscriber.test.ts

key-decisions:
  - "Transformer is injected via NtfySubscriberOpts, not hardcoded — allows future replacement"
  - "Bypass pattern: undefined check before calling transform() — zero overhead when unconfigured"
  - "bin.ts checks config.relay.push.payload truthiness for conditional instantiation"

patterns-established:
  - "Optional pipeline step: check undefined before calling, bypass when not configured"

requirements-completed: [RLAY-03, RLAY-04]

duration: 6min
completed: 2026-02-26
---

# Plan 267-02: Pipeline Integration + Bypass Summary

**NtfySubscriber pipeline integrates optional IPayloadTransformer between buildPushPayload() and onMessage(), with conditional instantiation in bin.ts and full bypass when unconfigured**

## Performance

- **Duration:** 6 min
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- NtfySubscriber accepts optional transformer in constructor opts
- buildPushPayload() output passes through transformer.transform() before reaching onMessage
- Transformer bypassed (undefined check) when [relay.push.payload] is not configured
- bin.ts conditionally creates ConfigurablePayloadTransformer from config
- 3 subscriber tests + 4 integration tests added (92 total tests passing)
- 100% coverage on transformer module

## Task Commits

1. **Task 1+2: Pipeline integration + tests** - `bcad0c9f` (feat)

## Files Created/Modified
- `packages/push-relay/src/subscriber/ntfy-subscriber.ts` - Added transformer field, IPayloadTransformer import, transform() call in pipeline
- `packages/push-relay/src/bin.ts` - Conditional ConfigurablePayloadTransformer instantiation, transformer option in subscriber
- `packages/push-relay/src/__tests__/ntfy-subscriber.test.ts` - 3 new tests for transformer scenarios
- `packages/push-relay/src/__tests__/pipeline-integration.test.ts` - 4 end-to-end pipeline tests

## Decisions Made
- Transformer injection via opts (not constructor-only) for flexibility and testability
- bin.ts uses simple truthiness check on config.relay.push.payload

## Deviations from Plan
None - plan executed exactly as written

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Complete push relay payload transform pipeline operational
- Ready for phase verification

---
*Phase: 267-push-relay-payload-transform*
*Completed: 2026-02-26*
