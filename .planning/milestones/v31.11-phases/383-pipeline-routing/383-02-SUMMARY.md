---
phase: 383-pipeline-routing
plan: 02
subsystem: api
tags: [rest-api, mcp, sdk, off-chain, connect-info, action-provider]

requires:
  - phase: 383-pipeline-routing
    provides: 3-way pipeline routing design (Plan 01)
  - phase: 381-credential-vault-infra
    provides: credential REST API + MCP + SDK design
provides:
  - REST API response schema with kind-discriminated union
  - off-chain action query API with actionKind/venue filters
  - MCP action-list-offchain tool design
  - SDK ActionResult union + listOffchainActions + getActionResult
  - connect-info externalActions + supportedVenues capability
  - Authentication matrix for off-chain actions
affects: [384-policy-tracking, 385-design-doc-integration]

tech-stack:
  added: []
  patterns: [kind-discriminated response union, off-chain action query filters]

key-files:
  created:
    - .planning/phases/383-pipeline-routing/design/external-action-interfaces.md
  modified: []

key-decisions:
  - "No separate off-chain endpoint — extend existing POST /v1/actions/:provider/:action"
  - "contractCall response gets optional kind field for backward compat"
  - "New MCP tool action-list-offchain for off-chain history query"
  - "SDK ActionResult is kind-discriminated union"
  - "connect-info exposes externalActions + supportedVenues"
  - "Credential management interfaces reference Phase 381 only (no duplication)"

patterns-established:
  - "kind-discriminated API response union for all action types"
  - "actionKind filter parameter on transaction list endpoints"

requirements-completed: [PIPE-04, PIPE-05]

duration: 5min
completed: 2026-03-12
---

# Phase 383 Plan 02: External Action Interfaces Summary

**off-chain action REST API kind-union 응답 + MCP action-list-offchain 도구 + SDK ActionResult union + connect-info 확장 설계**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-11T15:20:00Z
- **Completed:** 2026-03-11T15:25:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- REST API 응답을 kind-discriminated union으로 확장 (contractCall/signedData/signedHttp/apiDirect)
- off-chain action 조회 API 설계 (actionKind, venue 필터 파라미터)
- MCP action-list-offchain 신규 도구 설계
- SDK에 ActionResult union + listOffchainActions() + getActionResult() 메서드 설계
- connect-info에 externalActions + supportedVenues capability 추가
- 인증 매트릭스 문서화 (action 실행=sessionAuth, credential 관리=masterAuth)

## Task Commits

1. **Task 1: REST API + MCP + SDK off-chain action interface design** - `5dee8069` (docs)

## Files Created/Modified
- `.planning/phases/383-pipeline-routing/design/external-action-interfaces.md` — 628줄, 9개 섹션

## Decisions Made
- 별도 off-chain 엔드포인트 추가 없이 기존 엔드포인트 확장 (DX 일관성)
- contractCall 응답에 kind 필드를 optional로 추가하여 하위 호환
- credential 관리 인터페이스는 Phase 381 설계 참조만 (중복 방지)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 383 완료, Phase 384 (정책 + 추적 확장) 진행 가능
- PIPE-01~PIPE-05 전체 요구사항 커버 완료

---
*Phase: 383-pipeline-routing*
*Completed: 2026-03-12*
