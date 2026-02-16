---
phase: 157-extension-test
plan: 01
subsystem: daemon/tests/extension
tags: [testing, functional, token-transfer, contract-call, policy-engine]
dependency_graph:
  requires: [156-01, 156-02]
  provides: [EXT-01-tests, EXT-02-tests]
  affects: [daemon-test-suite]
tech_stack:
  added: []
  patterns: [extension-functional-test, policy-engine-unit-integration, mock-adapter]
key_files:
  created:
    - packages/daemon/src/__tests__/extension/token-transfer.extension.test.ts
    - packages/daemon/src/__tests__/extension/contract-call.extension.test.ts
  modified: []
decisions:
  - "TOK-X07: EVM checksum -> lowercase case-insensitive 매칭은 DatabasePolicyEngine에서 처리"
  - "CTR-X07: wildcard '*' selector는 METHOD_WHITELIST에서 지원하지 않음 (exact match only) -> METHOD_WHITELIST 미설정이 전체 허용"
  - "CTR-U07: 세션 constraints는 middleware 레벨에서 강제 (policy engine 외부)"
  - "CTR-U08~U10: ContractCallRequest calldata/accounts 모두 Zod optional 필드"
metrics:
  duration: 6min
  completed: 2026-02-17
  tasks: 2
  files: 2
  tests_added: 60
---

# Phase 157 Plan 01: EXT-01/EXT-02 Token Transfer + Contract Call Functional Tests Summary

TOKEN_TRANSFER 32건 + CONTRACT_CALL 28건 = 60건 기능 테스트로 정상 사용 경로의 올바른 동작을 검증

## What Was Done

### Task 1: EXT-01 Token Transfer Functional Tests (32 scenarios)

`token-transfer.extension.test.ts` (848 lines)

| Block | Tests | Coverage |
|-------|-------|----------|
| TOK-U01~U08 | 8 | TransferRequest Zod 파싱, ALLOWED_TOKENS 정책 CRUD, 기본 DENY |
| TOK-U09~U14 | 6 | FeeEstimate (ATA 비용 포함/제외), AssetInfo bigint 직렬화, Zod 검증 |
| TOK-I01~I10 | 10 | SPL/ERC-20 buildTokenTransfer mock, 정책 DB roundtrip, getAssets, estimateFee |
| TOK-X01~X08 | 8 | 네이티브/토큰 정책 분리, Oracle stale/장애, Token-2022, 네트워크 스코핑 |

### Task 2: EXT-02 Contract Call Functional Tests (28 scenarios)

`contract-call.extension.test.ts` (874 lines)

| Block | Tests | Coverage |
|-------|-------|----------|
| CTR-U01~U02 | 2 | EVM/Solana 정상 CONTRACT_CALL 파이프라인 |
| CTR-U03~U07 | 5 | CONTRACT_WHITELIST 미설정/미등록/METHOD 거부/체인 불일치/세션 제약 |
| CTR-U08~U10 | 3 | calldata 미포함/빈 calldata/accounts 미포함 Zod 검증 |
| CTR-S01~S04 | 4 | value 첨부 tier 상향, 시뮬레이션 실패, checksum 정규화, to-programId 불일치 |
| CTR-I01~I06 | 6 | CONTRACT/METHOD_WHITELIST DB roundtrip, 복합 정책, 정책 변경 즉시 반영, 글로벌 vs 월렛 |
| CTR-X01~X08 | 8 | 4-byte selector, programId, SPENDING_LIMIT 복합, 네트워크 스코핑, disabled 무시, 빈 selectors |

## Deviations from Plan

None - plan executed exactly as written.

## Decisions Made

1. **CTR-X07 wildcard METHOD_WHITELIST**: `'*'` selector는 exact match로 처리되어 wildcard로 동작하지 않음. 전체 메서드 허용은 METHOD_WHITELIST 미설정으로 달성.
2. **CTR-U07 세션 constraints**: DatabasePolicyEngine이 아닌 middleware 레벨에서 강제됨. 테스트에서 구조 검증만 수행.
3. **CTR-U08~U10 optional fields**: ContractCallRequest의 calldata, accounts, programId 모두 Zod optional. 누락 시 schema 통과하되 런타임에서 adapter가 검증.

## Verification Results

```
Extension tests:  7 files, 154 passed (60 new + 94 existing)
Security tests:   16 files, 459 passed, 1 skipped
Regression:       None
```

## Self-Check: PASSED

- FOUND: packages/daemon/src/__tests__/extension/token-transfer.extension.test.ts
- FOUND: packages/daemon/src/__tests__/extension/contract-call.extension.test.ts
- FOUND: 61514c0 (Task 1 - EXT-01 token transfer 32 tests)
- FOUND: 91a97d1 (Task 2 - EXT-02 contract call 28 tests)
