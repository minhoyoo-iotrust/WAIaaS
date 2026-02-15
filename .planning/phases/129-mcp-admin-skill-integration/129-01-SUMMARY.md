---
phase: 129-mcp-admin-skill-integration
plan: 01
subsystem: mcp
tags: [mcp, action-provider, dynamic-tools, registered-tool, sdk-1.26]

# Dependency graph
requires:
  - phase: 128-action-provider-api-key
    provides: IActionProvider + ActionProviderRegistry + GET /v1/actions/providers REST API
provides:
  - registerActionProviderTools 함수 -- mcpExpose=true 액션을 MCP 도구로 자동 변환
  - Action Provider MCP 도구 동적 등록 (시작 시 1회, degraded mode 지원)
  - RegisteredTool 참조 Map (향후 remove()/disable() 호출 가능)
affects: [mcp, action-provider, skill-files]

# Tech tracking
tech-stack:
  added: []
  patterns: [fire-and-forget async tool registration, action_ prefix namespace convention, degraded mode on REST failure]

key-files:
  created:
    - packages/mcp/src/tools/action-provider.ts
    - packages/mcp/src/__tests__/action-provider.test.ts
  modified:
    - packages/mcp/src/index.ts

key-decisions:
  - "createMcpServer() 동기 유지 -- action provider 도구는 index.ts에서 connect+start 후 비동기 등록"
  - "fire-and-forget 패턴 -- registerActionProviderTools 실패 시에도 MCP 서버 정상 동작"
  - "도구명 action_{provider}_{action} -- 기존 14개 내장 도구와 네임스페이스 충돌 방지"
  - "RegisteredTool 타입 직접 import -- SDK 1.26.0에서 export 확인"

patterns-established:
  - "action_ prefix: Action Provider MCP 도구는 action_{providerName}_{actionName} 네이밍 규칙"
  - "degraded mode: REST API 의존 기능은 실패 시 silent degradation (에러 로그 + 빈 결과 반환)"
  - "fire-and-forget async: 서버 초기화 이후 비동기 등록은 await 없이 .catch() 핸들링"

# Metrics
duration: 3min
completed: 2026-02-15
---

# Phase 129 Plan 01: Action Provider -> MCP Tool 자동 변환 Summary

**mcpExpose=true Action Provider 액션을 action_{provider}_{action} MCP 도구로 자동 등록 + degraded mode 지원 + 8개 단위 테스트**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-15T09:26:31Z
- **Completed:** 2026-02-15T09:29:25Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- registerActionProviderTools 함수 구현 -- mcpExpose=true 프로바이더의 모든 액션을 MCP 도구로 자동 변환
- REST 조회 실패 시 degraded mode 동작 (14개 내장 도구 유지, 에러 로그만 출력)
- index.ts에서 sessionManager.start() 후 fire-and-forget 패턴으로 호출 (MCP 서버 시작 차단 없음)
- RegisteredTool 참조를 Map<string, RegisteredTool>에 보관하여 향후 remove()/disable() 호출 가능
- 8개 단위 테스트: mcpExpose 필터링, degraded mode, 핸들러 REST 호출, 도구명 형식, walletContext prefix, 빈 params 처리, 빈 프로바이더 목록, 등록 로그 검증

## Task Commits

Each task was committed atomically:

1. **Task 1: registerActionProviderTools 구현** - `7938b28` (feat)
2. **Task 2: index.ts 통합 + 단위 테스트** - `c3d60e2` (feat)

## Files Created/Modified
- `packages/mcp/src/tools/action-provider.ts` - Action Provider -> MCP Tool 변환 + 등록 함수 (110 LOC)
- `packages/mcp/src/index.ts` - main()에서 sessionManager.start() 후 registerActionProviderTools() fire-and-forget 호출
- `packages/mcp/src/__tests__/action-provider.test.ts` - 8개 단위 테스트 (175 LOC)

## Decisions Made
- **createMcpServer() 동기 유지:** action provider 도구 등록은 REST 호출이 필요하므로 비동기. createMcpServer()를 async로 변경하지 않고 index.ts에서 connect+start 후 별도 호출. SDK가 connect() 이후 tool() 호출 시 자동으로 sendToolListChanged() 발동
- **fire-and-forget 패턴:** registerActionProviderTools를 await 하지 않음. 실패해도 MCP 서버는 14개 내장 도구로 계속 동작
- **도구명 action_ prefix:** action_{provider}_{action} 형식으로 기존 14개 내장 도구(send_token, get_balance 등)와 네임스페이스 충돌 방지
- **RegisteredTool 직접 import:** SDK 1.26.0에서 RegisteredTool 타입이 export됨을 확인. ReturnType<McpServer['tool']> 대신 직접 import 사용

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- ACTNP-05 (ActionDefinition -> MCP Tool 자동 변환) 충족
- ACTNP-06 (프로바이더 등록/해제 시 MCP 서버 재시작으로 변경 반영) 충족
- 129-02 (Skill 파일 작성)로 진행 가능
- 기존 157개 테스트 회귀 없음, 신규 8개 테스트 추가 (총 165개)

## Self-Check: PASSED

- All 3 files exist (action-provider.ts, action-provider.test.ts, 129-01-SUMMARY.md)
- All 2 commits verified (7938b28, c3d60e2)
- registerActionProviderTools export confirmed
- index.ts integration confirmed

---
*Phase: 129-mcp-admin-skill-integration*
*Completed: 2026-02-15*
