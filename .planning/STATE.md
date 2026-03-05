---
gsd_state_version: 1.0
milestone: v30.10
milestone_name: ERC-8128 Signed HTTP Requests
status: active
stopped_at: Completed Phase 327 (327-01 + 327-02), HTTP Message Signing Engine done
last_updated: "2026-03-05T05:39:06.761Z"
last_activity: 2026-03-05 -- Phase 327 complete (2 plans, 48 tests)
progress:
  total_phases: 3
  completed_phases: 1
  total_plans: 2
  completed_plans: 2
  percent: 33
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-05)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** Phase 328 -- REST API + Policy + Settings

## Current Position

Phase: 328 of 329 (REST API + Policy + Settings)
Plan: 1 of TBD
Status: Ready to plan
Last activity: 2026-03-05 -- Phase 327 complete

Progress: [███░░░░░░░] 33%

## Performance Metrics

**Cumulative:** 83 milestones shipped, 326 phases completed, ~743 plans, ~2,119 reqs, ~6,742+ tests, ~262,608 LOC TS

## Accumulated Context

### Decisions

(New milestone -- decisions will be logged here)

- Architecture: sign-only pattern (no proxy), bypasses transaction pipeline (x402 precedent)
- Dependency: only `structured-headers` new production dependency
- Self-implementation of RFC 9421 Signature Base (~150 LOC, no mature library available)
- [Phase 327]: Added viem as @waiaas/core dependency for ERC-8128 keyid checksum and signing
- [Phase 327]: signHttpMessage takes raw privateKey (daemon decrypts from keystore before calling)
- [Phase 327]: Self-implemented RFC 9421 Signature Base via string formatting (no structured-headers library)

### Blockers/Concerns

- C1: EIP-712 typehash 온체인 검증 필요 (Anvil fork 테스트 deferred, from v30.8)
- C2: SDK missing provider management methods (setProvider/getProviderStatus) -- deferred to future milestone
- C3: ERC-8128 is Draft status -- spec may change (keyid format, nonce strategy, algorithm). Mitigated by isolating spec-dependent values in keyid.ts/constants.ts.

## Session Continuity

Last session: 2026-03-05T05:39:06.757Z
Stopped at: Completed Phase 327 (327-01 + 327-02), HTTP Message Signing Engine done
Resume file: None
