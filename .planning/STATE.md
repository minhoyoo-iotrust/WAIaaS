# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-12)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** v1.4 Phase 77 EVM 어댑터 진행 중 (Plan 01 완료)

## Current Position

Phase: 77 of 81 (EVM 어댑터)
Plan: 1 of 2 in current phase
Status: In progress
Last activity: 2026-02-12 — Completed 77-01-PLAN.md (EVM adapter scaffolding + viem 2.x + 13 tests)

Progress: [████░░░░░░] 33% (4/12 plans)

## Performance Metrics

**Cumulative:** 19 milestones, 75 phases, 174 plans, 488 reqs, 972 tests, 43,775 LOC

## Accumulated Context

### Decisions

Full log in PROJECT.md.
Recent decisions affecting current work:

- v1.4에서 DB 마이그레이션 필수: 스키마 변경 시 ALTER TABLE 증분 마이그레이션 제공 (MIG-01~06)
- ChainError 25개 코드 3-카테고리 (PERMANENT 17/TRANSIENT 4/STALE 4) -- 구현 완료
- Stage 5 완전 의사코드 CONC-01: build->simulate->sign->submit + 에러 분기
- discriminatedUnion 5-type으로 SendTransactionRequestSchema 교체 -- TransactionRequestSchema 구현 완료
- INFRA-05: INSUFFICIENT_FOR_FEE 에러 코드 TX 도메인으로 이동 -- 구현 완료 (DD-04 해소)
- ChainError extends Error (not WAIaaSError) -- chain adapter 내부 에러, Stage 5에서 WAIaaSError 변환
- TransferRequestInput 타입명 (TransferRequest 아님) -- IChainAdapter.TransferRequest 인터페이스와 충돌 방지
- runMigrations() 테스트용 migrations 파라미터 옵션 (기본값 = 전역 MIGRATIONS 배열)
- schema_version v1 설명 'Initial schema (9 tables)'로 정정
- getCurrentNonce는 Solana에서 0 반환 (스텁 아닌 실제 구현) -- EVM 전용 개념
- superRefine uses POLICY_RULES_SCHEMAS map lookup (switch/case 대신) -- 확장성
- 6개 rules 스키마는 module-level const (비공개) -- 내부 검증 전용
- ERC20_ABI uses `as const` for viem type inference -- abi parameter requires literal types
- EvmAdapter에서 _rpcUrl 필드 제거 (noUnusedLocals strict) -- 필요시 재추가
- buildBatch throws BATCH_NOT_SUPPORTED (EVM no native atomic batch)

### Blockers/Concerns

- Pre-existing flaky lifecycle.test.ts -- not blocking
- Pre-existing e2e-errors.test.ts failure -- OpenAPIHono side effect

## Session Continuity

Last session: 2026-02-12
Stopped at: Completed 77-01-PLAN.md (EVM adapter scaffolding)
Resume file: None
