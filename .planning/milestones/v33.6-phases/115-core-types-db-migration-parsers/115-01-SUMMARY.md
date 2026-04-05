---
phase: 115-core-types-db-migration-parsers
plan: 01
subsystem: core, database
tags: [typescript, zod, sqlite, migration, chain-adapter, error-codes]

# Dependency graph
requires: []
provides:
  - "TRANSACTION_STATUSES SSoT 배열에 SIGNED 추가 (10개)"
  - "TRANSACTION_TYPES SSoT 배열에 SIGN 추가 (6개)"
  - "ParsedTransaction, ParsedOperation, ParsedOperationType, SignedTransaction 타입"
  - "IChainAdapter parseTransaction/signExternalTransaction 메서드 선언 (22개)"
  - "ERROR_CODES 4개 신규 TX 도메인 에러 코드 (73개)"
  - "ChainErrorCode 2개 신규 PERMANENT 코드 (29개)"
  - "DB migration v9 (transactions CHECK 제약 갱신)"
affects:
  - "116-solana-adapter-parse-sign"
  - "117-evm-adapter-parse-sign"
  - "118-pipeline-rest-api-sign"
  - "119-mcp-sdk-admin-sign"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "12-step SQLite table recreation for CHECK constraint update"
    - "SSoT array-driven CHECK constraint via inList() helper"
    - "ParsedOperationType union for operation classification"

key-files:
  created: []
  modified:
    - "packages/core/src/enums/transaction.ts"
    - "packages/core/src/interfaces/chain-adapter.types.ts"
    - "packages/core/src/interfaces/IChainAdapter.ts"
    - "packages/core/src/interfaces/index.ts"
    - "packages/core/src/errors/error-codes.ts"
    - "packages/core/src/errors/chain-error.ts"
    - "packages/core/src/index.ts"
    - "packages/daemon/src/infrastructure/database/migrate.ts"

key-decisions:
  - "ParsedOperationType은 5가지: NATIVE_TRANSFER, TOKEN_TRANSFER, CONTRACT_CALL, APPROVE, UNKNOWN"
  - "SignedTransaction에 txHash optional 포함 (EVM은 서명 전 해시 계산 가능)"
  - "v9 migration은 transactions 테이블만 재생성 (다른 테이블 영향 없음)"

patterns-established:
  - "IChainAdapter 신규 메서드 추가 시 SolanaAdapter, EvmAdapter, MockChainAdapter stub 동시 추가"

# Metrics
duration: 8min
completed: 2026-02-15
---

# Phase 115 Plan 01: Core Types + DB Migration Summary

**SSoT 열거형에 SIGNED/SIGN 추가, ParsedTransaction/SignedTransaction 타입 정의, IChainAdapter 2개 메서드 선언, 4+2 에러 코드 추가, DB migration v9로 CHECK 제약 갱신**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-14T15:14:18Z
- **Completed:** 2026-02-14T15:22:35Z
- **Tasks:** 2
- **Files modified:** 17

## Accomplishments
- TRANSACTION_STATUSES 10개, TRANSACTION_TYPES 6개로 확장 (SIGNED, SIGN 추가)
- ParsedTransaction, ParsedOperation, ParsedOperationType, SignedTransaction 4개 신규 타입 정의 및 @waiaas/core export
- IChainAdapter에 parseTransaction(), signExternalTransaction() 선언 (20 -> 22 메서드)
- ERROR_CODES에 INVALID_TRANSACTION, WALLET_NOT_SIGNER, UNSUPPORTED_TX_TYPE, CHAIN_ID_MISMATCH 추가 (69 -> 73개)
- ChainErrorCode에 INVALID_RAW_TRANSACTION, WALLET_NOT_SIGNER 추가 (27 -> 29개)
- DB migration v9: transactions 테이블 12-step 재생성으로 SIGNED/SIGN CHECK 제약 갱신
- LATEST_SCHEMA_VERSION 8 -> 9 업데이트

## Task Commits

Each task was committed atomically:

1. **Task 1: SSoT 열거형 확장 + 타입 정의 + 에러 코드 추가** - `b1ef744` (feat)
2. **Task 2: DB 마이그레이션 v9 + LATEST_SCHEMA_VERSION 업데이트** - `32b7447` (feat)

## Files Created/Modified
- `packages/core/src/enums/transaction.ts` - SIGNED/SIGN 추가
- `packages/core/src/interfaces/chain-adapter.types.ts` - ParsedTransaction, ParsedOperation, ParsedOperationType, SignedTransaction 타입 정의
- `packages/core/src/interfaces/IChainAdapter.ts` - parseTransaction, signExternalTransaction 메서드 선언
- `packages/core/src/interfaces/index.ts` - 신규 타입 re-export
- `packages/core/src/errors/error-codes.ts` - 4개 TX 도메인 에러 코드 추가
- `packages/core/src/errors/chain-error.ts` - 2개 PERMANENT ChainErrorCode 추가
- `packages/core/src/index.ts` - 신규 타입 re-export + 카운트 업데이트
- `packages/core/src/i18n/en.ts` - 4개 에러 메시지 영문 추가
- `packages/core/src/i18n/ko.ts` - 4개 에러 메시지 한글 추가
- `packages/core/src/__tests__/chain-adapter-interface.test.ts` - 22 메서드 검증 + sign-only 타입 import 테스트
- `packages/adapters/evm/src/adapter.ts` - parseTransaction, signExternalTransaction stub 추가
- `packages/adapters/solana/src/adapter.ts` - parseTransaction, signExternalTransaction stub 추가
- `packages/cli/src/__tests__/helpers/daemon-harness.ts` - MockChainAdapter에 2개 메서드 mock 추가
- `packages/daemon/src/infrastructure/database/migrate.ts` - v9 migration + LATEST_SCHEMA_VERSION=9
- `packages/daemon/src/__tests__/migration-runner.test.ts` - 버전 기대값 9로 업데이트
- `packages/daemon/src/__tests__/migration-v6-v8.test.ts` - LATEST_SCHEMA_VERSION 9 검증
- `packages/daemon/src/__tests__/settings-schema-migration.test.ts` - 버전 기대값 9로 업데이트

## Decisions Made
- ParsedOperationType은 NATIVE_TRANSFER, TOKEN_TRANSFER, CONTRACT_CALL, APPROVE, UNKNOWN 5가지로 정의 (BATCH 제외: 외부 트랜잭션은 단일 tx로 제출)
- SignedTransaction.txHash는 optional (EVM은 서명 전 해시 계산 가능, Solana는 제출 후에만 가능)
- v9 migration은 transactions 테이블만 재생성 (SIGNED/SIGN을 CHECK 제약에 포함하기 위함)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] SolanaAdapter, EvmAdapter, MockChainAdapter에 stub 메서드 추가**
- **Found during:** Task 1 (IChainAdapter 메서드 선언 후 빌드)
- **Issue:** IChainAdapter에 2개 메서드 추가 후 implements IChainAdapter인 3개 클래스가 컴파일 실패
- **Fix:** 3개 어댑터에 parseTransaction, signExternalTransaction stub 추가 (Phase 116/117에서 실제 구현 예정)
- **Files modified:** packages/adapters/evm/src/adapter.ts, packages/adapters/solana/src/adapter.ts, packages/cli/src/__tests__/helpers/daemon-harness.ts
- **Verification:** npx turbo run build 성공
- **Committed in:** b1ef744 (Task 1 commit)

**2. [Rule 1 - Bug] i18n en/ko 파일에 4개 에러 메시지 추가**
- **Found during:** Task 1 (core 빌드 시 TS2739 에러)
- **Issue:** ERROR_CODES에 4개 코드 추가 후 i18n Messages 타입이 누락된 키 감지
- **Fix:** en.ts, ko.ts에 INVALID_TRANSACTION, WALLET_NOT_SIGNER, UNSUPPORTED_TX_TYPE, CHAIN_ID_MISMATCH 메시지 추가
- **Files modified:** packages/core/src/i18n/en.ts, packages/core/src/i18n/ko.ts
- **Verification:** npx turbo run build --filter=@waiaas/core 성공
- **Committed in:** b1ef744 (Task 1 commit)

**3. [Rule 1 - Bug] chain-adapter-interface 테스트 22 메서드로 업데이트**
- **Found during:** Task 1 (core 빌드 시 TS1360 에러)
- **Issue:** IChainAdapter 메서드 20->22개 변경 후 테스트의 Record<MethodKeys, true>가 불일치
- **Fix:** 테스트에 parseTransaction, signExternalTransaction 추가, 카운트 20->22 업데이트, sign-only 타입 import 테스트 추가
- **Files modified:** packages/core/src/__tests__/chain-adapter-interface.test.ts
- **Verification:** TypeScript 빌드 성공
- **Committed in:** b1ef744 (Task 1 commit)

**4. [Rule 1 - Bug] 마이그레이션 테스트 버전 기대값 8->9 업데이트**
- **Found during:** Task 2 (마이그레이션 테스트 실행 시 6개 assertion 실패)
- **Issue:** LATEST_SCHEMA_VERSION 8->9 변경 후 테스트들이 하드코딩된 8 기대
- **Fix:** 3개 테스트 파일에서 버전 기대값 8->9로 업데이트
- **Files modified:** packages/daemon/src/__tests__/migration-runner.test.ts, migration-v6-v8.test.ts, settings-schema-migration.test.ts
- **Verification:** 49개 마이그레이션 테스트 전체 통과
- **Committed in:** 32b7447 (Task 2 commit)

---

**Total deviations:** 4 auto-fixed (2 Rule 1 bug, 1 Rule 3 blocking, 1 Rule 1 bug)
**Impact on plan:** 모든 auto-fix는 타입 시스템 일관성과 빌드 성공에 필수적. 범위 확장 없음.

## Issues Encountered
None - 모든 문제는 deviation rule로 자동 해결됨.

## User Setup Required
None - 외부 서비스 설정 불필요.

## Next Phase Readiness
- @waiaas/core 빌드 성공, 모든 신규 타입 export 확인
- @waiaas/daemon 빌드 성공, migration v9 포함
- SolanaAdapter, EvmAdapter에 stub 메서드 준비 완료 (Phase 116, 117에서 실제 구현)
- 49개 마이그레이션 테스트 전체 통과
- Plan 02 (Solana parseTransaction 구현) 즉시 착수 가능

---
*Phase: 115-core-types-db-migration-parsers, Plan: 01*
*Completed: 2026-02-15*
