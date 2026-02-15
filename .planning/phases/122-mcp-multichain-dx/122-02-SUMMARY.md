---
phase: 122-mcp-multichain-dx
plan: 02
subsystem: api
tags: [multichain, network-all, balance, assets, allSettled, mcp, sdk, python-sdk, skill-file]

# Dependency graph
requires:
  - phase: 122-01
    provides: "set_default_network MCP/CLI/SDK, PUT /v1/wallet/default-network"
provides:
  - "GET /v1/wallet/balance?network=all aggregate balance endpoint"
  - "GET /v1/wallet/assets?network=all aggregate assets endpoint"
  - "MCP get_balance/get_assets network=all descriptions"
  - "TS SDK getAllBalances()/getAllAssets() methods"
  - "Python SDK get_all_balances()/get_all_assets() methods"
  - "wallet.skill.md v1.4.8 with all 122-01/02 features"
affects: [admin-ui, mcp-tools, sdk]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Promise.allSettled for partial failure handling on multi-network RPC queries"
    - "wireEvmTokens() extracted helper for ERC-20 token wiring dedup"
    - "TypeScript `as never` cast for runtime polymorphic response on typed OpenAPI routes"

key-files:
  created: []
  modified:
    - packages/daemon/src/api/routes/wallet.ts
    - packages/daemon/src/__tests__/api-wallet-network.test.ts
    - packages/mcp/src/tools/get-balance.ts
    - packages/mcp/src/tools/get-assets.ts
    - packages/mcp/src/__tests__/tools.test.ts
    - packages/sdk/src/client.ts
    - packages/sdk/src/types.ts
    - packages/sdk/src/__tests__/client.test.ts
    - python-sdk/waiaas/client.py
    - python-sdk/waiaas/models.py
    - python-sdk/tests/test_client.py
    - skills/wallet.skill.md

key-decisions:
  - "wireEvmTokens() 헬퍼 추출: assets 핸들러의 ERC-20 와이어링 로직을 network=all과 기존 경로에서 공유"
  - "getAllBalances()/getAllAssets()를 getBalance()/getAssets()와 별도 메서드로 분리: 타입 안전성 우선 (이슈 021 설계 결정과 일치)"
  - "OpenAPI typed route에서 network=all 분기 응답은 `as never` cast로 런타임 분기 처리"

patterns-established:
  - "Promise.allSettled 부분 실패 패턴: 환경 내 네트워크별 RPC 호출을 병렬 실행, 성공/실패 각각 표시"
  - "wireEvmTokens() 재사용 패턴: EVM adapter에 토큰 레지스트리 + ALLOWED_TOKENS 병합 주입"

# Metrics
duration: 8min
completed: 2026-02-15
---

# Phase 122 Plan 02: Multi-Network Aggregate Balance/Assets Summary

**network=all 파라미터로 환경 내 모든 네트워크 잔액/자산 한 번에 조회 + Promise.allSettled 부분 실패 처리 + MCP/SDK/Skill 전체 동기화**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-15T00:24:29Z
- **Completed:** 2026-02-15T00:32:31Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- GET /v1/wallet/balance?network=all: 환경 내 모든 네트워크 잔액을 배열로 반환, 부분 RPC 실패 시 에러 네트워크 표시
- GET /v1/wallet/assets?network=all: 환경 내 모든 네트워크 자산을 배열로 반환, 동일한 부분 실패 처리
- wireEvmTokens() 헬퍼 추출로 ERC-20 토큰 와이어링 코드 중복 제거
- MCP get_balance/get_assets 도구 설명에 network='all' 안내 추가
- TS SDK getAllBalances()/getAllAssets(), Python SDK get_all_balances()/get_all_assets() 메서드 추가
- wallet.skill.md v1.4.8 업데이트: network=all, set_default_network, wallet info, CLI, SDK 섹션

## Task Commits

1. **Task 1: daemon network=all 분기 + 부분 실패 처리 + 테스트** - `972a208` (feat)
2. **Task 2: MCP/SDK network=all 지원 + wallet.skill.md 업데이트** - `c833075` (feat)

## Files Created/Modified
- `packages/daemon/src/api/routes/wallet.ts` - network=all 분기 (balance + assets), wireEvmTokens() 헬퍼 추출
- `packages/daemon/src/__tests__/api-wallet-network.test.ts` - 4개 통합 테스트 추가 (balance all, partial failure, backward compat, assets all)
- `packages/mcp/src/tools/get-balance.ts` - network 파라미터 describe 업데이트
- `packages/mcp/src/tools/get-assets.ts` - network 파라미터 describe 업데이트
- `packages/mcp/src/__tests__/tools.test.ts` - network=all 전달 테스트 2개
- `packages/sdk/src/client.ts` - getAllBalances()/getAllAssets() 메서드 추가
- `packages/sdk/src/types.ts` - MultiNetworkBalance/Assets 타입 정의
- `packages/sdk/src/__tests__/client.test.ts` - getAllBalances/getAllAssets 테스트 2개
- `python-sdk/waiaas/client.py` - get_all_balances()/get_all_assets() 메서드 추가
- `python-sdk/waiaas/models.py` - MultiNetworkBalance/Assets Pydantic 모델 추가
- `python-sdk/tests/test_client.py` - get_all_balances/get_all_assets 테스트 2개
- `skills/wallet.skill.md` - v1.4.8 업데이트 (MCP 도구, CLI, SDK 섹션 추가)

## Decisions Made
- wireEvmTokens() 헬퍼 추출: assets 핸들러의 ERC-20 와이어링 로직이 network=all과 기존 경로에서 모두 필요하여 함수로 추출
- getAllBalances()/getAllAssets()를 별도 메서드로 분리: getBalance({network:'all'})은 반환 타입이 달라져 타입 안전성이 깨지므로, 이슈 021 설계 결정에 따라 별도 메서드 방식 선택
- OpenAPI typed route에서 network=all 응답은 기존 스키마와 다른 shape이므로 `as never` cast로 런타임 분기 처리 (문서에는 별도 설명)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] TypeScript OpenAPI route 타입 불일치 해결**
- **Found during:** Task 1 (daemon balance route)
- **Issue:** network=all 분기에서 반환하는 JSON이 기존 WalletBalanceResponseSchema와 다른 shape이라 TypeScript 컴파일 오류
- **Fix:** `c.json(... as never, 200)` cast 적용, 런타임에서 올바른 JSON 반환됨
- **Files modified:** packages/daemon/src/api/routes/wallet.ts
- **Verification:** `pnpm --filter @waiaas/daemon build` 성공, 테스트 통과
- **Committed in:** 972a208 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** TypeScript 타입 시스템과 런타임 분기의 불일치는 예상 가능한 문제. Cast로 해결, 스코프 변경 없음.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 이슈 021 (멀티체인 통합 잔액 조회) 완전 해결
- SKIL-01 (wallet.skill.md 인터페이스 싱크) 충족
- Phase 122 완료, v1.4.8 마일스톤 내 다음 Phase 진행 가능

## Self-Check: PASSED

- All 12 modified files exist on disk
- Commit 972a208 (Task 1) found
- Commit c833075 (Task 2) found
- Build: `pnpm build` passes (8/8 packages)
- Tests: daemon 12/12, MCP 56/56, SDK 49/49, Python 33/33

---
*Phase: 122-mcp-multichain-dx*
*Completed: 2026-02-15*
