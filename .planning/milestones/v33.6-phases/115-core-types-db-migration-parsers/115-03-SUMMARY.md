---
phase: 115-core-types-db-migration-parsers
plan: 03
subsystem: chain-adapter, evm
tags: [typescript, viem, erc-20, transaction-parsing, signing, tdd]

# Dependency graph
requires:
  - "115-01: ParsedTransaction, ParsedOperation, SignedTransaction 타입 + IChainAdapter 메서드 선언"
provides:
  - "EvmAdapter.parseTransaction() EVM unsigned tx -> ParsedTransaction 파싱"
  - "EvmAdapter.signExternalTransaction() EVM unsigned tx 서명"
  - "parseEvmTransaction() 유틸리티 (tx-parser.ts)"
  - "ERC-20 transfer/approve selector 기반 operation 분류"
affects:
  - "118-pipeline-rest-api-sign (Pipeline에서 EVM parseTransaction 호출)"
  - "119-mcp-sdk-admin-sign (MCP/SDK에서 EVM sign-only API 사용)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "viem parseTransaction alias import (viemParseTransaction) to avoid IChainAdapter method name collision"
    - "Function selector based ERC-20 operation classification (0xa9059cbb, 0x095ea7b3)"
    - "Offline-capable sign-only operations (no RPC connection required)"

key-files:
  created:
    - "packages/adapters/evm/src/tx-parser.ts"
    - "packages/adapters/evm/src/__tests__/evm-sign-only.test.ts"
  modified:
    - "packages/adapters/evm/src/adapter.ts"

key-decisions:
  - "viem parseTransaction을 viemParseTransaction으로 alias import하여 IChainAdapter.parseTransaction 메서드명 충돌 해소"
  - "value + calldata 동시 존재 시 CONTRACT_CALL로 분류 (calldata 우선 원칙)"
  - "signExternalTransaction은 RPC 연결 불필요 (오프라인 서명 가능)"

patterns-established:
  - "EVM tx parsing: selector 기반 분류 패턴 (tx-parser.ts 분리 모듈)"
  - "Sign-only 메서드는 ensureConnected() 호출하지 않음 (로컬 crypto only)"

# Metrics
duration: 6min
completed: 2026-02-15
---

# Phase 115 Plan 03: EVM parseTransaction + signExternalTransaction Summary

**EVM unsigned tx 파싱 유틸리티 (tx-parser.ts) + EvmAdapter parseTransaction/signExternalTransaction 구현, ERC-20 transfer/approve selector 기반 4종 operation 분류, 13개 TDD 테스트**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-14T15:25:17Z
- **Completed:** 2026-02-14T15:31:11Z
- **Tasks:** 2 (TDD RED + GREEN)
- **Files modified:** 3

## Accomplishments
- tx-parser.ts 신규 모듈: parseEvmTransaction()으로 EVM unsigned hex tx를 ParsedTransaction으로 변환
- 4종 operation 분류: NATIVE_TRANSFER (calldata 없음), TOKEN_TRANSFER (ERC-20 transfer selector), APPROVE (ERC-20 approve selector), CONTRACT_CALL (기타)
- EvmAdapter.signExternalTransaction() 구현: viem privateKeyToAccount + signTransaction, RPC 연결 없이 오프라인 서명
- viem parseTransaction import를 viemParseTransaction으로 rename하여 IChainAdapter 메서드명 충돌 해소
- 기존 143개 EVM adapter 테스트 전체 유지 + 13개 신규 테스트 통과

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): 실패 테스트 작성** - `6ded136` (test)
2. **Task 2 (GREEN): tx-parser.ts + adapter.ts 구현** - `05ad097` (feat)

## Files Created/Modified
- `packages/adapters/evm/src/tx-parser.ts` - EVM tx parsing 유틸리티 (94 lines): parseEvmTransaction(), ERC-20 selector 상수
- `packages/adapters/evm/src/adapter.ts` - parseTransaction/signExternalTransaction 실제 구현, viem import rename
- `packages/adapters/evm/src/__tests__/evm-sign-only.test.ts` - TDD 테스트 13개 (232 lines)

## Decisions Made
- viem `parseTransaction`을 `viemParseTransaction`으로 alias import -- IChainAdapter의 `parseTransaction` 메서드와 이름 충돌 방지. 기존 simulateTransaction, signTransaction에서의 호출도 함께 변경.
- value + calldata 동시 존재 시 CONTRACT_CALL로 분류 -- calldata가 있으면 항상 contract interaction으로 간주 (ETH value는 payable function의 msg.value)
- signExternalTransaction은 RPC 연결 불필요 -- ensureConnected() 호출하지 않음, 순수 로컬 crypto 연산만 사용

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] beforeEach import 누락으로 TypeScript 빌드 실패**
- **Found during:** Task 2 (GREEN phase, 빌드 검증)
- **Issue:** evm-sign-only.test.ts에서 beforeEach를 사용하지만 vitest import에 포함하지 않아 TS2304 에러
- **Fix:** `import { describe, it, expect, beforeEach } from 'vitest'`로 수정
- **Files modified:** packages/adapters/evm/src/__tests__/evm-sign-only.test.ts
- **Verification:** `npx turbo run build --filter=@waiaas/adapter-evm` 성공
- **Committed in:** 05ad097 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 Rule 1 bug)
**Impact on plan:** TypeScript 빌드 일관성 유지에 필수. 범위 확장 없음.

## Issues Encountered
None - 모든 문제는 deviation rule로 자동 해결됨.

## User Setup Required
None - 외부 서비스 설정 불필요.

## Next Phase Readiness
- EvmAdapter 22개 IChainAdapter 메서드 중 21개 실제 구현 완료 (sweepAll만 stub 잔여)
- parseTransaction: NATIVE_TRANSFER, TOKEN_TRANSFER, APPROVE, CONTRACT_CALL 4종 정확히 식별
- signExternalTransaction: 오프라인 EIP-1559 서명 정상 작동
- 143 + 13 = 156개 EVM adapter 테스트 전체 통과
- Phase 115 완료, Phase 116 (Pipeline + REST API sign-only) 착수 가능

---
*Phase: 115-core-types-db-migration-parsers, Plan: 03*
*Completed: 2026-02-15*
