---
phase: 107-policy-engine-network-extension-design
plan: 01
subsystem: database, policy
tags: [zod, sqlite, drizzle, policy-engine, network-scope, migration]

# Dependency graph
requires:
  - phase: 105-environment-data-model-db-migration
    provides: "EnvironmentType, ENVIRONMENT_NETWORK_MAP, v6a/v6b 마이그레이션 패턴"
  - phase: 106-pipeline-network-resolve-design
    provides: "PipelineContext.resolvedNetwork, resolveNetwork() 순수 함수, ENVIRONMENT_NETWORK_MISMATCH 에러"
provides:
  - "ALLOWED_NETWORKS 11번째 PolicyType 스키마 + 평가 의사코드 + permissive default"
  - "네트워크 스코프 정책 4단계 override 우선순위 + resolveOverrides() 확장 의사코드"
  - "policies 테이블 v8 12-step 재생성 마이그레이션 SQL + pushSchema DDL 동기화"
  - "TransactionParam/IPolicyEngine.evaluate() 인터페이스 확장 설계"
  - "evaluateAndReserve() raw SQL network 필터 변경 명세"
affects: [108-api-interface-network-extension-design, v1.4.6-implementation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "4-level policy override: wallet+network > wallet+null > global+network > global+null"
    - "permissive default for ALLOWED_NETWORKS (vs default deny for ALLOWED_TOKENS)"
    - "12-step SQLite recreation for CHECK constraint updates (v8 패턴)"

key-files:
  created:
    - "docs/71-policy-engine-network-extension-design.md"
  modified: []

key-decisions:
  - "PLCY-D01: ALLOWED_NETWORKS permissive default -- 기존 월렛 하위호환"
  - "PLCY-D02: Stage 3 평가 순서 WHITELIST 직후 -- 네트워크 미허용 시 세부 정책 평가 무의미"
  - "PLCY-D03: resolveOverrides() 4단계 typeMap[type] 단일 키 유지 -- 복합키 불필요 증명"
  - "PLCY-D04: policies.network DB 컬럼으로 (not rules JSON) -- SQL 쿼리 최적화"
  - "PLCY-D05: evaluateAndReserve() raw SQL에 network 필터 직접 추가"

patterns-established:
  - "4-level override: 낮은 우선순위부터 삽입, 높은 우선순위 덮어쓰기"
  - "permissive default PolicyType: 미설정 시 return null (ALLOWED_TOKENS default deny와 대비)"
  - "policies 12-step 재생성: FK dependent 없으므로 단독 재생성 가능"

# Metrics
duration: 6min
completed: 2026-02-14
---

# Phase 107 Plan 01: 정책 엔진 네트워크 확장 설계 Summary

**ALLOWED_NETWORKS 11번째 PolicyType + 4단계 network override + policies v8 12-step 마이그레이션 통합 설계 (docs/71, 8개 섹션)**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-14T05:45:48Z
- **Completed:** 2026-02-14T05:51:51Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- ALLOWED_NETWORKS PolicyType 완전 설계: Zod 스키마(AllowedNetworksRulesSchema) + evaluateAllowedNetworks() 의사코드 + permissive default + Stage 3 평가 순서
- 네트워크 스코프 정책 설계: policies.network nullable 컬럼 + 4단계 override 우선순위 + resolveOverrides() 확장 + 하위호환 증명
- policies v8 12-step 재생성 마이그레이션: network 컬럼 + type CHECK(ALLOWED_NETWORKS 포함) + network CHECK + idx_policies_network 인덱스
- Phase 105/106/107 통합 참조 관계 다이어그램 + v6a->v6b->v8 마이그레이션 순서 + Phase 108 이행 포인트

## Task Commits

Each task was committed atomically:

1. **Task 1: ALLOWED_NETWORKS PolicyType + 네트워크 스코프 정책 설계 (docs/71 섹션 1~8)** - `5eb5839` (feat)

**Note:** 문서가 원자적으로 작성되어 Task 1 커밋에 전체 8개 섹션이 포함됨. Task 2(섹션 6~8)는 동일 커밋에서 완성.

## Files Created/Modified

- `docs/71-policy-engine-network-extension-design.md` - ALLOWED_NETWORKS + 네트워크 스코프 + v8 마이그레이션 통합 설계 (1257줄, 8개 섹션)

## Decisions Made

1. **PLCY-D01: ALLOWED_NETWORKS permissive default** -- 기존 모든 월렛에 정책이 없으므로 default deny하면 전체 트랜잭션 차단. ALLOWED_TOKENS(특정 기능 활성화)와 달리 ALLOWED_NETWORKS(기존 기능 제한)는 permissive가 합리적
2. **PLCY-D02: Stage 3 WHITELIST 직후 배치** -- 네트워크 미허용 시 ALLOWED_TOKENS/CONTRACT_WHITELIST 등 세부 정책 평가 무의미
3. **PLCY-D03: typeMap[type] 단일 키 유지** -- 복합키 `type:network` 사용 시 같은 type 2개 평가 발생. 낮은 우선순위 먼저 삽입/높은 우선순위 덮어쓰기로 단일 키 유지
4. **PLCY-D04: policies.network DB 컬럼** -- rules JSON 내부가 아닌 독립 컬럼으로 SQL 쿼리/인덱스 최적화
5. **PLCY-D05: evaluateAndReserve() raw SQL 직접 변경** -- ORM이 아닌 raw SQL이므로 WHERE 조건 직접 추가
6. **v8 12-step 재생성 선택** -- ALTER TABLE로는 기존 type CHECK에 ALLOWED_NETWORKS 추가 불가. 12-step으로 network 컬럼 + type CHECK + network CHECK 원자적 처리

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- docs/71 설계 완료로 v1.4.6 구현자가 코드 레벨 변경 가능
- Phase 108에서 REST API/MCP/SDK 인터페이스로의 network 필드 노출 설계 가능
- v8 마이그레이션은 v6a(6)->v6b(7) 완료 후 순서 보장

## Self-Check

- [x] docs/71-policy-engine-network-extension-design.md 존재 (1257줄)
- [x] 8개 섹션 모두 작성
- [x] PLCY-01 충족: AllowedNetworksRulesSchema + evaluateAllowedNetworks() + permissive default + 평가 순서
- [x] PLCY-02 충족: 4단계 override + resolveOverrides() 확장 + TransactionParam/IPolicyEngine 확장 + evaluateAndReserve SQL
- [x] PLCY-03 충족: v8 12-step SQL + pushSchema DDL + Drizzle 스키마 + LATEST_SCHEMA_VERSION=8
- [x] 설계 결정 5개 기록 (PLCY-D01~D05)
- [x] Phase 108 이행 포인트 명시
- [x] Task 1 커밋 존재 (5eb5839)

---
*Phase: 107-policy-engine-network-extension-design*
*Completed: 2026-02-14*
