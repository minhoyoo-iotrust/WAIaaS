---
phase: 136-cumulative-spending-engine
plan: 01
subsystem: database, policy-engine, schema
tags: [db-migration, usd-spending, zod-schema, drizzle]
dependency-graph:
  requires: []
  provides:
    - "DB v13: transactions.amount_usd, transactions.reserved_amount_usd columns"
    - "SpendingLimitRulesSchema: daily_limit_usd, monthly_limit_usd fields"
    - "evaluateAndReserve: USD amount DB recording"
    - "releaseReservation: reserved_amount_usd NULL clearing"
  affects:
    - "packages/daemon/src/pipeline/database-policy-engine.ts"
    - "packages/daemon/src/infrastructure/database/migrate.ts"
    - "packages/daemon/src/infrastructure/database/schema.ts"
    - "packages/core/src/schemas/policy.schema.ts"
tech-stack:
  added: []
  patterns:
    - "ALTER TABLE ADD COLUMN REAL for nullable USD amount tracking"
    - "Conditional UPDATE (usdAmount !== undefined) for backward compatibility"
key-files:
  created: []
  modified:
    - "packages/daemon/src/infrastructure/database/migrate.ts"
    - "packages/daemon/src/infrastructure/database/schema.ts"
    - "packages/core/src/schemas/policy.schema.ts"
    - "packages/daemon/src/pipeline/database-policy-engine.ts"
    - "packages/daemon/src/__tests__/migration-chain.test.ts"
    - "packages/daemon/src/__tests__/migration-runner.test.ts"
key-decisions:
  - "amount_usd와 reserved_amount_usd에 동일 값 기록 -- amount_usd는 확정용(CONFIRMED 후 유지), reserved_amount_usd는 대기 상태 누적 집계용(완료/실패 시 NULL)"
  - "usdAmount가 undefined인 경우 기존 동작 그대로 유지 (하위 호환)"
  - "daily_limit_usd/monthly_limit_usd는 .positive()로 0 비허용, 비활성화는 필드 미설정으로 처리"
metrics:
  duration: "5m 21s"
  completed: "2026-02-16"
  tasks: 2
  files-modified: 6
  tests-added: 6
  tests-total-passed: 132
---

# Phase 136 Plan 01: DB v13 + USD 기록 기반 구축 Summary

DB v13 마이그레이션으로 transactions.amount_usd/reserved_amount_usd 컬럼 추가, SpendingLimitRulesSchema에 누적 한도 필드 확장, evaluateAndReserve에서 USD 금액 DB 기록 로직 구축.

## What was done

### Task 1: DB v13 Migration + Drizzle Schema + SpendingLimitRulesSchema Extension
- **migrate.ts**: LATEST_SCHEMA_VERSION 12->13, v13 migration (ALTER TABLE ADD COLUMN amount_usd REAL, reserved_amount_usd REAL), fresh DDL transactions 테이블에 두 컬럼 추가
- **schema.ts**: Drizzle ORM transactions 테이블에 `amountUsd: real('amount_usd')`, `reservedAmountUsd: real('reserved_amount_usd')` 컬럼 추가, `real` import 추가
- **policy.schema.ts**: SpendingLimitRulesSchema에 `daily_limit_usd: z.number().positive().optional()`, `monthly_limit_usd: z.number().positive().optional()` 필드 추가
- Commit: `90e5adb`

### Task 2: evaluateAndReserve USD Recording + Migration Tests
- **database-policy-engine.ts**: evaluateAndReserve 내 usdAmount 전달 시 amount_usd/reserved_amount_usd UPDATE 쿼리 분기 처리 (usdAmount undefined면 기존 동작 유지)
- **database-policy-engine.ts**: releaseReservation에서 `reserved_amount_usd = NULL` 클리어 추가
- **migration-chain.test.ts**: v13 마이그레이션 체인 테스트 6개 추가 (T-15a~f), 기존 v12 assertion 업데이트
- **migration-runner.test.ts**: 테스트 마이그레이션 버전 번호 13/14/15 -> 14/15/16 업데이트 (실제 v13 충돌 방지), LATEST_SCHEMA_VERSION assertion 13으로 갱신
- Commit: `edd1db7`

## Verification Results

| Test Suite | Tests | Status |
|---|---|---|
| migration-chain.test.ts | 38 | PASS |
| migration-runner.test.ts | 19 | PASS |
| database-policy-engine.test.ts | 75 | PASS |
| **Total** | **132** | **ALL PASS** |

- `npx turbo build --filter=@waiaas/core --filter=@waiaas/daemon` -- BUILD SUCCESS
- LATEST_SCHEMA_VERSION === 13 confirmed
- fresh DB + migrated DB schema equivalence confirmed (T-15e)
- v1 -> v13 full chain migration success confirmed (T-15f)

## Deviations from Plan

None -- plan executed exactly as written.

## Success Criteria

- [x] CUMUL-01: transactions 테이블에 amount_usd/reserved_amount_usd 컬럼 추가, DB v13 마이그레이션 성공
- [x] CUMUL-02: evaluateAndReserve에서 usdAmount가 amount_usd/reserved_amount_usd로 기록됨
- [x] CUMUL-03: SpendingLimitRulesSchema에 daily_limit_usd/monthly_limit_usd 필드 추가, Zod 검증 동작
- [x] 모든 기존 테스트 통과 (regression 없음)
