---
phase: "38-sessionmanager-mcp-integration"
plan: "02"
subsystem: "mcp-session-management"
tags: ["SMGI-02", "SMGI-03", "SMGI-04", "동시성", "프로세스-생명주기", "에러-복구-루프", "isError-회피", "degraded-mode", "stdout-오염-방지", "SMGI-D02", "SMGI-D03", "SMGI-D04"]

requires:
  - phase: "38-sessionmanager-mcp-integration"
    plan: "01"
    provides: "ApiClient 래퍼 클래스 (SMGI-D01 getState 포함), toToolResult/toResourceResult 공통 변환 함수"
  - phase: "37-sessionmanager-core-design"
    provides: "SessionManager 핵심 설계 (SM-01~SM-14), safeSetTimeout, handleUnauthorized"
  - phase: "36-토큰-파일-인프라-알림-이벤트"
    provides: "readMcpToken/writeMcpToken 공유 유틸리티"
provides:
  - "토큰 로테이션 동시성 시퀀스 다이어그램 + 50ms 대기 근거 (SMGI-D02)"
  - "MCP 프로세스 5단계 생명주기 + degraded mode 정의 (SMGI-03)"
  - "에러 복구 루프 startRecoveryLoop() 60초 polling 설계 (SMGI-D03)"
  - "Claude Desktop 재시작/프로세스 kill 시나리오 토큰 복원 보장"
  - "isError 사용 원칙 5종 + 안내 메시지 JSON 3종 (SMGI-04)"
  - "ApiResult<T> killSwitch 분기 확장"
  - "stdout 오염 방지 규칙 + 로그 접두사 규약 (SMGI-D04)"
  - "Phase 38 설계 결정 요약 테이블 (SMGI-D01~D04)"
affects: ["40-테스트-설계-문서-통합"]

tech-stack:
  added: []
  patterns: ["Recovery loop (60초 polling, safeSetTimeout 체이닝)", "Degraded mode (start 실패 시 MCP Server 정상 기동)", "isError 회피 패턴 확장 (killSwitch 추가)", "stdout 오염 방지 (console.error 통일)"]

key-files:
  created: []
  modified:
    - ".planning/deliverables/38-sdk-mcp-interface.md"
    - "objectives/v0.9-session-management-automation.md"

key-decisions:
  - id: "SMGI-D02"
    decision: "Mutex/Lock 미사용. Node.js 단일 스레드에서 getToken() 동기 반환 + 401 재시도가 충분"
    rationale: "갱신 중 tool 호출 차단 시 사용자 체감 지연 발생. 50ms 대기로 시간차 안전 처리"
  - id: "SMGI-D03"
    decision: "에러 복구 루프 SessionManager 소속, 60초 polling"
    rationale: "fs.watch 대신 안정적 polling. SM-12 lazy reload와 일관된 접근. SessionManager가 state 전이 책임"
  - id: "SMGI-D04"
    decision: "console.log 사용 금지, 모든 내부 로그 console.error로 통일"
    rationale: "stdio transport stdout 오염 시 JSON-RPC 파싱 실패 → 즉시 연결 해제"

patterns-established:
  - "Recovery loop: expired/error 상태에서 60초 간격 readMcpToken() polling, 유효 토큰 발견 시 active 전환 + scheduleRenewal()"
  - "Degraded mode: SessionManager.start() 실패해도 MCP Server 정상 기동, tool 호출 시 session_expired 안내"
  - "isError 회피 확장: killSwitch(503)도 isError 미설정. expired/networkError/killSwitch 3종 비-isError"
  - "stdout 오염 방지: 모듈별 로그 접두사 [waiaas-mcp:session]/[waiaas-mcp:api-client]/[waiaas-mcp]"

duration: "~6 minutes"
completed: "2026-02-09"
---

# Phase 38 Plan 02: 동시성 + 프로세스 생명주기 + 에러 처리 설계 Summary

**토큰 로테이션 동시성 시퀀스 다이어그램(50ms 대기 + 401 재시도, SMGI-D02), MCP 프로세스 5단계 생명주기(degraded mode + startRecoveryLoop 60초 polling, SMGI-D03), Claude Desktop 에러 처리 전략(isError 회피 5종 + 안내 메시지 JSON 3종 + stdout 오염 방지, SMGI-D04)을 38-sdk-mcp-interface.md 섹션 6.5.5~6.5.7에 정의하고, objectives에 Phase 38 설계 결과 반영**

## Performance

| Metric | Value |
|--------|-------|
| Total tasks | 2 |
| Completed | 2 |
| Deviations | 0 |
| Duration | ~6 minutes |

## Accomplishments

### Task 1: 동시성 + 프로세스 생명주기 + 에러 복구 루프 설계

- 문서 헤더에 `Phase 38-02: 동시성 + 생명주기 + 에러 처리` 추가
- 섹션 6.5.5 신설: 토큰 로테이션 동시성 처리 (SMGI-02)
  - 6.5.5.1: 갱신 중 tool 호출 시나리오 시퀀스 다이어그램 (정상 케이스)
  - 6.5.5.2: T1~T2 사이 경쟁 시나리오 (401 발생 케이스)
  - 6.5.5.3: 50ms 대기 근거 테이블 (항목별 시간 + 안전 마진)
  - 6.5.5.4: 동시성 보장 테이블 (5종 시나리오 × 복구 방법)
  - 6.5.5.5: 설계 결정 SMGI-D02
- 섹션 6.5.6 신설: MCP 프로세스 생명주기 (SMGI-03)
  - 6.5.6.1: index.ts 엔트리포인트 생명주기 5단계 테이블
  - 6.5.6.2: Degraded mode 정의 (진입 조건, 상태, 목적 테이블)
  - 6.5.6.3: 에러 복구 루프 설계 (startRecoveryLoop/stopRecoveryLoop, 60초 polling, TypeScript 의사 코드, 내부 상태 10개로 확장, 설계 결정 SMGI-D03)
  - 6.5.6.4: Claude Desktop 재시작 시나리오 (파일 상태 × env var 상태 매트릭스)
  - 6.5.6.5: 갱신 도중 프로세스 kill 시나리오 (kill 시점 × 파일/메모리 상태 매트릭스, SIGTERM 동작)
  - 6.5.6.6: TypeScript 의사 코드 -- index.ts main() 함수
- Open Question 2 해결 기록 (에러 복구 루프 → 섹션 6.5.6 참조)

### Task 2: Claude Desktop 에러 처리 + objectives 반영

- 섹션 6.5.7 신설: Claude Desktop 에러 처리 전략 (SMGI-04)
  - 6.5.7.1: isError 사용 원칙 테이블 (5종 상황 × isError 설정 × 근거)
  - 6.5.7.2: 세션 만료 안내 메시지 형식 (JSON + 필드 용도 테이블)
  - 6.5.7.3: 데몬 미가동 안내 메시지 형식 (JSON)
  - 6.5.7.4: Kill Switch 활성 안내 메시지 형식 (JSON + parseResponse 503 분기 + ApiResult killSwitch 확장 + toToolResult 분기 추가)
  - 6.5.7.5: 반복 에러 연결 해제 방지 종합 전략 테이블 (4가지 전략 × 대응 에러)
  - 6.5.7.6: stdout 오염 방지 규칙 (허용/금지 테이블, 로그 접두사 규약, 설계 결정 SMGI-D04)
  - 6.5.7.7: Phase 38 설계 결정 요약 테이블 (SMGI-D01~D04 × 근거 × 섹션)
- 문서 푸터에 Phase 38-02 참조 + v0.9-PITFALLS.md/MCP Protocol stdio 사양 추가
- objectives: SDK-MCP 행 [설계 완료: Phase 37+38] 업데이트
- objectives: 섹션 4 제목에 [설계 확정 -- Phase 38] 태그 추가
- objectives: 성공 기준 #1에 [설계 확정 -- Phase 37 + 38] 태그 추가
- objectives: Phase 38-01 설계 결과 섹션 신설 (SMGI-D01 1건)
- objectives: Phase 38-02 설계 결과 섹션 신설 (SMGI-D01~D04 4건)
- objectives: 푸터에 Phase 38-01, 38-02 업데이트 이력 추가

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | 동시성 + 프로세스 생명주기 + 에러 복구 루프 설계 | `8513386` | `.planning/deliverables/38-sdk-mcp-interface.md` |
| 2 | Claude Desktop 에러 처리 + objectives 반영 | `9039b18` | `.planning/deliverables/38-sdk-mcp-interface.md`, `objectives/v0.9-session-management-automation.md` |

## Files Modified

| File | Changes |
|------|---------|
| `.planning/deliverables/38-sdk-mcp-interface.md` | +510 lines: 섹션 6.5.5/6.5.6/6.5.7 신설 (동시성/생명주기/에러처리), ApiResult killSwitch 확장, 문서 헤더/푸터 갱신 |
| `objectives/v0.9-session-management-automation.md` | +52 lines: [설계 확정] 태그, Phase 38-01/38-02 설계 결과 섹션, 푸터 이력 |

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| SMGI-D02 | Mutex/Lock 미사용, 50ms 대기 + 401 재시도 | Node.js 단일 스레드, 차단 지연 방지 |
| SMGI-D03 | 에러 복구 루프 SessionManager 소속, 60초 polling | fs.watch 대신 안정적 polling, SM-12 일관 |
| SMGI-D04 | console.log 금지, console.error 통일 | stdio stdout 오염 → JSON-RPC 파싱 실패 방지 |

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 38 완료: Plan 38-01(ApiClient + tool/resource handler 통합) + Plan 38-02(동시성 + 생명주기 + 에러 처리) 모두 완료
- Phase 40 (테스트 설계 + 문서 통합): SessionManager 전체 설계(Phase 37 + 38), CLI(Phase 39-01), Telegram(Phase 39-02)이 모두 완료되어 통합 검증 가능
- v0.9 전체: Phase 36, 37, 38, 39 모두 완료. Phase 40만 남음

## Self-Check: PASSED

---
*Phase: 38-sessionmanager-mcp-integration*
*Completed: 2026-02-09*
