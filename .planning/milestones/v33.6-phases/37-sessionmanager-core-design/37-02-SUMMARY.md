---
phase: "37-sessionmanager-core-design"
plan: "02"
subsystem: "mcp-session-management"
tags: ["SessionManager", "scheduleRenewal", "safeSetTimeout", "handleRenewalError", "handleUnauthorized", "lazy-reload", "drift-correction"]

requires:
  - phase: "37-sessionmanager-core-design"
    plan: "01"
    provides: "SessionManager 클래스 인터페이스 (3 public + 5 internal 메서드, 9개 내부 상태)"
  - phase: "36-토큰-파일-인프라-알림-이벤트"
    provides: "readMcpToken/writeMcpToken 공유 유틸리티, SESSION_EXPIRING_SOON 알림"
provides:
  - "scheduleRenewal() 절대 시간 기준 갱신 스케줄 + self-correcting timer"
  - "safeSetTimeout() 32-bit overflow 방어 래퍼 (C-01)"
  - "renew() 파일-우선 쓰기 순서 (H-02 방어)"
  - "handleRenewalError() 5종 에러 분기 (TOO_EARLY/LIMIT/LIFETIME/NETWORK/EXPIRED)"
  - "retryRenewal() 재시도 메커니즘 (maxRetries 제한)"
  - "handleUnauthorized() 4-step lazy 401 reload"
affects: ["38-MCP-통합", "39-CLI-Telegram", "40-테스트-설계-문서-통합"]

tech-stack:
  added: []
  patterns: ["Self-correcting timer (서버 expiresAt 기준 절대 시간 갱신 스케줄)", "File-first write (writeMcpToken -> 메모리 교체, SIGTERM 방어)", "Lazy 401 reload (파일 재로드 + 토큰 비교, fs.watch 미사용)"]

key-files:
  created: []
  modified:
    - ".planning/deliverables/38-sdk-mcp-interface.md"
    - "objectives/v0.9-session-management-automation.md"

key-decisions:
  - id: "SM-08"
    decision: "safeSetTimeout 래퍼로 32-bit overflow 방어 (C-01)"
    rationale: "setTimeout 32-bit 정수 상한 초과 시 즉시 실행 방지. 10줄 래퍼로 충분"
  - id: "SM-09"
    decision: "서버 응답 expiresAt 기준 절대 시간 갱신 스케줄 (self-correcting timer, H-01 대응)"
    rationale: "로컬 상대 시간 대신 서버-클라이언트 간 절대 시간 동기화로 누적 드리프트 제거"
  - id: "SM-10"
    decision: "파일-우선 쓰기 순서 (writeMcpToken -> 메모리 교체, H-02 대응)"
    rationale: "SIGTERM race condition에서 토큰 유실 방지"
  - id: "SM-11"
    decision: "5종 에러 분기 (TOO_EARLY 30초x1, LIMIT 포기, LIFETIME 포기, NETWORK 60초x3, EXPIRED lazy reload)"
    rationale: "각 에러의 재시도 횟수, 상태 전이, 알림 관계 명확 정의"
  - id: "SM-12"
    decision: "handleUnauthorized 4-step (파일 재로드 -> 비교 -> 교체/에러)"
    rationale: "fs.watch 미사용. lazy reload로 플랫폼별 불안정성 회피"
  - id: "SM-13"
    decision: "MCP SessionManager는 알림 직접 발송하지 않음 (데몬 자동, NOTI-01)"
    rationale: "관심사 분리. 데몬이 갱신 API 처리 시 SESSION_EXPIRING_SOON 자동 발송 판단"
  - id: "SM-14"
    decision: "갱신 중 getToken()은 구 토큰 반환 (동시성 안전)"
    rationale: "갱신 API와 inflight tool 호출이 동일 토큰 사용"

patterns-established:
  - "Self-correcting timer: 서버 응답 expiresAt 기준으로 다음 갱신 시점 절대 시간 재계산, 누적 드리프트 매 갱신 리셋"
  - "File-first write: 토큰 갱신 성공 시 writeMcpToken(파일) -> 메모리 교체 순서, SIGTERM 방어"
  - "Lazy 401 reload: 401 수신 시 파일 재로드 -> 토큰 비교 -> 교체/에러, fs.watch 미사용으로 플랫폼 안정성 확보"

duration: "~7 minutes"
completed: "2026-02-09"
---

# Phase 37 Plan 02: 자동 갱신 + 실패 처리 + Lazy 401 Reload 설계 Summary

**scheduleRenewal(절대 시간 기준 + safeSetTimeout + 드리프트 보정), renew(파일-우선 쓰기 H-02 방어), handleRenewalError(5종 에러 분기 테이블), handleUnauthorized(4-step lazy reload)를 38-sdk-mcp-interface.md 섹션 6.4.3~6.4.7에 구현 가능 수준으로 정의**

## Performance

| Metric | Value |
|--------|-------|
| Total tasks | 2 |
| Completed | 2 |
| Deviations | 0 |
| Duration | ~7 minutes |

## Accomplishments

### Task 1: 38-sdk-mcp-interface.md에 자동 갱신 + 실패 처리 + lazy reload 설계 추가

- 문서 헤더에 `Phase 37-02: 갱신 + 실패 + reload` 추가
- 섹션 6.4.3 신설: safeSetTimeout 래퍼 (C-01 Pitfall 대응)
  - MAX_TIMEOUT_MS 상수, 체이닝 함수 명세, 사용 위치 테이블
  - 오버플로우 발생 조건 테이블 (TTL별 safeSetTimeout 필요 여부)
  - 설계 결정 SM-08
- 섹션 6.4.4 신설: 자동 갱신 스케줄 (SMGR-04)
  - scheduleRenewal() 6-step 메서드 설계 (TypeScript 의사 코드)
  - 드리프트 보정 원리 다이어그램 (self-correcting timer)
  - 50% 규칙과의 관계 테이블
  - 갱신 주기 예시 테이블 (1시간~42일+)
  - 설계 결정 SM-09
- 섹션 6.4.5 신설: 갱신 실행 renew() (SMGR-04)
  - renew() 7-step 메서드 설계 (TypeScript 의사 코드)
  - 파일-우선 쓰기 순서 다이어그램 + 근거 테이블 (H-02 방어)
  - 갱신 중 tool 호출 동시성 테이블 (Pitfall 5)
  - 로그 출력 3종
  - 설계 결정 SM-10, SM-14
- 섹션 6.4.6 신설: 5종 갱신 실패 대응 (SMGR-05)
  - RenewalError 인터페이스
  - handleRenewalError 분기 테이블 (5종: HTTP 상태, 대응, 재시도, 상태 전이, 알림)
  - handleRenewalError 메서드 설계 (TypeScript 의사 코드)
  - retryRenewal 메서드 설계
  - 에러별 상세 설명 5건
  - 설계 결정 SM-11, SM-13
- 섹션 6.4.7 신설: Lazy 401 Reload (SMGR-06)
  - handleUnauthorized() 4-step 메서드 설계 (TypeScript 의사 코드)
  - 4-step 절차 플로우 다이어그램
  - 호출 시점 테이블, 외부 갱신 시나리오 (CLI/Telegram)
  - 로그 출력 5종
  - 설계 결정 SM-12
- MCP 세션 테이블 갱신 (scheduleRenewal + 5종 실패 대응 + lazy 401 reload)
- 보안 강화 테이블에 v0.9 SessionManager 설계 완료 반영
- 문서 푸터에 Phase 37-02 참조 추가

### Task 2: v0.9 objectives에 SMGR-04/SMGR-05/SMGR-06 설계 완료 반영

- 섹션 1.4(자동 갱신 스케줄)에 `[설계 확정 -- Phase 37-02]` 태그 추가
- 섹션 1.5(갱신 실패 처리)에 `[설계 확정 -- Phase 37-02]` 태그 추가
- 섹션 1.6(갱신 성공 시 처리)에 `[설계 확정 -- Phase 37-02]` 태그 추가
- 영향받는 설계 문서 테이블 SDK-MCP 행에 `[설계 완료: Phase 37-01 + 37-02]` + SMGR-04/05/06 추가
- Phase 37-02 설계 결과 섹션 신설: SM-08~SM-14 핵심 설계 결정 7건
- Pitfall 대응 요약 테이블 5건 (C-01, H-01, H-02, C-03, Pitfall 5)
- 문서 푸터에 Phase 37-02 업데이트 이력 추가

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | 자동 갱신 + 실패 처리 + lazy reload 설계 | `c2d6207` | `.planning/deliverables/38-sdk-mcp-interface.md` |
| 2 | v0.9 objectives에 설계 완료 반영 | `0fc27fb` | `objectives/v0.9-session-management-automation.md` |

## Files Modified

| File | Changes |
|------|---------|
| `.planning/deliverables/38-sdk-mcp-interface.md` | +558 lines: 섹션 6.4.3~6.4.7 신설 (safeSetTimeout/scheduleRenewal/renew/handleRenewalError/handleUnauthorized), MCP 세션 테이블 갱신, 보안 테이블 갱신, 문서 헤더/푸터 갱신 |
| `objectives/v0.9-session-management-automation.md` | +42 lines: [설계 확정] 태그 3건, Phase 37-02 설계 결과 섹션 (SM-08~SM-14), Pitfall 대응 5건, 푸터 이력 |

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| SM-08 | safeSetTimeout 래퍼로 32-bit overflow 방어 (C-01) | setTimeout 32-bit 정수 상한 초과 시 즉시 실행 방지 |
| SM-09 | 서버 응답 expiresAt 기준 절대 시간 갱신 스케줄 (H-01) | 누적 드리프트 제거, self-correcting timer |
| SM-10 | 파일-우선 쓰기 순서 (H-02) | SIGTERM race condition에서 토큰 유실 방지 |
| SM-11 | 5종 에러 분기 | 재시도 횟수, 상태 전이, 알림 관계 명확 정의 |
| SM-12 | handleUnauthorized 4-step lazy reload | fs.watch 미사용, 플랫폼 안정성 |
| SM-13 | MCP SessionManager 알림 미발송 | 데몬 자동 판단 (NOTI-01), 관심사 분리 |
| SM-14 | 갱신 중 getToken() 구 토큰 반환 | 동시성 안전, inflight 실패 방지 |

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 37 완료: Plan 37-01(인터페이스 + 토큰 로드) + Plan 37-02(갱신 + 실패 + reload) 모두 완료
- Phase 38 (MCP 통합): SessionManager 전체 설계 완료로 tool handler 통합 설계 진행 가능
- Phase 39 (CLI+Telegram): writeMcpToken/readMcpToken 연동 확정, CLI `mcp setup`/`mcp refresh-token` + Telegram `/newsession` 상세 설계 가능
- Phase 40 (테스트 설계 + 문서 통합): T-03~T-07, T-12~T-13 시나리오의 구현 기반 확정

## Self-Check: PASSED

---
*Phase: 37-sessionmanager-core-design*
*Completed: 2026-02-09*
