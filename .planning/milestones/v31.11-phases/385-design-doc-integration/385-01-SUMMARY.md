---
phase: 385-design-doc-integration
plan: 01
subsystem: design
tags: [external-action, design-doc, resolved-action, signer-capability, credential-vault, pipeline-routing, policy, async-tracking]

# Dependency graph
requires:
  - phase: 380-resolved-action-type-system
    provides: ResolvedAction 3-kind union + ISignerCapability 인터페이스
  - phase: 381-credential-vault-infra
    provides: CredentialVault CRUD + DB v55 + Admin UI
  - phase: 382-signer-capabilities
    provides: 기존 4종 어댑터 + HMAC/RSA-PSS + signBytes + Registry
  - phase: 383-pipeline-routing
    provides: 3-way 파이프라인 라우팅 + DB v56 + REST/MCP/SDK 인터페이스
  - phase: 384-policy-tracking
    provides: VENUE_WHITELIST + ACTION_CATEGORY_LIMIT + AsyncTracker 9-state
provides:
  - doc-81 통합 설계 문서 (1184줄, D1~D6 + DB 마이그레이션 + 설계 결정 + 구현 우선순위)
  - m31-12 구현 마일스톤의 단일 입력 문서
affects: [m31-12 구현 마일스톤]

# Tech tracking
tech-stack:
  added: []
  patterns: [10개 설계 문서 → 단일 통합 참조 문서 패턴]

key-files:
  created:
    - internal/design/81-external-action-framework.md
  modified:
    - .planning/ROADMAP.md
    - .planning/REQUIREMENTS.md

key-decisions:
  - "doc-81 번호 사용 (doc-77은 DCent Swap Aggregator로 이미 사용 중)"
  - "D1~D6 섹션 구조로 10개 문서 통합 (Phase 출처 명시)"
  - "구현 우선순위 4 Wave 제안 (타입→CredentialVault→파이프라인→정책+추적)"

patterns-established:
  - "통합 설계 문서: D 섹션별 Phase 출처 표기 + 코드 블록 직접 포함"

requirements-completed: [DOC-01]

# Metrics
duration: 7min
completed: 2026-03-12
---

# Phase 385 Plan 01: doc-81 통합 설계 문서 작성 Summary

**Phase 380~384의 10개 설계 문서를 1184줄 단일 doc-81로 통합 -- D1~D6(타입/서명/Credential/파이프라인/정책/추적) + 36개 설계 결정 테이블 + pitfall 통합 체크리스트**

## Performance

- **Duration:** 7min
- **Started:** 2026-03-12T15:49:43Z
- **Completed:** 2026-03-12T15:56:43Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Phase 380~384의 10개 설계 문서를 D1~D6 섹션 구조로 단일 doc-81(1184줄)에 통합
- 36개 설계 결정을 Phase 출처와 함께 통합 테이블로 정리
- DB 마이그레이션 v55/v56/v57 요약, 구현 우선순위 4 Wave, pitfall 통합 체크리스트 포함
- 부록 3개 (하위 호환 매트릭스, Zod 스키마 목록, REST API 엔드포인트) 포함
- ROADMAP Phase 385 완료 표기 + REQUIREMENTS DOC-01 Complete 표기

## Task Commits

Each task was committed atomically:

1. **Task 1: doc-81 통합 설계 문서 작성** - `765ddc1c` (feat)
2. **Task 2: ROADMAP + REQUIREMENTS 업데이트** - `5a93520a` (chore)

## Files Created/Modified
- `internal/design/81-external-action-framework.md` - External Action Framework 통합 설계 문서 (1184줄)
- `.planning/ROADMAP.md` - Phase 385 plan 완료 표기 + progress 테이블 업데이트
- `.planning/REQUIREMENTS.md` - DOC-01 Complete 표기

## Decisions Made
- doc-81 번호 사용 (doc-77은 DCent Swap Aggregator로 이미 사용 중, doc-78은 Hyperliquid)
- D1~D6 섹션 구조로 통합하여 각 섹션 서두에 소스 Phase 출처 표기
- 구현 우선순위 4 Wave 제안: Wave 1(타입+서명) → Wave 2(CredentialVault) → Wave 3(파이프라인) → Wave 4(정책+추적)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- v31.11 마일스톤 전체 완료 (6/6 phases, 11/11 plans)
- doc-81이 m31-12 구현 마일스톤의 단일 입력 문서로 사용 가능
- 구현 시 doc-81만 참조하여 External Action Framework 전체 구현 가능

---
*Phase: 385-design-doc-integration*
*Completed: 2026-03-12*
