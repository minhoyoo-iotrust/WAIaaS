---
phase: 115-core-types-db-migration-parsers
plan: 02
subsystem: chain-adapter, solana
tags: [solana, transaction-parser, sign-only, ed25519, spl-token]

# Dependency graph
requires:
  - "115-01: Core 타입 확장 + DB migration v9 (ParsedTransaction, SignedTransaction, ChainErrorCode)"
provides:
  - "SolanaAdapter.parseTransaction() -- base64 unsigned tx를 ParsedTransaction으로 변환"
  - "SolanaAdapter.signExternalTransaction() -- base64 unsigned tx에 서명하여 SignedTransaction 반환"
  - "tx-parser.ts -- parseSolanaTransaction() 유틸리티 (NATIVE_TRANSFER, TOKEN_TRANSFER, APPROVE, CONTRACT_CALL 식별)"
affects:
  - "118-pipeline-rest-api-sign"
  - "119-mcp-sdk-admin-sign"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "getCompiledTransactionMessageDecoder() 기반 instruction 식별 (lookup table 회피)"
    - "SystemProgram LE u32 index + LE u64 amount 파싱"
    - "SPL Token 1-byte type prefix 기반 instruction 분류"
    - "Anchor discriminator (first 8 bytes) hex 추출 for CONTRACT_CALL"

key-files:
  created:
    - "packages/adapters/solana/src/tx-parser.ts"
    - "packages/adapters/solana/src/__tests__/solana-sign-only.test.ts"
  modified:
    - "packages/adapters/solana/src/adapter.ts"

key-decisions:
  - "getCompiledTransactionMessageDecoder 사용 (decompileTransactionMessage 대신) -- v0 lookup table 이슈 회피"
  - "parseTransaction은 offline 연산 (RPC 연결 불필요) -- 순수 바이트 파싱"
  - "signExternalTransaction도 offline 연산 -- 기존 signTransaction과 동일한 키 처리 패턴 재사용"

patterns-established:
  - "compiled message decoder -> staticAccounts + instruction indices -> programAddress 식별 패턴"
  - "tx-parser.ts를 별도 모듈로 분리하여 adapter.ts 복잡도 관리"

# Metrics
duration: 5min
completed: 2026-02-15
---

# Phase 115 Plan 02: Solana parseTransaction + signExternalTransaction Summary

**Solana tx-parser.ts로 base64 unsigned tx 파싱 (4종 operation 식별) + adapter.ts에 parseTransaction/signExternalTransaction 구현, 10개 TDD 테스트 통과**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-14T15:25:50Z
- **Completed:** 2026-02-14T15:30:42Z
- **Tasks:** 2 (TDD RED + GREEN)
- **Files modified:** 3

## Accomplishments
- tx-parser.ts 신규 작성: parseSolanaTransaction() 함수가 compiled message decoder로 instruction 식별
  - SystemProgram.transfer -> NATIVE_TRANSFER (to/amount 추출)
  - SPL Token transferChecked -> TOKEN_TRANSFER (token/to/amount 추출)
  - SPL Token approve/approveChecked -> APPROVE (token/delegate 추출)
  - Unknown program -> CONTRACT_CALL (programId + Anchor discriminator hex)
- SolanaAdapter.parseTransaction() 구현: parseSolanaTransaction 위임, offline 연산
- SolanaAdapter.signExternalTransaction() 구현: base64 decode -> signer 검증 -> sign -> re-encode
- 10개 신규 테스트 작성 및 통과, 기존 64개 테스트 회귀 없음 (총 74개)

## Task Commits

Each task was committed atomically:

1. **TDD RED: 실패 테스트 10개 작성** - `5f62875` (test)
2. **TDD GREEN: tx-parser.ts + adapter.ts 구현** - `0c5c0a4` (feat)

_Note: REFACTOR phase 생략 -- 코드가 이미 깔끔하여 변경 불필요_

## Files Created/Modified
- `packages/adapters/solana/src/tx-parser.ts` - Solana tx 파싱 유틸리티 (parseSolanaTransaction, identifyOperation, parseSystemInstruction, parseTokenInstruction)
- `packages/adapters/solana/src/adapter.ts` - parseTransaction + signExternalTransaction 실제 구현 (stub 교체)
- `packages/adapters/solana/src/__tests__/solana-sign-only.test.ts` - 10개 TDD 테스트 (7 parseTransaction + 3 signExternalTransaction)

## Decisions Made
- getCompiledTransactionMessageDecoder 사용: decompileTransactionMessage는 v0 lookup table 없으면 에러 발생, compiled message decoder는 staticAccounts + indices로 충분
- parseTransaction/signExternalTransaction 모두 offline 연산: RPC 연결 없이 동작 (ensureConnected 호출 없음)
- signExternalTransaction에서 기존 signTransaction의 64/32바이트 키 감지 패턴 재사용

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 테스트 파일 unused import 제거**
- **Found during:** TDD GREEN (빌드 검증 시 TS6133 에러)
- **Issue:** solana-sign-only.test.ts에서 SYSTEM_PROGRAM_ADDRESS import 후 미사용
- **Fix:** unused import 제거
- **Files modified:** packages/adapters/solana/src/__tests__/solana-sign-only.test.ts
- **Verification:** npx turbo run build --filter=@waiaas/adapter-solana 성공
- **Committed in:** 0c5c0a4 (GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 Rule 1 bug)
**Impact on plan:** 미미한 import 정리. 범위 확장 없음.

## Issues Encountered
None - 모든 테스트 첫 시도에 통과.

## User Setup Required
None - 외부 서비스 설정 불필요.

## Next Phase Readiness
- SolanaAdapter 22개 메서드 전체 구현 완료 (20 기존 + 2 신규)
- tx-parser.ts가 4종 operation type 식별 (NATIVE_TRANSFER, TOKEN_TRANSFER, APPROVE, CONTRACT_CALL)
- 74개 Solana adapter 테스트 전체 통과
- Plan 03 (EVM parseTransaction 구현) 즉시 착수 가능

---
*Phase: 115-core-types-db-migration-parsers, Plan: 02*
*Completed: 2026-02-15*
