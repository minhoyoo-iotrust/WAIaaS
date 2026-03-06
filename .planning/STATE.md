---
gsd_state_version: 1.0
milestone: v31.2
milestone_name: UserOp Build/Sign API
status: executing
stopped_at: Completed 338-02-PLAN.md
last_updated: "2026-03-06T08:50:00.000Z"
last_activity: 2026-03-06 -- Phase 338 Foundation completed (2/2 plans)
progress:
  total_phases: 4
  completed_phases: 1
  total_plans: 8
  completed_plans: 2
  percent: 25
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-06)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** Phase 339 UserOp Build API (v31.2 UserOp Build/Sign API)

## Current Position

Phase: 339 (2 of 4) -- UserOp Build API
Plan: Not started
Status: Phase 338 complete, ready for Phase 339
Last activity: 2026-03-06 -- Phase 338 Foundation completed

Progress: [##░░░░░░░░] 25%

## Performance Metrics

**Cumulative:** 86 milestones shipped, 338 phases completed, ~769 plans, ~2,258 reqs, ~6,950+ tests, ~239,575 LOC TS

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 338 | 01 | 5min | 2 | 4 |
| 338 | 02 | 5min | 2 | 12 |

## Accumulated Context

### Decisions

- D1: Lite mode = accountType='smart' + aaProvider=null; Full mode = aaProvider set
- D2: CHAIN_ERROR used for Lite mode send blocking with userop API guidance
- D3: USEROP domain for all UserOp Build/Sign error codes
- D4: userop_builds.wallet_id is TEXT (not FK) for simplicity
- D5: HexAddress regex strict 40-char, HexString arbitrary 0x-prefixed

### Blockers/Concerns

- C1: EIP-712 typehash 온체인 검증 필요 (Anvil fork 테스트 deferred, from v30.8)
- C2: SDK missing provider management methods (deferred)
- C3: ERC-8128 is Draft status -- spec may change

## Session Continuity

Last session: 2026-03-06
Stopped at: Completed 338-02-PLAN.md (Phase 338 Foundation -- 2/2 plans)
Resume file: None
