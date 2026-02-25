# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-25)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** Phase 260 - RPC Pool Core + Built-in Defaults

## Current Position

Phase: 1 of 5 (Phase 260: RPC Pool Core + Built-in Defaults) -- COMPLETE
Plan: 2 of 2 in current phase (all plans done)
Status: Phase 260 complete, ready for Phase 261
Last activity: 2026-02-25 -- Completed 260-02 built-in defaults (18 tests, 4 files)

Progress: [██░░░░░░░░] 20%

## Performance Metrics

**Cumulative:** 63 milestones, 259 phases completed, 556 plans, 1,557 reqs, ~5,000+ tests, ~190,000 LOC TS

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 260 | 2/2 | 5min | 2.5min |

## Accumulated Context

### Decisions

- Roadmap: 5 phases derived from 25 requirements in 6 categories (POOL/DFLT/ADPT/CONF/ADUI/MNTR)
- Phase 260 combines POOL + DFLT -- built-in defaults are part of pool initialization, not a separate delivery
- Phase 261 includes CONF-01/CONF-04 -- backward compat belongs with adapter wiring, not settings storage

- 260-01: AllRpcFailedError extends Error (not ChainError) -- infrastructure-level, not chain-specific
- 260-01: Injectable nowFn for deterministic cooldown testing instead of mocking Date.now
- 260-01: Network key is string (not NetworkType) for flexibility -- adapters can use any identifier
- 260-02: BUILT_IN_RPC_DEFAULTS typed as Readonly<Record<string, readonly string[]>> -- double immutability
- 260-02: createWithDefaults() is static factory, not constructor param -- keeps new RpcPool() clean for manual configs

### Blockers/Concerns

- SolanaAdapter 기존 withRpcRetry 로직과 RpcPool cooldown 간 이중 대기 가능성 -- Phase 261 설계 시 결정 필요
- viem fallback transport vs RpcPool 레벨 클라이언트 재생성 -- Phase 261 설계 시 결정 필요
- 저장 방식 (SettingsService JSON 배열 vs rpc_endpoints DB 테이블) -- Phase 262 설계 시 결정 필요
- #164: IncomingTxMonitorService 환경 기본 네트워크만 구독 (MEDIUM, 기존 이슈)

## Session Continuity

Last session: 2026-02-25
Stopped at: Completed 260-02-PLAN.md (Phase 260 fully complete)
Resume file: None
