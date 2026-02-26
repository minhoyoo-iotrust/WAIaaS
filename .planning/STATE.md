# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-26)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** v29.2 Phase 276 -- Aave V3 Provider Implementation (planned, ready to execute)

## Current Position

Phase: 276 (3 of 5) -- Aave V3 Provider Implementation -- **PLANNED**
Plan: 0 of 3 in current phase
Status: Phase 276 planned (3 plans, 2 waves). Ready to execute.
Last activity: 2026-02-27 -- Phase 276 planned (3 plans, 10 reqs mapped)

Progress: [████░░░░░░] 40%

## Performance Metrics

**Cumulative:** 67 milestones (66 shipped + 1 active), 275 phases completed, ~595 plans, ~1,662 reqs, ~5,000+ tests, ~180,194 LOC TS

## Accumulated Context

### Decisions

(New milestone -- no decisions yet)

### Research Flags

- C1: ERC-20 approve race condition -- USDT-like tokens require zero-first approve; multi-step resolve must annotate both elements with actionProvider
- C2: HF 18-decimal precision -- bigint comparisons only (1_200_000_000_000_000_000n), never Number conversion for safety-critical checks
- C3: Position sync drift -- DB is cache of on-chain truth, force sync after Stage 6 confirms lending tx
- C4: CONTRACT_WHITELIST bypass -- both elements of [approveReq, actionReq] must carry actionProvider metadata
- M6: SPENDING_LIMIT classification -- supply/repay/withdraw are non-spending; only borrow counts

### Blockers/Concerns

- #164: IncomingTxMonitorService 환경 기본 네트워크만 구독 (MEDIUM, 기존 이슈)

## Session Continuity

Last session: 2026-02-27
Stopped at: Phase 276 planned (3 plans, 2 waves, 10 reqs). Ready to execute Phase 276.
Resume file: None
