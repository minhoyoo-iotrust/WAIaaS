---
phase: 120-db-migration-stability
plan: 01
subsystem: database
tags: [sqlite, migration, pushSchema, indexes, TDD]

# Dependency graph
requires:
  - phase: 109-114
    provides: "v6-v9 migration definitions and environment model"
provides:
  - "pushSchema ordering fix (tables -> migrations -> indexes)"
  - "Migration chain tests for v1 and v5 starting points"
  - "Data transformation verification (v3, v6, v7 migrations)"
  - "FK integrity and edge case coverage"
affects: [daemon-startup, migration-stability, future-migrations]

# Tech tracking
tech-stack:
  added: []
  patterns: ["pushSchema 3-step ordering: tables -> migrations -> indexes"]

key-files:
  created:
    - packages/daemon/src/__tests__/migration-chain.test.ts
  modified:
    - packages/daemon/src/infrastructure/database/migrate.ts

key-decisions:
  - "pushSchema 순서를 테이블 -> 마이그레이션 -> 인덱스 3단계로 분리 (MIGR-01 해결)"
  - "v1 DB의 agents 테이블이 존재할 때 wallets 테이블 생성을 스킵하여 v3 마이그레이션 충돌 방지 (MIGR-01b)"

patterns-established:
  - "Migration chain test pattern: historical schema snapshots (v1, v5) with pushSchema integration"
  - "Schema equivalence verification: migrated DB columns must match fresh DB columns"

# Metrics
duration: 6min
completed: 2026-02-15
---

# Phase 120 Plan 01: pushSchema 인덱스 순서 수정 + 마이그레이션 체인 테스트 Summary

**pushSchema() 3-step 순서 수정 (tables->migrations->indexes)으로 기존 DB 시작 실패 버그 해결, 23개 마이그레이션 체인 테스트 추가**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-14T23:35:43Z
- **Completed:** 2026-02-14T23:41:26Z
- **Tasks:** 1 (TDD: RED -> GREEN -> REFACTOR)
- **Files modified:** 2

## Accomplishments
- pushSchema()의 인덱스 생성 순서를 마이그레이션 후로 이동하여 MIGR-01 ("no such column: environment") 버그 해결
- v1 DB (agents 테이블)에서 wallets 테이블 생성 스킵 로직 추가 (v3 마이그레이션 충돌 방지, MIGR-01b)
- v1 및 v5 시작점에서 최신 스키마까지의 전체 마이그레이션 체인 테스트 23개 추가
- v7 environment 매핑, v6 network 백필, v3 이름 변환 등 데이터 변환 정확성 검증
- 기존 migration-runner (19), migration-v6-v8 (9), database (106) 테스트 회귀 없음

## Task Commits

Each task was committed atomically (TDD flow):

1. **RED: Failing migration chain tests** - `d1eb131` (test)
2. **GREEN: Fix pushSchema ordering** - `356e732` (fix)
3. **REFACTOR: Clean up comments** - `71423c8` (refactor)

## Files Created/Modified
- `packages/daemon/src/__tests__/migration-chain.test.ts` - 23개 마이그레이션 체인 테스트 (v1/v5 스냅샷, 스키마 동등성, 데이터 변환, FK 무결성, 엣지 케이스)
- `packages/daemon/src/infrastructure/database/migrate.ts` - pushSchema() 3-step 순서 수정 + agents 테이블 감지 로직

## Decisions Made
- pushSchema()를 3단계로 분리: (1) 테이블 생성 + 버전 기록, (2) 마이그레이션 실행, (3) 인덱스 생성. 인덱스가 최신 스키마 컬럼을 참조하므로 마이그레이션 후 실행해야 안전함.
- v1 DB에서 agents 테이블이 존재하면 wallets 테이블 생성을 스킵. v3 마이그레이션이 agents -> wallets 리네임을 처리하므로, 미리 wallets를 만들면 "table already exists" 충돌 발생.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] v1 DB에서 wallets 테이블 충돌 방지**
- **Found during:** Task 1 GREEN phase
- **Issue:** pushSchema Step 1이 `CREATE TABLE IF NOT EXISTS wallets`를 실행하여 v1 DB에 빈 wallets 테이블을 생성. 이후 v3 마이그레이션의 `ALTER TABLE agents RENAME TO wallets`가 "table already exists"로 실패.
- **Fix:** agents 테이블 존재 여부를 검사하여, 존재하면 wallets 테이블 생성을 스킵하는 로직 추가.
- **Files modified:** packages/daemon/src/infrastructure/database/migrate.ts
- **Verification:** T-3, T-9a-c, T-10b 테스트 모두 통과
- **Committed in:** 356e732 (GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** 계획에 명시되지 않았으나 v1 DB 호환성에 필수적인 수정. 스코프 확대 없음.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- MIGR-01 버그 해결 완료, 기존 DB 환경에서 데몬 시작 가능
- 마이그레이션 체인 테스트가 향후 마이그레이션 추가 시 회귀 방지 역할
- Phase 121 (MCP 고아 프로세스 방지) 진행 가능

## Self-Check: PASSED

- FOUND: packages/daemon/src/__tests__/migration-chain.test.ts
- FOUND: packages/daemon/src/infrastructure/database/migrate.ts
- FOUND: .planning/phases/120-db-migration-stability/120-01-SUMMARY.md
- FOUND: d1eb131 (RED commit)
- FOUND: 356e732 (GREEN commit)
- FOUND: 71423c8 (REFACTOR commit)

---
*Phase: 120-db-migration-stability*
*Completed: 2026-02-15*
