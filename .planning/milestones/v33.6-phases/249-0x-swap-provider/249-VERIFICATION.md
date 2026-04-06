---
phase: 249-0x-swap-provider
verified: 2026-02-23T14:55:00Z
status: passed
score: 5/5 success criteria verified
re_verification: false
---

# Phase 249: 0x Swap Provider Verification Report

**Phase Goal:** AI 에이전트가 EVM 체인에서 0x Swap API v2를 통해 토큰 스왑을 실행할 수 있다
**Verified:** 2026-02-23T14:55:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | ERC-20 토큰 판매 시 approve + swap 두 건의 트랜잭션이 순차 실행되어 스왑이 완료된다 | VERIFIED | `resolve()` returns `[approveRequest, swapRequest]` array when `sellToken` is not native ETH. Test: `ZXSW-04` group (5 tests). Approve calldata starts with `0x095ea7b3`, swap calldata from `quote.transaction.data`. |
| 2 | ETH(네이티브) 판매 시 swap 단일 트랜잭션으로 스왑이 완료된다 | VERIFIED | `resolve()` returns single-element `[swapRequest]` when `sellToken === 0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee`. Test: `ZXSW-05` group (2 tests). |
| 3 | 슬리피지가 기본 1%로 적용되고 5% 초과 지정 시 5%로 클램프된다 | VERIFIED | `clampSlippageBps(input ?? 0, asBps(100), asBps(500))`: undefined maps to 100bps, 1000bps clamps to 500bps, values in-range pass through. Confirmed by runtime trace and `ZXSW-06` group (3 tests). |
| 4 | 유동성 부족(liquidityAvailable=false) 또는 API 에러 시 명확한 에러 메시지가 반환된다 | VERIFIED | `!quote.liquidityAvailable` throws `ChainError('INVALID_INSTRUCTION', 'ethereum', { message: 'No liquidity available for this swap pair' })`. HTTP 400/500 throw `ACTION_API_ERROR`. Tests: `ZXSW-07` (1 test) + `ZXSW-08` (3 tests). |
| 5 | AllowanceHolder 컨트랙트 주소가 지원 체인(Cancun 19체인 + Mantle)별로 정확히 매핑된다 | VERIFIED | `ALLOWANCE_HOLDER_ADDRESSES` map has exactly 20 entries (confirmed by count). All map to `0x0000000000001fF3684f28c67538d4D072C22734`. `getAllowanceHolderAddress()` throws on unsupported chainId. Tests: `ZXSW-09` group (7 tests including size assertion). |

**Score:** 5/5 success criteria verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/actions/src/providers/zerox-swap/config.ts` | ZeroExSwapConfig + ZEROX_SWAP_DEFAULTS + ALLOWANCE_HOLDER_ADDRESSES (20 chains) + CHAIN_ID_MAP + getAllowanceHolderAddress() | VERIFIED | 88 lines, all exports present. 20 chainIds confirmed. |
| `packages/actions/src/providers/zerox-swap/schemas.ts` | PriceResponseSchema + QuoteResponseSchema with Zod .passthrough() | VERIFIED | 67 lines. Both schemas exported with types. `liquidityAvailable: z.boolean()` present. Both use `.passthrough()`. |
| `packages/actions/src/providers/zerox-swap/zerox-api-client.ts` | ZeroExApiClient extending ActionApiClient | VERIFIED | 61 lines. `extends ActionApiClient`. Constructor sets `0x-version: v2` and conditional `0x-api-key`. Both `getPrice()` and `getQuote()` send `chainId` as query param. |
| `packages/actions/src/providers/zerox-swap/index.ts` | ZeroExSwapActionProvider implementing IActionProvider | VERIFIED | 177 lines. Implements `IActionProvider`. `resolve()` returns `ContractCallRequest[]`. ERC-20 vs native ETH detection. AllowanceHolder address validation. Same-token check (SAFE-05). |
| `packages/actions/src/index.ts` | Updated registerBuiltInProviders with real ZeroExSwapActionProvider factory | VERIFIED | Factory creates real `ZeroExSwapActionProvider` with SettingsReader config (not null stub). Re-exports all zerox-swap public API. |
| `packages/actions/src/__tests__/zerox-api-client.test.ts` | Unit tests with MSW covering ZXSW-01/02/03/08/09/10 | VERIFIED | 19 tests, all passing. MSW server intercepts `api.0x.org` endpoints. |
| `packages/actions/src/__tests__/zerox-swap.test.ts` | Unit tests with MSW covering ZXSW-04/05/06/07 + error cases | VERIFIED | 17 tests, all passing. MSW server with sellToken-conditional responses. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `zerox-api-client.ts` | `action-api-client.ts` | `extends ActionApiClient` | WIRED | Line 13: `export class ZeroExApiClient extends ActionApiClient`. Inherits timeout (AbortController) and error handling (ACTION_API_ERROR/ACTION_API_TIMEOUT). |
| `zerox-api-client.ts` | `schemas.ts` | `PriceResponseSchema`, `QuoteResponseSchema` | WIRED | Lines 9-10: imports both schemas. Lines 34 and 51: passes to `this.get()` for Zod validation. |
| `zerox-swap/index.ts` | `zerox-api-client.ts` | `new ZeroExApiClient` | WIRED | Line 19: imports `ZeroExApiClient`. Line 125: `const apiClient = new ZeroExApiClient(this.config, chainId)`. |
| `zerox-swap/index.ts` | `zerox-swap/config.ts` | `getAllowanceHolderAddress`, `CHAIN_ID_MAP` | WIRED | Lines 21-25: imports both. Line 115: uses `CHAIN_ID_MAP`. Line 144: uses `getAllowanceHolderAddress(chainId)`. |
| `packages/actions/src/index.ts` | `zerox-swap/index.ts` | `registerBuiltInProviders` factory | WIRED | Line 9: imports `ZeroExSwapActionProvider`. Lines 76-85: factory reads settings and creates real instance. |

### Requirements Coverage

All 10 requirement IDs from both PLANs are accounted for:

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| ZXSW-01 | 249-01 | ZeroExApiClient가 api.0x.org에 chainId 쿼리 파라미터 + 0x-api-key + 0x-version: v2 헤더로 요청한다 | SATISFIED | Constructor sets `0x-version: v2` unconditionally, `0x-api-key` conditionally when non-empty. `getPrice()`/`getQuote()` both pass `chainId: String(this.chainId)` as query param. 4 tests in ZXSW-01 group. |
| ZXSW-02 | 249-01 | /swap/allowance-holder/price 견적 조회가 Zod 스키마 검증을 거쳐 반환된다 | SATISFIED | `getPrice()` calls `this.get('swap/allowance-holder/price', PriceResponseSchema, ...)`. 2 tests in ZXSW-02 group. |
| ZXSW-03 | 249-01 | /swap/allowance-holder/quote 실행 calldata 조회가 Zod 스키마 검증을 거쳐 반환된다 | SATISFIED | `getQuote()` calls `this.get('swap/allowance-holder/quote', QuoteResponseSchema, ...)`. QuoteResponseSchema extends PriceResponseSchema with `transaction` field. 2 tests in ZXSW-03 group. |
| ZXSW-04 | 249-02 | ZeroExSwapActionProvider가 ERC-20 판매 시 [approve, swap] ContractCallRequest 배열을 반환한다 | SATISFIED | `resolve()` returns `[approveRequest, swapRequest]` when `!isNativeEthSell`. Approve calldata: selector `0x095ea7b3` + padded spender + amount. 5 tests. |
| ZXSW-05 | 249-02 | ZeroExSwapActionProvider가 ETH(네이티브) 판매 시 [swap] 단일 ContractCallRequest를 반환한다 | SATISFIED | `resolve()` returns `[swapRequest]` when `isNativeEthSell`. 2 tests. |
| ZXSW-06 | 249-02 | 슬리피지가 기본 1%(0.01) 적용되고 상한 5%(0.05)로 클램프된다 | SATISFIED | `clampSlippageBps(input.slippageBps ?? 0, asBps(100), asBps(500))`. When 0 (undefined), returns default 100bps. When >500, clamps to 500bps. 3 tests. |
| ZXSW-07 | 249-02 | liquidityAvailable=false 응답 시 명확한 에러가 반환된다 | SATISFIED | `if (!quote.liquidityAvailable)` throws `ChainError` with message `'No liquidity available for this swap pair'`. 1 test. |
| ZXSW-08 | 249-01 | 0x API 에러 응답 시 ACTION_API_ERROR가 반환된다 | SATISFIED | Inherited from `ActionApiClient.get()`: non-ok responses throw `ACTION_API_ERROR` with body text. 3 tests covering 400, 500, and body inclusion. |
| ZXSW-09 | 249-01 | AllowanceHolder 컨트랙트 주소가 chainId 기반으로 정확히 매핑된다 (Cancun 19체인 + Mantle) | SATISFIED | `ALLOWANCE_HOLDER_ADDRESSES` map has 20 entries (1, 10, 56, 130, 137, 1329, 1868, 2741, 5000, 8453, 33139, 34443, 42161, 42220, 43114, 57073, 59144, 80084, 81457, 534352). `getAllowanceHolderAddress()` throws on unsupported chainId. Also validated from `quote.transaction.to` in `resolve()`. 7 tests. |
| ZXSW-10 | 249-01 | 요청 타임아웃 10초(AbortController)가 적용된다 | SATISFIED | `requestTimeoutMs: 10_000` in ZEROX_SWAP_DEFAULTS. Passed to `ActionApiClient` constructor which wraps AbortController. Test uses 50ms timeout + 500ms MSW delay to confirm throws `'timeout'`. 1 test. |

**Orphaned requirements check:** No ZXSW-* IDs mapped to Phase 249 in REQUIREMENTS.md that are missing from the PLANs.

### Anti-Patterns Found

None. Files checked:
- `packages/actions/src/providers/zerox-swap/config.ts` — clean
- `packages/actions/src/providers/zerox-swap/schemas.ts` — clean
- `packages/actions/src/providers/zerox-swap/zerox-api-client.ts` — clean
- `packages/actions/src/providers/zerox-swap/index.ts` — clean (line 29 is a legitimate inline comment)
- `packages/actions/src/index.ts` — real factory (no null stub)

### Human Verification Required

None. All goal criteria are testable programmatically and have passing unit tests.

The following items were verified programmatically and do NOT require human testing:
- Transaction output format (ContractCallRequest array structure)
- Slippage clamping arithmetic
- AllowanceHolder address mapping correctness
- API header and query parameter format
- Error message content

### Test Summary

| Test File | Tests | Result |
|-----------|-------|--------|
| `zerox-api-client.test.ts` | 19 | ALL PASS |
| `zerox-swap.test.ts` | 17 | ALL PASS |
| `slippage.test.ts` | 11 | ALL PASS (regression: no regressions) |
| `jupiter-swap.test.ts` | 13 | ALL PASS (regression: no regressions) |
| **Total @waiaas/actions** | **60** | **ALL PASS** |

### Commits Verified

All 4 commits from SUMMARYs confirmed to exist in git history:
- `7690aeaa` — feat(249-01): add ZeroExApiClient, Zod schemas, and config
- `a48f98b8` — test(249-01): add ZeroExApiClient unit tests with MSW
- `b3dd141d` — feat(249-02): implement ZeroExSwapActionProvider with approve+swap resolution
- `e00d2fce` — test(249-02): add 17 unit tests for ZeroExSwapActionProvider with MSW

---

_Verified: 2026-02-23T14:55:00Z_
_Verifier: Claude (gsd-verifier)_
