# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-25)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** Phase 264 - Monitoring Alerts

## Current Position

Phase: 5 of 5 (Phase 264: Monitoring Alerts)
Plan: 1 of 2 in current phase
Status: 264-01 complete, proceeding to 264-02
Last activity: 2026-02-25 -- Completed 264-01 RPC monitoring events + onEvent callback (44 event types, 5 new tests)

Progress: [█████████░] 92%

## Performance Metrics

**Cumulative:** 63 milestones, 259 phases completed, 556 plans, 1,557 reqs, ~5,000+ tests, ~190,000 LOC TS

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 260 | 2/2 | 5min | 2.5min |
| 261 | 3/3 | 13min | 4.3min |
| 262 | 1/1 | 6min | 6min |
| 263 | 2/2 | 12min | 6min |
| 264 | 1/2 | 4min | 4min |

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

- 261-01: configKeyToNetwork strips solana_/evm_ prefix and converts _ to - for EVM; skips evm_default_network and solana_ws_*
- 261-01: RpcPool seeded empty -> config.toml first (highest priority) -> built-in defaults second (register deduplicates)
- 261-01: resolve() rpcUrl optional with '' default -- RpcPool-first resolution, backward compatible
- 261-01: SolanaAdapter.withRpcRetry (same endpoint, short) and RpcPool cooldown (different endpoint, long) are complementary
- 261-01: viem fallback transport not used -- RpcPool provides unified pool state across both adapters

- 261-02: Route handlers, pipeline, balance monitor unchanged -- existing resolveRpcUrl pattern is forward-compatible with RpcPool
- 261-02: Hot-reload adds pool.reset() (cooldown clear) after eviction, not URL re-registration -- preserves startup URL priority order
- 261-02: configKeyToNetwork imported from adapter-pool.ts in hot-reload to avoid duplicating network mapping logic

- 261-03: resolveRpcUrlFromPool extracted as testable helper in adapter-pool.ts (not inline closure in daemon.ts)
- 261-03: RpcPool URL used at subscriber creation time only -- mid-polling rotation deferred to Phase 264
- 261-03: No changes to IncomingTxMonitorService or SubscriptionMultiplexer -- subscriberFactory is dependency-injected
- 261-03: WSS URL derivation continues from resolved HTTP URL (same pattern as before RpcPool)

- 262-01: rpc_pool.* defaultValue is '[]' -- URL lists managed exclusively via Admin Settings API, not config.toml
- 262-01: replaceNetwork() does full atomic replace (not merge like register()) -- ensures URL list matches admin setting
- 262-01: URL merge priority: user URLs (Admin Settings) > config.toml single URL > built-in defaults
- 262-01: networkToConfigKey() is private on HotReloadOrchestrator (inverse of configKeyToNetwork in adapter-pool.ts)

- 263-01: User URLs saved as JSON arrays excluding built-in -- built-in defaults merged server-side by hot-reload
- 263-01: BUILT_IN_RPC_URLS duplicated as frontend constant -- admin SPA cannot import @waiaas/core directly
- 263-01: Built-in URLs toggle-able (enable/disable) not deletable -- prevents accidental loss of fallback URLs
- 263-01: EVM default network selector preserved at top of EVM section, separate dirty state

- 263-02: Pool status polling every 15s with silent failure -- no toast on polling errors
- 263-02: Test/status composite key is network:url for per-URL state tracking
- 263-02: networkToChain uses SOLANA_NETWORKS.includes for chain determination

- 264-01: onEvent is optional callback (not EventEmitter) -- keeps RpcPool lightweight with zero dependencies
- 264-01: RPC_HEALTH_DEGRADED emitted on every cooldown entry; RPC_ALL_FAILED only when all endpoints in cooldown
- 264-01: RPC_RECOVERED emitted only when endpoint was in cooldown before reportSuccess

### Blockers/Concerns

- [RESOLVED] 저장 방식 결정: SettingsService JSON 배열 방식 채택 (Phase 262-01에서 구현)
- #164: IncomingTxMonitorService 환경 기본 네트워크만 구독 (MEDIUM, 기존 이슈)

## Session Continuity

Last session: 2026-02-25
Stopped at: Completed 264-01-PLAN.md
Resume file: None
