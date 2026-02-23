# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-23)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** Phase 246 Core Provider Implementation (v28.1 Jupiter Swap)

## Current Position

Milestone: v28.1 Jupiter Swap
Phase: 1 of 2 (Phase 246: Core Provider Implementation)
Plan: 0 of 0 in current phase (TBD -- awaiting plan-phase)
Status: Ready to plan
Last activity: 2026-02-23 -- Roadmap created for v28.1 Jupiter Swap (2 phases, 17 requirements)

Progress: [..........] 0%

## Performance Metrics

**Cumulative:** 56 milestones, 245 phases, 526 plans, 1,446 reqs, 4,396+ tests, ~186,724 LOC TS

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 246 | 0/0 | - | - |
| 247 | 0/0 | - | - |

## Accumulated Context

### Decisions

- [Roadmap]: 2-phase 구조 확정 -- Phase 246 (standalone provider in packages/actions/), Phase 247 (daemon integration + DX)
- [Research]: computeBudgetInstructions transport 방식은 Phase 246 plan-phase에서 IChainAdapter.buildContractCall() 확인 후 결정
- [Research]: ContractCallRequest accounts 필드명(pubkey vs address) Phase 246 시작 시 스키마 확인 필요

### Blockers/Concerns

- STO-03: Confirmation Worker RPC 콜백 미주입 (v27.1 known gap)
- [Phase 246]: computeBudgetInstructions를 ContractCallRequest로 전달하는 방식 미확정 (plan-phase에서 코드베이스 확인 후 결정)
- [Phase 246]: ContractCallRequest accounts[].pubkey vs accounts[].address 필드명 확인 필요

## Session Continuity

Last session: 2026-02-23
Stopped at: Roadmap created for v28.1. Ready for /gsd:plan-phase 246
Resume file: None
