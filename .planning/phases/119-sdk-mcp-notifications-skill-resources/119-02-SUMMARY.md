---
phase: 119-sdk-mcp-notifications-skill-resources
plan: 02
subsystem: api, mcp
tags: [hono, openapi, mcp, resource-template, skills]

# Dependency graph
requires:
  - phase: 118-evm-calldata-encoding
    provides: "utils 라우트 패턴, encode-calldata 에러 코드 패턴"
provides:
  - "GET /v1/skills/:name public REST 엔드포인트 (5개 스킬 서빙)"
  - "SKILL_NOT_FOUND 에러 코드 (SYSTEM 도메인)"
  - "waiaas://skills/{name} MCP ResourceTemplate 리소스"
affects: [mcp, daemon, skills, sdk]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ResourceTemplate 패턴: MCP server.resource() with list callback for dynamic resource listing"
    - "Public stateless file-serving route: readFileSync + VALID_SKILLS whitelist"

key-files:
  created:
    - packages/daemon/src/api/routes/skills.ts
    - packages/mcp/src/resources/skills.ts
  modified:
    - packages/core/src/errors/error-codes.ts
    - packages/core/src/i18n/en.ts
    - packages/core/src/i18n/ko.ts
    - packages/daemon/src/api/routes/index.ts
    - packages/daemon/src/api/server.ts
    - packages/mcp/src/server.ts
    - packages/mcp/src/__tests__/server.test.ts

key-decisions:
  - "SKILL_NOT_FOUND를 SYSTEM 도메인에 배치 (스킬은 시스템 리소스)"
  - "skills 라우트는 public (인증 불필요) -- nonce/health와 동일 레벨"
  - "ResourceTemplate list callback에서 5개 스킬을 정적으로 나열 (VALID_SKILLS 배열 기반)"

patterns-established:
  - "MCP ResourceTemplate: list + read 콜백 분리, apiClient.get 연동 패턴"

# Metrics
duration: 5min
completed: 2026-02-15
---

# Phase 119 Plan 02: Skill Resources Summary

**GET /v1/skills/:name public REST 엔드포인트 + waiaas://skills/{name} MCP ResourceTemplate으로 5개 API 스킬 파일을 AI 에이전트에 in-context 제공**

## Performance

- **Duration:** 5min
- **Started:** 2026-02-14T17:06:40Z
- **Completed:** 2026-02-14T17:11:53Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- SKILL_NOT_FOUND 에러 코드를 SYSTEM 도메인에 추가 (73->74개 에러 코드), en/ko i18n 동기화
- GET /v1/skills/:name public 라우트: 5개 스킬 파일(quickstart, wallet, transactions, policies, admin)을 JSON {name, content}으로 서빙
- waiaas://skills/{name} MCP ResourceTemplate: list에서 5개 스킬 나열, read에서 text/markdown 내용 반환
- server.test.ts: 4개 리소스 그룹 등록 검증 (3 static + 1 template)

## Task Commits

Each task was committed atomically:

1. **Task 1: SKILL_NOT_FOUND 에러 코드 + GET /v1/skills/:name 라우트** - `cd25b43` (feat)
2. **Task 2: MCP 스킬 리소스 ResourceTemplate + 테스트** - `d2ee73b` (feat)

## Files Created/Modified
- `packages/core/src/errors/error-codes.ts` - SKILL_NOT_FOUND 에러 코드 추가 (SYSTEM 도메인)
- `packages/core/src/i18n/en.ts` - SKILL_NOT_FOUND 영문 메시지
- `packages/core/src/i18n/ko.ts` - SKILL_NOT_FOUND 한글 메시지
- `packages/daemon/src/api/routes/skills.ts` - GET /v1/skills/:name 라우트 (public, stateless)
- `packages/daemon/src/api/routes/index.ts` - skillsRoutes barrel export
- `packages/daemon/src/api/server.ts` - skillsRoutes() 등록 (public 영역)
- `packages/mcp/src/resources/skills.ts` - waiaas://skills/{name} ResourceTemplate 리소스
- `packages/mcp/src/server.ts` - registerSkillResources 등록 (4 resource groups)
- `packages/mcp/src/__tests__/server.test.ts` - 4개 리소스 그룹 + ResourceTemplate mock

## Decisions Made
- SKILL_NOT_FOUND를 SYSTEM 도메인에 배치 (스킬은 시스템 리소스)
- skills 라우트는 public (인증 불필요) -- nonce/health와 동일 레벨
- ResourceTemplate list callback에서 5개 스킬을 정적으로 나열 (VALID_SKILLS 배열 기반)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- server.ts가 이미 13개 도구로 업데이트되어 있었음 (plan에서 12개로 기술). 현재 상태 기준으로 정확히 반영.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 5개 스킬 리소스가 MCP resources/list + resources/read로 조회 가능
- daemon GET /v1/skills/:name이 스킬 파일 서빙 준비 완료
- Plan 03 (notifications 등) 진행 가능

## Self-Check: PASSED

- [x] packages/daemon/src/api/routes/skills.ts exists
- [x] packages/mcp/src/resources/skills.ts exists
- [x] 119-02-SUMMARY.md exists
- [x] Commit cd25b43 exists (Task 1)
- [x] Commit d2ee73b exists (Task 2)
- [x] SKILL_NOT_FOUND in error-codes.ts (2 occurrences)
- [x] skillsRoutes in daemon/server.ts (2 occurrences)
- [x] registerSkillResources in mcp/server.ts (2 occurrences)

---
*Phase: 119-sdk-mcp-notifications-skill-resources*
*Completed: 2026-02-15*
