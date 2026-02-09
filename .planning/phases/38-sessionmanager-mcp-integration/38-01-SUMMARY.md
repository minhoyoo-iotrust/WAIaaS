---
phase: "38-sessionmanager-mcp-integration"
plan: "01"
subsystem: "mcp-session-management"
tags: ["ApiClient", "ApiResult", "toToolResult", "toResourceResult", "getState", "SMGI-01", "SMGI-D01", "MCP-integration"]

requires:
  - phase: "37-sessionmanager-core-design"
    provides: "SessionManager 클래스 인터페이스 (getToken/start/dispose, 9개 내부 상태, handleUnauthorized)"
  - phase: "36-토큰-파일-인프라-알림-이벤트"
    provides: "readMcpToken/writeMcpToken 공유 유틸리티"
provides:
  - "ApiClient 래퍼 클래스 설계 (7개 메서드: get/post/put/request/handle401/doFetch/parseResponse)"
  - "ApiResult<T> discriminated union 4종 분기 (ok/error/expired/networkError)"
  - "SessionManager.getState() 4번째 public 메서드 추가 (SMGI-D01)"
  - "toToolResult() 공통 변환 함수 (isError 회피 패턴, H-04 대응)"
  - "toResourceResult() 공통 변환 함수 (resource 만료 안내)"
  - "createMcpServer(apiClient) DI 팩토리 함수 설계"
  - "6개 tool + 3개 resource handler 리팩토링 패턴 (registerXxx factory)"
affects: ["38-02-동시성-생명주기-에러", "39-CLI-Telegram", "40-테스트-설계-문서-통합"]

tech-stack:
  added: []
  patterns: ["ApiClient Authentication Proxy (인증/재시도/에러 캡슐화)", "DI via createMcpServer(apiClient)", "isError 회피 패턴 (H-04 Claude Desktop 연결 해제 방지)"]

key-files:
  created: []
  modified:
    - ".planning/deliverables/38-sdk-mcp-interface.md"

key-decisions:
  - id: "SMGI-D01"
    decision: "getState()를 4번째 public 메서드로 추가. 3-public(getToken/start/dispose) -> 4-public(getToken/getState/start/dispose)"
    rationale: "ApiClient.request()에서 API 호출 전 세션 상태 사전 확인 필요. Research Open Question 1 해결"

patterns-established:
  - "ApiClient Authentication Proxy: 모든 데몬 API 호출을 ApiClient에 위임, 9개 handler의 인증/재시도/에러 처리 일원화"
  - "handle401 3-step: 50ms 대기 -> getToken() 재확인 -> handleUnauthorized() (SM-12/SM-14 연동)"
  - "isError 회피: 세션 만료/네트워크 에러 시 isError 미설정으로 Claude Desktop 연결 유지 (H-04)"
  - "registerXxx factory: 각 tool/resource handler를 (server, apiClient) DI 함수로 모듈화"

duration: "~8 minutes"
completed: "2026-02-09"
---

# Phase 38 Plan 01: ApiClient + tool/resource handler 통합 설계 Summary

**ApiClient 래퍼 클래스(7개 메서드, request 7-step, handle401 3-step), ApiResult<T> discriminated union 4종 분기, toToolResult/toResourceResult 공통 변환 함수, SessionManager.getState() 추가(SMGI-D01), 6개 tool + 3개 resource handler 리팩토링 패턴을 38-sdk-mcp-interface.md 섹션 6.5~6.5.4에 정의**

## Performance

| Metric | Value |
|--------|-------|
| Total tasks | 2 |
| Completed | 2 |
| Deviations | 0 |
| Duration | ~8 minutes |

## Accomplishments

### Task 1: ApiClient 래퍼 클래스 + ApiResult 타입 + getState() 추가 설계

- 문서 헤더에 `v0.9 SessionManager MCP 통합 설계: 2026-02-09 (Phase 38-01)` 추가
- 섹션 6.5 신설: SessionManager MCP 통합 설계 (Phase 38) 도입 개요
- 섹션 6.5.1 신설: SessionManager.getState() 추가 (Phase 38 확장)
  - `getState(): SessionState` public 메서드 정의
  - 설계 결정 SMGI-D01: 3-public -> 4-public 확장
  - Public 메서드 4개 업데이트 테이블 (getToken/getState/start/dispose)
- 섹션 6.5.2 신설: ApiClient 래퍼 클래스 설계 (SMGI-01)
  - 6.5.2.1: ApiResult<T> discriminated union 타입 (4종 분기)
  - 6.5.2.2: ApiClient 클래스 인터페이스 (3 public + 4 private = 7개 메서드)
  - 6.5.2.3: request() 7-Step 절차 테이블
  - 6.5.2.4: handle401() 3-Step 재시도 절차 + 플로우 다이어그램
  - 6.5.2.5: parseResponse() 동작 테이블
  - 6.5.2.6: doFetch() 동작
  - 6.5.2.7: 전체 TypeScript 의사 코드 (~130 lines)
  - 6.5.2.8: console.error 통일 규칙 + 로그 메시지 목록

### Task 2: Tool handler + Resource handler 통합 패턴 설계

- 섹션 6.5.3 신설: Tool Handler 통합 패턴 (SMGI-01)
  - 6.5.3.1: toToolResult() 4가지 분기 (expired/networkError/error/ok) + TypeScript 의사 코드
  - 6.5.3.2: 6개 tool handler 리팩토링 전후 비교 테이블 + send_token/get_balance 예시 코드
  - 6.5.3.3: createMcpServer(apiClient) DI 팩토리 함수 설계 + TypeScript 의사 코드
  - 6.5.3.4: 기존 섹션 5.3 코드와의 관계 정리
- 섹션 6.5.4 신설: Resource Handler 통합 패턴 (SMGI-01)
  - 6.5.4.1: toResourceResult() 4가지 분기 + TypeScript 의사 코드
  - 6.5.4.2: 3개 resource handler 리팩토링 패턴 + wallet-balance 예시 코드
  - 6.5.4.3: Open Question 1/3/4 해결 기록
- 문서 푸터 v0.9 참조 문서에 38-RESEARCH.md 추가

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | ApiClient 래퍼 클래스 + ApiResult 타입 + getState() 설계 | `8afc7fd` | `.planning/deliverables/38-sdk-mcp-interface.md` |
| 2 | Tool handler + Resource handler 통합 패턴 설계 | `687d553` | `.planning/deliverables/38-sdk-mcp-interface.md` |

## Files Modified

| File | Changes |
|------|---------|
| `.planning/deliverables/38-sdk-mcp-interface.md` | +760 lines: v0.9 MCP 통합 헤더, 섹션 6.5/6.5.1/6.5.2/6.5.3/6.5.4 신설 (ApiClient/ApiResult/toToolResult/toResourceResult/getState/createMcpServer), 문서 푸터 참조 추가 |

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| SMGI-D01 | getState()를 4번째 public 메서드로 추가 | ApiClient.request()에서 세션 상태 사전 확인 필요. Research Open Question 1 해결 |

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 38-02 (동시성/생명주기/에러): ApiClient가 확정되어 토큰 로테이션 동시성, 프로세스 생명주기(SIGTERM/재시작), 에러 복구 루프 상세 설계 가능
- Phase 39 (CLI+Telegram): tool/resource handler 패턴이 확정되어 CLI `mcp setup`/`mcp refresh-token` + Telegram `/newsession`의 토큰 파일 갱신 -> handleUnauthorized lazy reload 경로 설계 가능
- Phase 40 (테스트 설계 + 문서 통합): ApiClient/toToolResult/toResourceResult의 테스트 시나리오 기반 확정

## Self-Check: PASSED

---
*Phase: 38-sessionmanager-mcp-integration*
*Completed: 2026-02-09*
