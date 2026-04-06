---
phase: 261-adapter-integration
verified: 2026-02-25T10:35:00Z
status: passed
score: 10/10 must-haves verified
re_verification: false
---

# Phase 261: Adapter Integration Verification Report

**Phase Goal:** 기존 어댑터가 RpcPool을 경유하여 RPC를 호출하고, config.toml 단일 URL 설정이 하위 호환된다
**Verified:** 2026-02-25T10:35:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | AdapterPool accepts RpcPool and uses it to resolve RPC URLs before creating adapters | VERIFIED | `adapter-pool.ts` lines 113-151: constructor accepts `rpcPool?: RpcPool`, `resolve()` calls `rpcPool.getUrl(network)` before falling back to `rpcUrl` |
| 2 | config.toml single-URL settings are injected as highest-priority entries into RpcPool at startup | VERIFIED | `daemon.ts` lines 379-396: `new RpcPool()` -> config.toml URLs registered first via `rpcPool.register(network, [url])` -> built-in defaults registered second |
| 3 | WAIAAS_RPC_* env variables override config.toml URLs and become first-priority in Pool | VERIFIED | `loader.ts` `applyEnvOverrides()` maps `WAIAAS_RPC_*` to `config.rpc.*` before Zod parse; daemon Step 4 seeds RpcPool from `config.rpc` (which includes env overrides) |
| 4 | Existing `adapterPool.resolve(chain, network, rpcUrl)` callers continue to work without modification | VERIFIED | `resolve()` signature: `rpcUrl?: string` (optional param with `''` default); existing callers pass rpcUrl as fallback when pool has no entry |
| 5 | SolanaAdapter/EvmAdapter calls go through RpcPool-resolved URLs | VERIFIED | `adapter-pool.ts` `resolve()` uses pool URL as `actualRpcUrl` passed to `adapter.connect(actualRpcUrl)` |
| 6 | Route handlers and pipeline stages use AdapterPool without needing to change call sites | VERIFIED | Plan 261-02 design decision: existing `resolveRpcUrl() -> adapterPool.resolve()` pattern is forward-compatible because pool URL takes priority over provided rpcUrl fallback |
| 7 | Hot-reload RPC eviction still works; cooldown is reset on rpc.* settings change | VERIFIED | `hot-reload.ts` `reloadRpc()` lines 503-514: `pool.pool` -> `rpcPool.reset(network)` for each changed network after adapter eviction |
| 8 | IncomingTxMonitor subscriberFactory resolves RPC URLs from RpcPool instead of SettingsService directly | VERIFIED | `daemon.ts` line 822/829: `resolveRpcUrlFromPool(this.rpcPool, sSvc.get.bind(sSvc), chain, network)` used for both Solana and EVM subscribers |
| 9 | `resolveRpcUrlFromPool` helper provides testable pool-first URL resolution with fallback | VERIFIED | `adapter-pool.ts` lines 95-109: exported helper tries `rpcPool.getUrl(network)`, catches and falls back to `settingsGet('rpc.${rpcConfigKey(chain, network)}')` |
| 10 | `rpcPoolInstance` getter on DaemonLifecycle exposes RpcPool for other services | VERIFIED | `daemon.ts` lines 183-186: `get rpcPoolInstance(): RpcPool | null { return this.rpcPool; }` |

**Score:** 10/10 truths verified

### Required Artifacts

| Artifact | Plan | Status | Details |
|----------|------|--------|---------|
| `packages/daemon/src/infrastructure/adapter-pool.ts` | 261-01 | VERIFIED | 242 lines; contains `configKeyToNetwork`, `resolveRpcUrlFromPool`, `AdapterPool` class with `rpcPool` field, `resolve()` pool-first logic, `reportRpcFailure/Success`, `pool` getter |
| `packages/daemon/src/__tests__/adapter-pool-rpc-pool.test.ts` | 261-01 | VERIFIED | 324 lines; 27 tests in 6 describe blocks; all pass |
| `packages/daemon/src/lifecycle/daemon.ts` | 261-01, 261-03 | VERIFIED | Imports `RpcPool`, `BUILT_IN_RPC_DEFAULTS`; `private rpcPool: RpcPool | null = null`; Step 4 seeds pool; `rpcPoolInstance` getter; subscriberFactory uses `resolveRpcUrlFromPool` |
| `packages/daemon/src/infrastructure/settings/hot-reload.ts` | 261-02 | VERIFIED | Imports `configKeyToNetwork`; `reloadRpc()` resets RpcPool cooldown after adapter eviction |
| `packages/daemon/src/__tests__/adapter-pool-rpc-routing.test.ts` | 261-02 | VERIFIED | 298 lines; 12 tests in 5 describe blocks; all pass |
| `packages/daemon/src/__tests__/incoming-rpc-pool.test.ts` | 261-03 | VERIFIED | 224 lines; 12 tests in 2 describe blocks; all pass |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `adapter-pool.ts` | `packages/core/src/rpc/rpc-pool.ts` | `rpcPool.getUrl(network)` in `resolve()` | WIRED | Line 146: `actualRpcUrl = this.rpcPool.getUrl(network as string)` |
| `daemon.ts` | `adapter-pool.ts` | `new AdapterPool(this.rpcPool)` | WIRED | Line 399: `this.adapterPool = new AdapterPool(this.rpcPool)` |
| `daemon.ts` | `packages/core/src/rpc/rpc-pool.ts` | `rpcPool.getUrl(network)` in `subscriberFactory` | WIRED | Lines 822, 829: `resolveRpcUrlFromPool(this.rpcPool, ...)` which calls `rpcPool.getUrl(network)` internally |
| `hot-reload.ts` | `adapter-pool.ts` | `pool.evict()` + `rpcPool.reset()` | WIRED | Lines 492-514: `pool.evict()` loop then `rpcPool.reset(network)` loop for changed rpc.* keys |
| `incoming-tx-monitor-service` | `daemon.ts` | `subscriberFactory` callback | WIRED | `subscriberFactory` is dependency-injected; internally uses `resolveRpcUrlFromPool` as verified by `incoming-rpc-pool.test.ts` |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| ADPT-01 | 261-01 | RpcPool 추상 레이어를 AdapterPool과 어댑터 사이에 도입한다 | SATISFIED | `AdapterPool` constructor accepts `RpcPool`; `resolve()` uses pool for URL resolution before adapters connect |
| ADPT-02 | 261-02 | SolanaAdapter의 잔액/자산 조회가 RPC Pool을 경유한다 | SATISFIED | `AdapterPool.resolve('solana', network)` uses pool URL via `rpcPool.getUrl()` before `SolanaAdapter.connect()`; 12 routing tests pass |
| ADPT-03 | 261-02 | EvmAdapter의 PublicClient 생성이 RPC Pool에서 URL을 획득한다 | SATISFIED | `AdapterPool.resolve('ethereum', network)` uses pool URL before `EvmAdapter.connect()`; EVM routing tests pass |
| ADPT-04 | 261-03 | IncomingTxMonitor 각 Subscriber가 RPC Pool을 통해 폴링한다 | SATISFIED | `subscriberFactory` in `daemon.ts` uses `resolveRpcUrlFromPool()` for both Solana and EVM subscriber creation |
| CONF-01 | 261-01 | config.toml 기존 단일 URL 설정이 1개짜리 Pool로 하위 호환 동작한다 | SATISFIED | Daemon Step 4 registers each config.toml rpc entry as `[url]` (single-entry pool); existing callers pass rpcUrl as fallback; backward compat tests pass |
| CONF-04 | 261-01 | 환경 변수 WAIAAS_RPC_* URL이 Pool 첫 번째 항목으로 추가된다 | SATISFIED | `applyEnvOverrides()` in `loader.ts` maps `WAIAAS_RPC_*` -> `config.rpc.*` before daemon startup; daemon seeds RpcPool from `config.rpc` (env vars already merged); config URLs register first (highest priority) |

No orphaned requirements: all 6 IDs claimed in plan frontmatter are present in REQUIREMENTS.md and mapped to Phase 261. REQUIREMENTS.md status table confirms all 6 marked Complete for Phase 261.

### Anti-Patterns Found

None. Scanned `adapter-pool.ts`, `daemon.ts`, `hot-reload.ts`, and all three test files. No TODO/FIXME/PLACEHOLDER comments, no empty implementations, no stub return values in implementation code.

The three `return null` occurrences in `configKeyToNetwork` are correct behavior (signaling non-network config keys to skip), not stubs.

### Human Verification Required

None. All truths are verifiable programmatically. The integration is between internal daemon components; no external service, visual UI, or real-time behavior is involved.

## Summary

Phase 261 achieves its goal completely. The three plans delivered:

**Plan 261-01 (Wave 1):** Wired RpcPool into AdapterPool with optional constructor parameter. The `resolve()` method uses `rpcPool.getUrl(network)` as primary URL source with `rpcUrl` parameter as fallback. Daemon startup creates an empty RpcPool, seeds config.toml URLs first (highest priority), then registers built-in defaults. `configKeyToNetwork` helper maps config keys to network names. `resolveRpcUrlFromPool` exported for reuse. `rpcPoolInstance` getter on DaemonLifecycle. 27 tests.

**Plan 261-02 (Wave 2):** Hot-reload `reloadRpc()` augmented to reset RpcPool cooldown state for affected networks after adapter eviction. Route handlers, pipeline stages, and balance monitor require no changes — the existing `resolveRpcUrl() -> adapterPool.resolve(chain, network, rpcUrl)` pattern is already forward-compatible. 12 integration tests covering Solana/EVM pool routing, fallback, failure rotation, and cooldown reset.

**Plan 261-03 (Wave 2):** IncomingTxMonitor `subscriberFactory` in daemon.ts updated to use `resolveRpcUrlFromPool()` for both Solana and EVM subscribers. Pool URL is used at subscriber creation time; mid-polling rotation deferred to Phase 264. 12 tests covering pool preference, fallback scenarios, and subscriber creation with pool URLs.

All 51 tests (27 + 12 + 12) pass. TypeScript compilation clean. 6 commits verified in git log.

---

_Verified: 2026-02-25T10:35:00Z_
_Verifier: Claude (gsd-verifier)_
