---
phase: 115-core-types-db-migration-parsers
verified: 2026-02-14T15:37:08Z
status: passed
score: 11/11 must-haves verified
re_verification: false
---

# Phase 115: Core Types + DB Migration + Parsers Verification Report

**Phase Goal:** 모든 downstream 컴포넌트가 의존하는 타입, DB 스키마, unsigned tx 파서가 준비된 상태
**Verified:** 2026-02-14T15:37:08Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | TransactionStatus에 SIGNED, TransactionType에 SIGN이 추가되어 DB CHECK 제약이 업데이트된다 | ✓ VERIFIED | TRANSACTION_STATUSES 배열에 'SIGNED' 포함 (line 13), TRANSACTION_TYPES 배열에 'SIGN' 포함. Migration v9가 CHECK 제약을 `inList(TRANSACTION_STATUSES)`, `inList(TRANSACTION_TYPES)`로 갱신 |
| 2 | ParsedTransaction, ParsedOperation, ParsedOperationType, SignedTransaction 타입이 @waiaas/core에서 export된다 | ✓ VERIFIED | chain-adapter.types.ts에 4개 타입 정의 (lines 205-233), interfaces/index.ts에서 export (lines 20-23), core/src/index.ts에서 재export (lines 132-135) |
| 3 | IChainAdapter에 parseTransaction()과 signExternalTransaction() 메서드가 선언된다 | ✓ VERIFIED | IChainAdapter.ts line 118-121에 2개 메서드 선언, 인터페이스 주석에 "Total: 22" 메서드 카운트 업데이트됨 |
| 4 | DB migration v9가 transactions 테이블의 CHECK 제약을 SIGNED/SIGN 포함으로 업데이트한다 | ✓ VERIFIED | migrate.ts line 892-962에 v9 migration 존재, 12-step 패턴으로 transactions 테이블 재생성, LATEST_SCHEMA_VERSION=9 (line 54) |
| 5 | INVALID_TRANSACTION, WALLET_NOT_SIGNER, UNSUPPORTED_TX_TYPE, CHAIN_ID_MISMATCH 에러 코드가 존재한다 | ✓ VERIFIED | error-codes.ts lines 299-327에 4개 TX 도메인 에러 코드 추가, i18n en.ts/ko.ts에 메시지 추가 |
| 6 | ChainErrorCode에 INVALID_RAW_TRANSACTION, WALLET_NOT_SIGNER가 추가된다 | ✓ VERIFIED | chain-error.ts lines 40-41에 union 타입 추가, lines 78-79에 PERMANENT 카테고리 매핑 |
| 7 | SolanaAdapter.parseTransaction()이 base64 unsigned tx를 받아 ParsedTransaction으로 변환한다 | ✓ VERIFIED | adapter.ts line 1241-1245에 parseTransaction 구현, parseSolanaTransaction()에 위임, tx-parser.ts line 46-91에 실제 파싱 로직 |
| 8 | SystemProgram.transfer가 NATIVE_TRANSFER로 식별되고 to/amount가 추출된다 | ✓ VERIFIED | tx-parser.ts parseSystemInstruction()에서 SYSTEM_TRANSFER_INDEX 처리, 10개 테스트 통과 |
| 9 | EvmAdapter.parseTransaction()이 hex unsigned tx를 받아 ParsedTransaction으로 변환한다 | ✓ VERIFIED | evm/adapter.ts line 809-811에 parseTransaction 구현, parseEvmTransaction()에 위임, evm/tx-parser.ts line 36-94에 실제 파싱 로직 |
| 10 | ERC-20 transfer/approve가 TOKEN_TRANSFER/APPROVE로 식별된다 | ✓ VERIFIED | evm/tx-parser.ts lines 61-82에서 ERC20_TRANSFER_SELECTOR, ERC20_APPROVE_SELECTOR 기반 분류, 13개 테스트 통과 |
| 11 | signExternalTransaction()이 unsigned tx에 서명하여 SignedTransaction을 반환한다 | ✓ VERIFIED | SolanaAdapter line 1247-1302, EvmAdapter line 813-852에 구현, 테스트 통과 |

**Score:** 11/11 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| packages/core/src/enums/transaction.ts | SIGNED/SIGN in SSoT arrays | ✓ VERIFIED | Line 13: 'SIGNED', array length 10개. 'SIGN' 포함, array length 6개 |
| packages/core/src/interfaces/chain-adapter.types.ts | ParsedTransaction, ParsedOperation, ParsedOperationType, SignedTransaction types | ✓ VERIFIED | Lines 205-233: 4개 타입 정의, 주석 "v1.4.7 sign-only types" |
| packages/core/src/interfaces/IChainAdapter.ts | parseTransaction + signExternalTransaction methods | ✓ VERIFIED | Lines 118-121: 2개 메서드 선언, "Total: 22" 주석 |
| packages/daemon/src/infrastructure/database/migrate.ts | v9 migration + LATEST_SCHEMA_VERSION=9 | ✓ VERIFIED | Line 54: LATEST_SCHEMA_VERSION=9, lines 892-962: v9 migration with 12-step pattern |
| packages/core/src/errors/error-codes.ts | 4 new TX domain error codes | ✓ VERIFIED | Lines 299-327: INVALID_TRANSACTION, WALLET_NOT_SIGNER, UNSUPPORTED_TX_TYPE, CHAIN_ID_MISMATCH |
| packages/core/src/errors/chain-error.ts | 2 new PERMANENT ChainErrorCodes | ✓ VERIFIED | Lines 40-41, 78-79: INVALID_RAW_TRANSACTION, WALLET_NOT_SIGNER |
| packages/adapters/solana/src/tx-parser.ts | Solana tx parsing utilities | ✓ VERIFIED | 218 lines, parseSolanaTransaction() + identifyOperation() + 파싱 헬퍼 함수들 |
| packages/adapters/solana/src/adapter.ts | parseTransaction + signExternalTransaction implementations | ✓ VERIFIED | Lines 1241-1302: 2개 메서드 실제 구현 (stub 교체 완료) |
| packages/adapters/solana/src/__tests__/solana-sign-only.test.ts | Tests for parse + sign-only | ✓ VERIFIED | 421 lines, 10개 테스트, 모두 통과 |
| packages/adapters/evm/src/tx-parser.ts | EVM tx parsing utilities | ✓ VERIFIED | 95 lines, parseEvmTransaction() + selector 상수 |
| packages/adapters/evm/src/adapter.ts | parseTransaction + signExternalTransaction implementations | ✓ VERIFIED | Lines 809-852: 2개 메서드 실제 구현, viem parseTransaction alias import |
| packages/adapters/evm/src/__tests__/evm-sign-only.test.ts | Tests for parse + sign-only | ✓ VERIFIED | 232 lines, 13개 테스트, 모두 통과 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| enums/transaction.ts | database/migrate.ts | inList(TRANSACTION_STATUSES/TYPES) | ✓ WIRED | Migration v9 line 907, 917에서 inList() helper 사용, SSoT 배열 직접 참조 |
| chain-adapter.types.ts | IChainAdapter.ts | ParsedTransaction/SignedTransaction type imports | ✓ WIRED | IChainAdapter.ts import 확인, 메서드 시그니처에서 사용 |
| chain-adapter.types.ts | core/src/index.ts | re-export from index | ✓ WIRED | interfaces/index.ts lines 20-23에서 export, core/index.ts lines 132-135에서 재export |
| solana/tx-parser.ts | solana/adapter.ts | parseSolanaTransaction import | ✓ WIRED | adapter.ts line 61 import, line 1244에서 호출 |
| evm/tx-parser.ts | evm/adapter.ts | parseEvmTransaction import | ✓ WIRED | adapter.ts line 34 import, line 810에서 호출 |
| adapters | @waiaas/core | ParsedTransaction/SignedTransaction type imports | ✓ WIRED | solana/adapter.ts line 59, evm/adapter.ts line 32에서 import |

### Requirements Coverage

Phase 115는 다음 requirements를 만족합니다:

| Requirement | Status | Supporting Evidence |
|-------------|--------|---------------------|
| SIGN-09: SIGNED status + SIGN type SSoT | ✓ SATISFIED | Truth 1: TRANSACTION_STATUSES/TYPES 확장 + DB migration v9 |
| SIGN-02: ParsedTransaction types | ✓ SATISFIED | Truth 2: 4개 타입 정의 및 export |
| SIGN-03: IChainAdapter methods | ✓ SATISFIED | Truth 3: 22개 메서드 (20+2) |
| SIGN-04: Error codes | ✓ SATISFIED | Truth 5-6: 4+2개 에러 코드 추가 |
| SIGN-05: Solana parser | ✓ SATISFIED | Truth 7-8: SolanaAdapter parseTransaction + 4종 operation 식별 |
| SIGN-14: EVM parser | ✓ SATISFIED | Truth 9-10: EvmAdapter parseTransaction + 4종 operation 식별 |

### Anti-Patterns Found

No blocking anti-patterns found.

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| (none) | — | — | — |

Scanned files:
- packages/core/src/enums/transaction.ts
- packages/core/src/interfaces/chain-adapter.types.ts
- packages/core/src/interfaces/IChainAdapter.ts
- packages/core/src/errors/error-codes.ts
- packages/core/src/errors/chain-error.ts
- packages/daemon/src/infrastructure/database/migrate.ts
- packages/adapters/solana/src/tx-parser.ts
- packages/adapters/solana/src/adapter.ts
- packages/adapters/evm/src/tx-parser.ts
- packages/adapters/evm/src/adapter.ts

No TODO, FIXME, XXX, HACK, PLACEHOLDER comments found.
No stub implementations (return null, return {}, console.log only).
All implementations are substantive with real logic.

### Human Verification Required

None. All verification can be performed programmatically through:
- TypeScript compilation (type safety)
- Unit tests (behavior verification)
- Build process (integration verification)

### Test Results

**Core package:**
- Build: ✓ PASS (turbo cache hit)
- Tests: N/A (타입 정의만 변경)

**Daemon package:**
- Build: ✓ PASS
- Migration tests: ✓ PASS (49개 테스트 중 34개 migration 관련 통과)

**Solana adapter:**
- Build: ✓ PASS
- Tests: ✓ PASS (74개 테스트 전체 통과, 10개 sign-only 신규)

**EVM adapter:**
- Build: ✓ PASS
- Tests: ✓ PASS (143개 테스트 전체 통과, 13개 sign-only 신규)

**Overall test coverage:**
- Total tests: 847 (daemon) + 74 (solana) + 143 (evm) = 1,064 tests
- Sign-only tests: 23개 신규 (10 Solana + 13 EVM)
- All tests: ✓ PASS

## Summary

Phase 115 goal **ACHIEVED**.

**What was verified:**
1. SSoT enums에 SIGNED/SIGN 추가 완료
2. ParsedTransaction/ParsedOperation/ParsedOperationType/SignedTransaction 타입 정의 및 export 완료
3. IChainAdapter에 2개 메서드 선언 (22개 총 메서드)
4. DB migration v9로 transactions 테이블 CHECK 제약 갱신 완료
5. 6개 에러 코드 추가 (4 TX 도메인 + 2 ChainErrorCode)
6. SolanaAdapter parseTransaction + signExternalTransaction 실제 구현 완료
7. EvmAdapter parseTransaction + signExternalTransaction 실제 구현 완료
8. 모든 타입이 올바르게 wired (import/export 체인 확인)
9. 모든 빌드 통과, 모든 테스트 통과

**Gaps found:** None

**Next phase readiness:**
- Phase 116 (Solana adapter extension) 착수 가능
- Phase 117 (EVM adapter extension) 착수 가능
- Phase 118 (Pipeline + REST API sign-only) 착수 가능
- 모든 downstream 컴포넌트가 의존하는 타입 기반 확립 완료

---

*Verified: 2026-02-14T15:37:08Z*
*Verifier: Claude (gsd-verifier)*
