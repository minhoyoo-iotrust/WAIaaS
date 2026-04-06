---
phase: "37-sessionmanager-core-design"
plan: "01"
subsystem: "mcp-session-management"
tags: ["SessionManager", "jose", "decodeJwt", "mcp-token", "JWT", "composition-pattern"]

requires:
  - phase: "36-토큰-파일-인프라-알림-이벤트"
    provides: "getMcpTokenPath/writeMcpToken/readMcpToken 공유 유틸리티, mcp-token 파일 사양"
provides:
  - "SessionManager 클래스 인터페이스 (3 public + 5 internal 메서드, 9개 내부 상태)"
  - "SessionManagerOptions, SessionState 타입 정의"
  - "loadToken() 8-step 토큰 로드 전략 (파일 > env var 우선순위)"
  - "jose decodeJwt 기반 JWT 디코딩 + 방어적 범위 검증 (C-03 대응)"
  - "safeSetTimeout 래퍼, RENEWAL_RATIO/MAX_TIMEOUT_MS/TOKEN_PREFIX 상수"
affects: ["37-02-SessionManager-갱신-실패-reload", "38-MCP-통합", "39-CLI-Telegram"]

tech-stack:
  added: []
  patterns: ["Composition pattern (SessionManager 독립 클래스, MCP SDK 무관)", "Lazy initialization (renewalCount/maxRenewals 서버 응답에서 획득)", "Defensive JWT parsing (범위 검증 C-03)"]

key-files:
  created: []
  modified:
    - ".planning/deliverables/38-sdk-mcp-interface.md"
    - "objectives/v0.9-session-management-automation.md"

key-decisions:
  - id: "SM-01"
    decision: "SessionManager 단일 클래스, MCP SDK 독립 (Composition 패턴)"
    rationale: "MCP SDK v1.x에 세션/인증 lifecycle hook 없음"
  - id: "SM-02"
    decision: "getToken/start/dispose 3개 public 메서드"
    rationale: "최소 인터페이스: tool handler 참조, 프로세스 시작, SIGTERM 정리"
  - id: "SM-03"
    decision: "내부 상태 9개 (token, sessionId, expiresAt, expiresIn, renewalCount, maxRenewals, timer, isRenewing, state)"
    rationale: "갱신 스케줄, 중복 방지, 상태 관리에 필요한 최소 상태"
  - id: "SM-04"
    decision: "토큰 로드 우선순위 파일 > env var"
    rationale: "파일 기반 영속화로 토큰 로테이션 대응. env var는 최초 부트스트랩 용도"
  - id: "SM-05"
    decision: "jose decodeJwt 기반 무검증 디코딩 + 방어적 범위 검증 (C-03 대응)"
    rationale: "MCP Server에 JWT 비밀키 없어 서명 검증 불가. exp 범위 검증으로 조작 토큰 방어"
  - id: "SM-06"
    decision: "renewalCount/maxRenewals 초기값 0/Infinity, 첫 갱신 응답에서 업데이트"
    rationale: "JWT payload에 갱신 정보 미포함. 서버 응답 기반 lazy 초기화"
  - id: "SM-07"
    decision: "데몬 미기동 시 graceful degradation (로컬 JWT exp 기준 동작)"
    rationale: "MCP 프로세스가 데몬보다 먼저 시작될 수 있음"

patterns-established:
  - "Composition pattern: SessionManager를 독립 클래스로 설계하고 tool handler에서 getToken() 참조"
  - "Defensive JWT parsing: jose decodeJwt + 필수 claim 존재 확인 + exp 범위 검증 (과거 10년~미래 1년)"
  - "safeSetTimeout: 32-bit 정수 상한 초과 딜레이를 체이닝으로 분할"

duration: "~5 minutes"
completed: "2026-02-09"
---

# Phase 37 Plan 01: SessionManager 인터페이스 + 토큰 로드 설계 Summary

**SessionManager 클래스 인터페이스(getToken/start/dispose, 9개 내부 상태, Composition 패턴)와 loadToken() 8-step 토큰 로드 전략(파일>env var, jose decodeJwt, C-03 방어적 범위 검증)을 38-sdk-mcp-interface.md 섹션 6.4에 정의**

## Performance

| Metric | Value |
|--------|-------|
| Total tasks | 2 |
| Completed | 2 |
| Deviations | 0 |
| Duration | ~5 minutes |

## Accomplishments

### Task 1: 38-sdk-mcp-interface.md에 SessionManager 설계 섹션 추가

- 문서 헤더에 `v0.9 SessionManager 핵심 설계: 2026-02-09` 추가
- 섹션 6.3에 SessionManager 도입 참조 노트 추가
- 섹션 6.4 신설: `[v0.9] SessionManager 핵심 설계`
  - 섹션 6.4.1: SessionManager 클래스 인터페이스 (SMGR-01)
    - SessionManagerOptions 인터페이스 (baseUrl, dataDir, envToken)
    - SessionState 타입 (`'active' | 'expired' | 'error'`)
    - 내부 상태 9개 테이블
    - Public 메서드 3개 (getToken, start, dispose) 시그니처 + 동작 설명
    - 내부 메서드 5개 (loadToken, scheduleRenewal, renew, handleRenewalError, handleUnauthorized)
    - 상수 3개 (RENEWAL_RATIO, MAX_TIMEOUT_MS, TOKEN_PREFIX)
    - TypeScript 의사 코드 (constructor, getToken, start, dispose, safeSetTimeout)
    - MCP Server 통합 예시 (Composition 패턴)
  - 섹션 6.4.2: 토큰 로드 전략 (SMGR-03)
    - loadToken() 8-Step 절차 테이블
    - 토큰 로드 우선순위 플로우 다이어그램 (파일 > env var)
    - TypeScript 의사 코드 (8 Step 전체)
    - 에러 케이스 3종 테이블
    - 로그 출력 4종 테이블
    - Phase 36 연결 (readMcpToken), jose decodeJwt 사용 근거, C-03 방어적 범위 검증 설명
- MCP 세션 테이블 갱신 항목 `[v0.9] SessionManager 자동 갱신` 반영
- v0.5 참고 섹션에 SessionManager 자동 갱신 노트 추가
- 문서 푸터에 v0.9 참조 문서 섹션 추가

### Task 2: v0.9 objectives에 설계 완료 반영

- 섹션 1.2(SessionManager 인터페이스)에 `[설계 확정 -- Phase 37-01]` 태그 추가
- 섹션 1.3(토큰 로드 전략)에 `[설계 확정 -- Phase 37-01]` 태그 추가
- 영향받는 설계 문서 테이블의 SDK-MCP 행에 `[설계 완료: Phase 37-01]` 표시
- Phase 37-01 설계 결과 섹션 신설: SM-01~SM-07 핵심 설계 결정 7건
- 문서 푸터에 Phase 37-01 업데이트 이력 추가

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | SessionManager 인터페이스 + 토큰 로드 설계 | `c42751b` | `.planning/deliverables/38-sdk-mcp-interface.md` |
| 2 | v0.9 objectives에 설계 완료 반영 | `f985b2b` | `objectives/v0.9-session-management-automation.md` |

## Files Modified

| File | Changes |
|------|---------|
| `.planning/deliverables/38-sdk-mcp-interface.md` | +365 lines: v0.9 헤더, 섹션 6.4/6.4.1/6.4.2 신설 (SessionManager 클래스 인터페이스 + 토큰 로드 전략), 섹션 6.3 참조 노트, MCP 세션 테이블 갱신, 문서 푸터 v0.9 참조 |
| `objectives/v0.9-session-management-automation.md` | +28 lines: [설계 확정] 태그 2건, [설계 완료] 표시, Phase 37-01 설계 결과 섹션 (SM-01~SM-07), 푸터 이력 |

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| SM-01 | SessionManager 단일 클래스, MCP SDK 독립 (Composition 패턴) | MCP SDK v1.x에 세션/인증 lifecycle hook 없음 |
| SM-02 | getToken/start/dispose 3개 public 메서드 | 최소 인터페이스: tool handler 참조, 프로세스 시작, SIGTERM 정리 |
| SM-03 | 내부 상태 9개 | 갱신 스케줄, 중복 방지, 상태 관리에 필요한 최소 상태 |
| SM-04 | 토큰 로드 우선순위 파일 > env var | 파일 기반 영속화로 토큰 로테이션 대응 |
| SM-05 | jose decodeJwt + 방어적 범위 검증 (C-03) | MCP Server에 JWT 비밀키 없어 서명 검증 불가 |
| SM-06 | renewalCount/maxRenewals 초기값 0/Infinity | JWT payload에 갱신 정보 미포함, lazy 초기화 |
| SM-07 | 데몬 미기동 시 graceful degradation | MCP 프로세스가 데몬보다 먼저 시작될 수 있음 |

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 37-02 (갱신/실패/reload): SessionManager 인터페이스가 확정되어 scheduleRenewal, renew, handleRenewalError, handleUnauthorized 상세 설계 가능
- Phase 38 (MCP 통합): SessionManager 클래스와 tool handler 통합 설계 진행 가능
- Phase 39 (CLI+Telegram): loadToken()의 readMcpToken 연동이 확정되어 CLI/Telegram에서 동일 유틸리티 사용 설계 가능

## Self-Check: PASSED

---
*Phase: 37-sessionmanager-core-design*
*Completed: 2026-02-09*
