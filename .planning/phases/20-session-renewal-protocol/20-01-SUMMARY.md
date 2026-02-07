---
phase: 20-session-renewal-protocol
plan: 01
subsystem: auth
tags: [jwt, session-renewal, optimistic-renewal, token-rotation, notification]

# Dependency graph
requires:
  - phase: 19-auth-owner-redesign
    provides: masterAuth/ownerAuth/sessionAuth 3-tier 인증 모델, agents.owner_address
provides:
  - 53-session-renewal-protocol.md -- 세션 갱신 프로토콜 SSoT 문서
  - PUT /v1/sessions/:id/renew API 스펙 (5개 에러 코드)
  - 5종 안전 장치 명세 (maxRenewals, 절대 수명, 50% 시점, 거부 윈도우, 갱신 단위 고정)
  - 토큰 회전 메커니즘 (새 JWT + token_hash 교체)
  - Owner 사후 거부 플로우
  - SESSION_RENEWED/SESSION_RENEWAL_REJECTED 알림 이벤트 2종
  - config.toml [security] 설정 3개 (session_absolute_lifetime, default_max_renewals, default_renewal_reject_window)
  - SessionConstraints 8필드 확장 (maxRenewals, renewalRejectWindow 추가)
  - 세션 수명주기 5단계 확장 (갱신 포함)
affects:
  - 20-02 (sessions 테이블 스키마 확장 + 37-rest-api + 35-notification 문서 수정)
  - 21-dx (SDK/MCP 자동 갱신 통합)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "낙관적 갱신(Optimistic Renewal): 에이전트 자율 갱신 + Owner 사후 거부"
    - "토큰 회전(Token Rotation): 갱신 시 새 JWT 발급 + token_hash 교체"
    - "5종 안전 장치: 다중 방어 메커니즘으로 무한 갱신 방지"

key-files:
  created:
    - .planning/deliverables/53-session-renewal-protocol.md
  modified:
    - .planning/deliverables/30-session-token-protocol.md

key-decisions:
  - "기존 DELETE /v1/sessions/:id 재활용 for 갱신 거부 (별도 엔드포인트 추가하지 않음)"
  - "거부 윈도우는 검증이 아닌 알림 안내 문구 (Owner는 언제든 폐기 가능)"
  - "usageStats 갱신 시 유지 (리셋하지 않음, 갱신은 기간 연장이지 새 세션이 아님)"
  - "절대 수명은 세션별 재정의 불가 (config.toml 전역 설정만 존재)"
  - "50% 시점 갱신 비율은 시스템 고정 (설정 불가)"

patterns-established:
  - "인라인 v0.5 변경 마킹: (v0.5 변경) 또는 (Phase 20 추가)"
  - "SSoT 위임: 30-session-token-protocol.md가 갱신 상세를 53에 위임"

# Metrics
duration: 6min
completed: 2026-02-07
---

# Phase 20 Plan 01: 세션 갱신 프로토콜 핵심 정의 Summary

**낙관적 갱신 프로토콜 SSoT(53-session-renewal-protocol.md) 신규 작성: PUT /v1/sessions/:id/renew API, 5종 안전 장치, 토큰 회전, Owner 사후 거부, 알림 이벤트 2종 + 30-session-token-protocol.md SessionConstraints 8필드 확장 및 수명주기 5단계 반영**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-07T01:44:31Z
- **Completed:** 2026-02-07T01:50:32Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- 53-session-renewal-protocol.md 신규 작성 (8개 섹션, ~1000줄): 낙관적 갱신 프로토콜의 SSoT 문서
- PUT /v1/sessions/:id/renew API 스펙 완성: 요청/응답/에러 5개/Zod 스키마/Hono 라우트
- 5종 안전 장치 상세 명세: 각 장치별 설정값/범위/검증 로직(의사 코드)/에러 코드
- 토큰 회전 메커니즘 정의: 새 JWT 발급 + token_hash 교체 + BEGIN IMMEDIATE 동시성 방어
- Owner 사후 거부 플로우: 기존 DELETE 재활용, audit_log details.trigger로 구분
- SESSION_RENEWED/SESSION_RENEWAL_REJECTED 알림 이벤트: context 필드 + 3채널 메시지 템플릿
- config.toml [security] 설정 3개 추가: session_absolute_lifetime, default_max_renewals, default_renewal_reject_window
- 30-session-token-protocol.md 확장: SessionConstraints 8필드(+2), 수명주기 5단계(+1), API 요약 갱신

## Task Commits

Each task was committed atomically:

1. **Task 1: 53-session-renewal-protocol.md 신규 작성** - `ba7ffa9` (feat)
2. **Task 2: 30-session-token-protocol.md 수명주기 확장 + SessionConstraints 갱신 필드 추가** - `39dd113` (feat)

## Files Created/Modified

- `.planning/deliverables/53-session-renewal-protocol.md` - 세션 갱신 프로토콜 SSoT (8개 섹션, API/안전장치/토큰회전/거부/알림/config)
- `.planning/deliverables/30-session-token-protocol.md` - SessionConstraints +2필드, 수명주기 5단계, API 요약 +1 엔드포인트

## Decisions Made

1. **기존 DELETE 재활용**: 갱신 거부를 위한 별도 엔드포인트를 추가하지 않음. 결과 동일(세션 폐기), audit_log details.trigger로 구분 가능, 엔드포인트 최소화.
2. **거부 윈도우 = 알림 안내**: 거부 윈도우(기본 1시간)는 검증이 아닌 알림 메시지의 안내 문구. Owner는 언제든 세션 폐기 가능.
3. **usageStats 유지**: 갱신 시 usageStats를 리셋하지 않음. 갱신은 기간 연장이지 새 세션이 아님. maxTotalAmount/maxTransactions 제약의 무결성 유지.
4. **절대 수명 전역 설정**: session_absolute_lifetime은 config.toml 전역만 존재. 세션별 재정의 불가. 시스템 수준 보안 정책.
5. **50% 시점 고정**: 갱신 최소 경과 비율(50%)은 시스템 고정. 에이전트/Owner가 변경 불가.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 20-02-PLAN.md (sessions 테이블 스키마 확장 + 37-rest-api + 35-notification 수정) 실행 준비 완료
- 53-session-renewal-protocol.md가 SSoT로서 20-02에서 참조할 수 있음
- SessionConstraints 확장이 완료되어 sessions 테이블 컬럼 추가 근거 확보

## Self-Check: PASSED

---
*Phase: 20-session-renewal-protocol*
*Completed: 2026-02-07*
