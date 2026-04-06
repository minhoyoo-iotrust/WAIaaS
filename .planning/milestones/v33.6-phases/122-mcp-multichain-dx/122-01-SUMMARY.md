---
phase: 122-mcp-multichain-dx
plan: 01
subsystem: api, mcp, sdk, cli
tags: [mcp, sdk, cli, daemon, session-auth, multichain, default-network]

# Dependency graph
requires:
  - phase: 114-multichain-cli-admin-dx
    provides: "PUT /v1/wallets/:id/default-network masterAuth 엔드포인트"
  - phase: 119-sign-tx-mcp-cli-sdk
    provides: "MCP 13 tools + SDK signTransaction 패턴"
provides:
  - "MCP set_default_network 도구 (14번째)"
  - "daemon PUT /v1/wallet/default-network 세션 스코프 엔드포인트"
  - "CLI `waiaas wallet info` + `waiaas wallet set-default-network` 서브커맨드"
  - "TS SDK getWalletInfo() + setDefaultNetwork() 메서드"
  - "Python SDK get_wallet_info() + set_default_network() 메서드"
affects: [skills, admin, mcp-tools-count]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "session-scoped PUT endpoint (wallet.ts) 미러링 masterAuth endpoint"
    - "SDK combined API pattern (getWalletInfo = address + networks)"

key-files:
  created:
    - packages/mcp/src/tools/set-default-network.ts
    - packages/cli/src/commands/wallet.ts
  modified:
    - packages/mcp/src/server.ts
    - packages/mcp/src/__tests__/tools.test.ts
    - packages/mcp/src/__tests__/server.test.ts
    - packages/daemon/src/api/routes/wallet.ts
    - packages/cli/src/index.ts
    - packages/sdk/src/client.ts
    - packages/sdk/src/types.ts
    - packages/sdk/src/index.ts
    - packages/sdk/src/__tests__/client.test.ts
    - python-sdk/waiaas/client.py
    - python-sdk/waiaas/models.py
    - python-sdk/waiaas/__init__.py
    - python-sdk/tests/test_client.py

key-decisions:
  - "세션 스코프 PUT /v1/wallet/default-network를 daemon wallet.ts에 추가 -- MCP 클라이언트가 sessionAuth만 가지므로 masterAuth PUT /wallets/:id/default-network를 직접 호출 불가"
  - "CLI wallet 서브커맨드는 masterAuth로 동작 (daemon 직접 호출)"
  - "Python SDK get_wallet_info()는 availableNetworks 필드를 networks로 매핑"

patterns-established:
  - "session-scoped mutation endpoint: wallet.ts에 PUT 핸들러 추가, walletId를 세션 컨텍스트에서 가져와 masterAuth 엔드포인트와 동일 로직 적용"
  - "CLI 서브커맨드 그룹: commander .command() 안에 .command() 중첩 패턴 (wallet info, wallet set-default-network)"

# Metrics
duration: 8min
completed: 2026-02-15
---

# Phase 122 Plan 01: set_default_network Summary

**MCP 14번째 도구 + 세션 스코프 엔드포인트 + CLI wallet 서브커맨드 + TS/Python SDK 메서드로 모든 인터페이스에서 기본 네트워크 변경 가능**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-15T00:13:16Z
- **Completed:** 2026-02-15T00:21:42Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments
- MCP set_default_network 도구로 에이전트가 기본 네트워크를 변경할 수 있음 (이슈 022 해결)
- daemon에 세션 스코프 PUT /v1/wallet/default-network 엔드포인트 추가 (MCP sessionAuth 호환)
- CLI `waiaas wallet info` + `waiaas wallet set-default-network <network>` 서브커맨드 추가
- TS SDK getWalletInfo() + setDefaultNetwork() + Python SDK get_wallet_info() + set_default_network() 추가
- 총 10개 테스트 추가 (MCP 3, TS SDK 4, Python SDK 3)

## Task Commits

Each task was committed atomically:

1. **Task 1: MCP set_default_network 도구 + CLI wallet 서브커맨드** - `bdd6b93` (feat)
2. **Task 2: TS SDK + Python SDK setDefaultNetwork/getWalletInfo 메서드** - `baf8f38` (feat)

## Files Created/Modified
- `packages/mcp/src/tools/set-default-network.ts` - MCP set_default_network 도구
- `packages/mcp/src/server.ts` - 14번째 도구 등록
- `packages/mcp/src/__tests__/tools.test.ts` - set_default_network 테스트 3개 추가
- `packages/mcp/src/__tests__/server.test.ts` - 도구 수 13 -> 14 업데이트
- `packages/daemon/src/api/routes/wallet.ts` - PUT /v1/wallet/default-network 세션 스코프 엔드포인트
- `packages/cli/src/commands/wallet.ts` - wallet info + set-default-network 서브커맨드
- `packages/cli/src/index.ts` - wallet 서브커맨드 그룹 등록
- `packages/sdk/src/client.ts` - getWalletInfo() + setDefaultNetwork() 메서드
- `packages/sdk/src/types.ts` - WalletInfoResponse, SetDefaultNetworkResponse, WalletNetworkInfo 타입
- `packages/sdk/src/index.ts` - 신규 타입 export
- `packages/sdk/src/__tests__/client.test.ts` - SDK 메서드 테스트 4개 추가
- `python-sdk/waiaas/client.py` - get_wallet_info() + set_default_network() 메서드
- `python-sdk/waiaas/models.py` - WalletInfo, WalletNetworkInfo, SetDefaultNetworkResponse 모델
- `python-sdk/waiaas/__init__.py` - 신규 모델 export
- `python-sdk/tests/test_client.py` - Python SDK 테스트 3개 추가

## Decisions Made
- 세션 스코프 PUT /v1/wallet/default-network를 daemon wallet.ts에 추가: MCP 클라이언트가 sessionAuth 토큰만 가지므로 masterAuth 전용 PUT /wallets/:id/default-network를 직접 호출 불가. walletId를 세션 컨텍스트에서 자동 추출하는 세션 스코프 엔드포인트가 가장 깔끔함.
- CLI wallet 서브커맨드는 masterAuth로 동작: CLI는 사용자가 직접 master password를 제공하므로 masterAuth 엔드포인트 직접 호출.
- Python SDK get_wallet_info()는 daemon의 `availableNetworks` 필드를 `networks`로 매핑: WalletInfo 모델의 `networks` 필드가 MCP get_wallet_info 도구와 동일한 구조를 갖도록.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] server.test.ts 도구 수 하드코딩 업데이트**
- **Found during:** Task 1 (MCP build/test)
- **Issue:** server.test.ts에서 도구 수를 13으로 하드코딩하여 14번째 도구 추가 후 테스트 실패
- **Fix:** `expect(mockTool).toHaveBeenCalledTimes(13)` -> `14`로 업데이트
- **Files modified:** packages/mcp/src/__tests__/server.test.ts
- **Verification:** pnpm --filter @waiaas/mcp test 통과 (155 tests)
- **Committed in:** bdd6b93 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** 테스트 하드코딩 값 업데이트만. 스코프 변경 없음.

## Issues Encountered
- Pre-existing settings-service.test.ts 실패 (SETTING_DEFINITIONS count 32 vs 35) -- 이 플랜과 무관

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- MCP 14 도구 완성, 모든 인터페이스(REST/MCP/CLI/SDK)에서 기본 네트워크 변경 가능
- 이슈 022, 023(SDK 부분) 해결 준비 완료
- 122-02 플랜(get_wallet_info MCP 개선, 이슈 023 나머지)으로 진행 가능

## Self-Check: PASSED

- All 15 files verified present on disk
- Both task commits verified (bdd6b93, baf8f38)
- MCP: 155 tests passed (6 test files)
- SDK: 115 tests passed (5 test files)
- Python SDK: 70 tests passed
- Full monorepo build: 8/8 packages success

---
*Phase: 122-mcp-multichain-dx*
*Completed: 2026-02-15*
