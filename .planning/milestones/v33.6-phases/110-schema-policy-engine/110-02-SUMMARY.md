---
phase: 110-schema-policy-engine
plan: 02
subsystem: policy-engine
tags: [allowed-networks, policy-engine, network-scoping, tdd, sqlite, drizzle]

requires:
  - phase: 110-01
    provides: "ALLOWED_NETWORKS PolicyType enum + AllowedNetworksRulesSchema + policies.network Drizzle schema + v8 migration"
  - phase: 109-02
    provides: "policies.network DB column via v8 12-step migration"
provides:
  - "evaluateAllowedNetworks() permissive default network policy evaluation"
  - "4-level resolveOverrides (wallet+network > wallet+null > global+network > global+null)"
  - "evaluateAndReserve() raw SQL network filter"
  - "evaluateBatch() network-aware policy evaluation"
  - "16 TDD tests for ALLOWED_NETWORKS + override + network SQL"
affects: [111-interface-extension, admin-policy-ui, mcp-policy-tools]

tech-stack:
  added: []
  patterns:
    - "4-level policy override resolution (PLCY-D03)"
    - "ALLOWED_NETWORKS permissive default pattern (PLCY-D01)"
    - "evaluateAndReserve raw SQL network filter (PLCY-D05)"

key-files:
  created:
    - "packages/daemon/src/__tests__/allowed-networks-policy.test.ts"
  modified:
    - "packages/daemon/src/pipeline/database-policy-engine.ts"

key-decisions:
  - "ALLOWED_NETWORKS permissive default: 미설정 시 모든 네트워크 허용 (기존 월렛 하위호환)"
  - "resolveOverrides 4단계 typeMap[type] 단일 키 유지 (복합키 불필요, PLCY-D03)"
  - "evaluate() Drizzle WHERE에도 network 필터 추가 (불필요한 행 로드 방지)"
  - "evaluateAndReserve() raw SQL에 network 바인딩 추가 (transaction.network ?? null)"

patterns-established:
  - "4-level override: 낮은 우선순위부터 삽입, 높은 우선순위가 덮어쓰는 패턴"
  - "ALLOWED_NETWORKS Step 4a.5: WHITELIST 직후, ALLOWED_TOKENS 직전"
  - "Network filter OR pattern: (network = ? OR network IS NULL)"

duration: 7min
completed: 2026-02-14
---

# Phase 110 Plan 02: ALLOWED_NETWORKS Policy Engine Summary

**ALLOWED_NETWORKS 정책 평가 + 4단계 override resolveOverrides + evaluateAndReserve network SQL 필터 TDD 구현**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-14T11:36:59Z
- **Completed:** 2026-02-14T11:43:59Z
- **Tasks:** 2 (TDD: RED + GREEN)
- **Files modified:** 2

## Accomplishments

- ALLOWED_NETWORKS 정책 평가 로직 구현: permissive default, case-insensitive 비교, 모든 5-type(TRANSFER, TOKEN_TRANSFER, CONTRACT_CALL, APPROVE, BATCH)에서 동작
- resolveOverrides() 2단계 -> 4단계 확장: wallet+network(1순위) > wallet+null(2순위) > global+network(3순위) > global+null(4순위), 기존 network=NULL 정책 하위호환 100%
- evaluateAndReserve() TOCTOU-safe raw SQL에 `AND (network = ? OR network IS NULL)` 필터 추가
- evaluateBatch() 배치 레벨 ALLOWED_NETWORKS 평가 (Phase A 전에 수행)
- 16개 TDD 테스트 작성 + 55개 기존 테스트 회귀 없음 + 9개 커버리지 감사 테스트 회귀 없음

## Task Commits

Each task was committed atomically:

1. **Task 1: RED -- ALLOWED_NETWORKS + 4-level override + evaluateAndReserve network 테스트** - `2f702cb` (test)
2. **Task 2: GREEN -- evaluateAllowedNetworks + 4-level resolveOverrides + evaluateAndReserve SQL 구현** - `f07f788` (feat)

## Files Created/Modified

- `packages/daemon/src/__tests__/allowed-networks-policy.test.ts` - 16 TDD 테스트 (ALLOWED_NETWORKS 5개, 4-level override 6개, evaluateAndReserve SQL 3개, evaluateBatch 2개)
- `packages/daemon/src/pipeline/database-policy-engine.ts` - evaluateAllowedNetworks(), 4-level resolveOverrides(), evaluate/evaluateAndReserve/evaluateBatch network 지원

## Decisions Made

1. **ALLOWED_NETWORKS permissive default** (PLCY-D01): 정책 미설정 시 모든 네트워크 허용. 기존 월렛에 ALLOWED_NETWORKS 정책이 없으므로 default deny는 기존 트랜잭션 전부 차단하는 치명적 장애 유발.

2. **resolveOverrides 4단계 단일 키 유지** (PLCY-D03): typeMap[type] 단일 키로 같은 type 하나만 남음. 복합키 type:network를 쓰면 같은 type의 2개 정책이 모두 남아 이중 평가 발생.

3. **evaluate() Drizzle WHERE에도 network 필터 추가**: 설계 문서에서는 선택적이라고 했으나, 불필요한 행 로드를 줄이기 위해 추가. resolveOverrides가 이미 필터링하므로 정확성에는 영향 없음.

4. **evaluateAndReserve raw SQL 바인딩**: `transaction.network ?? null`로 바인딩하여 network 미지정 시 `network = NULL` 조건이 되어 기존 동작 보존.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 110 전체 완료: Zod 스키마 전환(110-01) + 정책 엔진 구현(110-02) 모두 완료
- Phase 111(인터페이스 확장)에서 REST API, MCP, SDK에 network 스코프 정책 노출 가능
- evaluateAllowedNetworks + 4-level resolveOverrides가 파이프라인 Stage 3에서 ctx.resolvedNetwork와 연동 준비 완료

## Self-Check: PASSED

- [x] allowed-networks-policy.test.ts exists
- [x] database-policy-engine.ts exists
- [x] 110-02-SUMMARY.md exists
- [x] Commit 2f702cb (Task 1 RED) exists
- [x] Commit f07f788 (Task 2 GREEN) exists
- [x] evaluateAllowedNetworks function present (4 references)
- [x] resolvedNetwork parameter present (14 references)
- [x] network SQL filter present (1 reference)

---
*Phase: 110-schema-policy-engine*
*Completed: 2026-02-14*
