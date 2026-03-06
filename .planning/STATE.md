---
gsd_state_version: 1.0
milestone: v31.2
milestone_name: UserOp Build/Sign API
status: completed
stopped_at: Completed Phase 339 UserOp Build API -- 2/2 plans
last_updated: "2026-03-06T09:10:59.963Z"
last_activity: 2026-03-06 -- Phase 339 UserOp Build API completed
progress:
  total_phases: 4
  completed_phases: 2
  total_plans: 4
  completed_plans: 4
  percent: 25
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-06)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** Phase 340 UserOp Sign API (v31.2 UserOp Build/Sign API)

## Current Position

Phase: 340 (3 of 4) -- UserOp Sign API
Plan: Not started
Status: Phase 339 complete, ready for Phase 340
Last activity: 2026-03-06 -- Phase 339 UserOp Build API completed

Progress: [█████░░░░░] 50%

## Performance Metrics

**Cumulative:** 86 milestones shipped, 339 phases completed, ~771 plans, ~2,273 reqs, ~6,969+ tests, ~239,575 LOC TS

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 338 | 01 | 5min | 2 | 4 |
| 338 | 02 | 5min | 2 | 12 |
| 339 | 01+02 | 9min | 2 | 7 |

## Accumulated Context

### Decisions

- D1: Lite mode = accountType='smart' + aaProvider=null; Full mode = aaProvider set
- D2: CHAIN_ERROR used for Lite mode send blocking with userop API guidance
- D3: USEROP domain for all UserOp Build/Sign error codes
- D4: userop_builds.wallet_id is TEXT (not FK) for simplicity
- D5: HexAddress regex strict 40-char, HexString arbitrary 0x-prefixed
- [Phase 339]: D6: Nonce read from EntryPoint v0.7 readContract (no Bundler dependency)
- [Phase 339]: D7: releaseKey takes Uint8Array privateKey, not walletId string
- [Phase 339]: D8: Factory detection uses getCode on-chain check before getFactoryArgs
- [Phase 339]: D9: All expired build records cleaned regardless of used status

### Blockers/Concerns

- C1: EIP-712 typehash 온체인 검증 필요 (Anvil fork 테스트 deferred, from v30.8)
- C2: SDK missing provider management methods (deferred)
- C3: ERC-8128 is Draft status -- spec may change

## Session Continuity

Last session: 2026-03-06T09:10:59.959Z
Stopped at: Completed Phase 339 UserOp Build API -- 2/2 plans
Resume file: None
