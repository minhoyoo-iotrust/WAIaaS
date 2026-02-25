---
phase: 260-rpc-pool-core-built-in-defaults
verified: 2026-02-25T09:58:00Z
status: gaps_found
score: 8/9 must-haves verified
re_verification: false
gaps:
  - truth: "BUILT_IN_RPC_DEFAULTS is accessible from @waiaas/core public API"
    status: failed
    reason: "BUILT_IN_RPC_DEFAULTS is exported from packages/core/src/rpc/index.ts but NOT included in the named export block in packages/core/src/index.ts. The package entry point (dist/index.js) is generated from src/index.ts, so external consumers cannot import { BUILT_IN_RPC_DEFAULTS } from '@waiaas/core'."
    artifacts:
      - path: "packages/core/src/index.ts"
        issue: "The rpc export block (lines 289-295) lists RpcPool, AllRpcFailedError, RpcPoolOptions, RpcEndpointStatus, RpcRegistryEntry — but BUILT_IN_RPC_DEFAULTS is absent"
    missing:
      - "Add BUILT_IN_RPC_DEFAULTS to the named export block in packages/core/src/index.ts under the v28.6 RPC Pool section"
human_verification: []
---

# Phase 260: RPC Pool Core + Built-in Defaults Verification Report

**Phase Goal:** 네트워크당 복수 RPC를 우선순위 기반으로 로테이션하는 기본 인프라가 동작한다
**Verified:** 2026-02-25T09:58:00Z
**Status:** gaps_found — 1 gap (BUILT_IN_RPC_DEFAULTS not exported from @waiaas/core)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | RpcPool에 네트워크+복수 URL을 등록하면 우선순위 순서대로 getUrl()이 첫 번째 URL을 반환한다 | VERIFIED | rpc-pool.ts lines 132-149; test "should return highest-priority URL" passes |
| 2 | reportFailure(url) 후 getUrl()이 다음 우선순위 URL을 반환한다 | VERIFIED | rpc-pool.ts reportFailure() lines 157-167; test "should return next URL when primary is in cooldown" passes |
| 3 | cooldown(60초 기본) 경과 후 해당 URL이 getUrl() 결과에 복귀한다 | VERIFIED | nowFn injection; test "should apply 60s base cooldown on first failure" validates auto-recovery |
| 4 | 연속 실패 시 cooldown이 지수 증가하며 최대 5분을 넘지 않는다 | VERIFIED | `Math.min(baseCooldownMs * 2^(failures-1), maxCooldownMs)` formula; tests verify 60→120→240→300s cap |
| 5 | 네트워크의 모든 URL이 cooldown이면 AllRpcFailedError가 발생한다 | VERIFIED | Lines 145-149; test "should throw AllRpcFailedError when all URLs are in cooldown" passes |
| 6 | BUILT_IN_RPC_DEFAULTS에 메인넷 6개 네트워크의 기본 RPC URL이 정의되어 있다 | VERIFIED | built-in-defaults.ts: mainnet, ethereum-mainnet, arbitrum-mainnet, optimism-mainnet, base-mainnet, polygon-mainnet |
| 7 | BUILT_IN_RPC_DEFAULTS에 테스트넷 7개 네트워크의 기본 RPC URL이 정의되어 있다 | VERIFIED | built-in-defaults.ts: devnet, testnet, ethereum-sepolia, arbitrum-sepolia, optimism-sepolia, base-sepolia, polygon-amoy |
| 8 | RpcPool.createWithDefaults() 호출 시 13개 네트워크 기본 URL이 자동 등록된다 | VERIFIED | rpc-pool.ts lines 87-93; test "registers all 13 networks" and "hasNetwork returns true for all 13 networks" pass |
| 9 | 빌트인 URL은 https:// 프로토콜을 포함한 완전한 URL이다 | VERIFIED | File inspection confirms all URLs in built-in-defaults.ts use https://; data integrity test "every URL starts with https://" passes |

**Score:** 8/9 truths verified (one gap: BUILT_IN_RPC_DEFAULTS not accessible at @waiaas/core package level)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/core/src/rpc/rpc-pool.ts` | RpcPool class with register, getUrl, reportFailure, cooldown logic | VERIFIED | 241 lines; full implementation: register/getUrl/reportFailure/reportSuccess/reset/resetAll/getStatus/getNetworks/hasNetwork; AllRpcFailedError; RpcPoolOptions |
| `packages/core/src/__tests__/rpc-pool.test.ts` | Unit tests for RPC pool logic (min 150 lines) | VERIFIED | 338 lines; 24 tests covering registration, priority fallback, cooldown, exponential backoff, max cap, all-failed error, recovery, reset, dedup |
| `packages/core/src/rpc/built-in-defaults.ts` | BUILT_IN_RPC_DEFAULTS constant with 13 networks | VERIFIED | 80 lines; Readonly<Record<string, readonly string[]>> with 13 networks confirmed |
| `packages/core/src/__tests__/rpc-pool-defaults.test.ts` | Tests for built-in defaults loading (min 60 lines) | VERIFIED | 198 lines; 18 tests covering data integrity (7), createWithDefaults (6), custom options (2), merge (3) |
| `packages/core/src/rpc/index.ts` | Barrel export for rpc module | VERIFIED | 9 lines; exports RpcPool, AllRpcFailedError, type aliases, and BUILT_IN_RPC_DEFAULTS |
| `packages/core/src/index.ts` | Full @waiaas/core barrel includes BUILT_IN_RPC_DEFAULTS | PARTIAL | RpcPool, AllRpcFailedError and type exports are present; BUILT_IN_RPC_DEFAULTS is ABSENT |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `packages/core/src/rpc/rpc-pool.ts` | `packages/core/src/rpc/built-in-defaults.ts` | `import.*BUILT_IN_RPC_DEFAULTS.*from` | WIRED | Line 11: `import { BUILT_IN_RPC_DEFAULTS } from './built-in-defaults.js';` |
| `packages/core/src/rpc/index.ts` | `packages/core/src/rpc/built-in-defaults.ts` | `export.*BUILT_IN_RPC_DEFAULTS` | WIRED | Line 9: `export { BUILT_IN_RPC_DEFAULTS } from './built-in-defaults.js';` |
| `packages/core/src/index.ts` | `packages/core/src/rpc/index.ts` | `export.*from.*rpc` (PLAN-01 key_link) | PARTIAL | Pattern `from './rpc/index.js'` matches at line 295, but the named export block omits BUILT_IN_RPC_DEFAULTS. RpcPool/AllRpcFailedError are wired; BUILT_IN_RPC_DEFAULTS is not. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| POOL-01 | 260-01 | 네트워크당 N개 RPC URL을 우선순위 순서로 등록할 수 있다 | SATISFIED | `register()` deduplicates and preserves order; test "should preserve priority order" passes |
| POOL-02 | 260-01 | 요청 시 우선순위 순서대로 시도하고 실패 시 다음 엔드포인트로 자동 전환한다 | SATISFIED | `getUrl()` iterates entries in priority order, skips cooldown entries |
| POOL-03 | 260-01 | 429/408/5xx 응답 시 해당 RPC에 cooldown 적용 (60초 기본, 지수 증가, 최대 5분) | SATISFIED | `reportFailure()` applies exponential cooldown; defaults 60s base, 300s max; formula verified |
| POOL-04 | 260-01 | cooldown 중인 RPC를 자동 스킵하고 cooldown 해제 시 자동 복귀한다 | SATISFIED | `getUrl()` checks `now >= entry.cooldownUntil` — auto-skip and auto-recovery without explicit call |
| POOL-05 | 260-01 | 네트워크의 전체 RPC가 실패하면 에러를 전파한다 | SATISFIED | `AllRpcFailedError` thrown with network + urls when all entries are in cooldown |
| DFLT-01 | 260-02 | 메인넷 6개 네트워크에 빌트인 기본 RPC 목록을 제공한다 | SATISFIED | built-in-defaults.ts contains all 6 mainnet networks with correct URLs |
| DFLT-02 | 260-02 | 테스트넷 7개 네트워크에 빌트인 기본 RPC 목록을 제공한다 | SATISFIED | built-in-defaults.ts contains all 7 testnet networks with correct URLs |
| DFLT-03 | 260-02 | 설정 미지정 시 빌트인 기본값으로 자동 동작한다 | PARTIAL | `RpcPool.createWithDefaults()` factory is implemented and works. However, BUILT_IN_RPC_DEFAULTS is not accessible from `@waiaas/core` public API — only from internal module path. External consumers cannot discover defaults without being able to import the constant. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `packages/core/src/rpc/rpc-pool.ts` | 206 | `return []` | Info | Intentional: `getStatus()` returns empty array for unregistered network — documented behavior, not a stub |

No TODO/FIXME/placeholder/stub patterns found in any phase-created files.

### Human Verification Required

None — all observable behaviors verified programmatically via 42 passing unit tests and file inspection.

### Gaps Summary

**1 gap found: BUILT_IN_RPC_DEFAULTS not exported from @waiaas/core**

`rpc/index.ts` correctly exports `BUILT_IN_RPC_DEFAULTS` from `built-in-defaults.ts`. However, `packages/core/src/index.ts` — the package entry point — lists only `RpcPool`, `AllRpcFailedError`, and type aliases in its rpc export block. `BUILT_IN_RPC_DEFAULTS` is missing.

This means external consumers calling `import { BUILT_IN_RPC_DEFAULTS } from '@waiaas/core'` will get a TypeScript compile error and runtime module error. The PLAN-02 success criteria explicitly required "Exports accessible from @waiaas/core".

**Fix required:** Add `BUILT_IN_RPC_DEFAULTS` to the named export block in `packages/core/src/index.ts` (lines 289-295):

```typescript
// v28.6 RPC Pool (priority-based URL rotation with cooldown)
export {
  RpcPool,
  AllRpcFailedError,
  BUILT_IN_RPC_DEFAULTS,          // ADD THIS LINE
  type RpcPoolOptions,
  type RpcEndpointStatus,
  type RpcRegistryEntry,
} from './rpc/index.js';
```

**All other aspects of Phase 260 are fully implemented:**
- 42 tests pass (24 core + 18 defaults)
- TypeScript typecheck clean
- All 5 POOL-* requirements satisfied (RpcPool core: priority, fallback, cooldown, auto-recovery, all-failed error)
- DFLT-01/02 satisfied (13 networks with correct https:// URLs, no duplicates)
- All key links wired except the one missing re-export
- Commits verified: 9bcc7e28, bdfcde26, 97926b65, 38c96ae3

---

_Verified: 2026-02-25T09:58:00Z_
_Verifier: Claude (gsd-verifier)_
