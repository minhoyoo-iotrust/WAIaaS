---
phase: 34-자금-회수-보안-분기-설계
plan: 02
subsystem: security
tags: [killswitch, recovery, owner-branching, session-renewal, reject-button, notification, telegram, discord, ntfy]

# Dependency graph
requires:
  - phase: 31-데이터-모델-타입-기반-설계
    provides: resolveOwnerState() 순수 함수, OwnerState 3상태
  - phase: 33-정책-다운그레이드-알림-설계
    provides: Telegram url 기반 InlineKeyboard, Discord Embed 링크, ntfy.sh view 타입 패턴
provides:
  - Kill Switch 복구 Owner 유무 분기 설계 (30min vs 24h)
  - 2단계 복구 패턴 (ACTIVATED → RECOVERING → NORMAL)
  - 세션 갱신 OwnerState별 분기 (NONE/GRACE: 즉시 확정, LOCKED: [거부하기] 활성)
  - SESSION_RENEWED [거부하기] 버튼 3채널 명세
  - recovery_eligible_at / recovery_wait_seconds system_state 키
affects: [35-DX-설계-문서-통합, 구현 Phase]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "2단계 복구 패턴: Step 1(복구 개시 + 대기시간 기록) → Step 2(대기 완료 확인 + 복구 완료)"
    - "Owner 유무 판단은 시스템 레벨 쿼리(agents WHERE owner_address IS NOT NULL)"
    - "SESSION_RENEWED rejectButton 플래그로 채널 어댑터 분기"
    - "[거부하기] 버튼은 APPROVAL 버튼과 동일 패턴 (url/Embed 링크/view 타입)"

key-files:
  created: []
  modified:
    - ".planning/deliverables/36-killswitch-autostop-evm.md"
    - ".planning/deliverables/53-session-renewal-protocol.md"
    - ".planning/deliverables/35-notification-architecture.md"

key-decisions:
  - "Kill Switch 복구 대기 시간은 에이전트별이 아닌 시스템별 분기 -- 시스템 내 Owner 1명이라도 있으면 30min+ownerAuth"
  - "config.toml로 복구 대기 시간 재정의 가능 (kill_switch_recovery_wait_owner/no_owner)"
  - "RECOVERING 상태에서 Step 2 실행 시 masterAuth만 재검증 (ownerAuth는 Step 1에서 완료)"
  - "SESSION_RENEWED [거부하기] URL은 masterAuth(implicit)만 필요 -- APPROVAL 승인 URL의 ownerAuth와 다름"
  - "거부 윈도우 비강제 확인 -- Owner는 세션 유효 시 언제든 DELETE 가능"

patterns-established:
  - "2단계 복구 패턴: HTTP 요청 내 sleep 불가이므로 system_state에 recovery_eligible_at 기록 후 두 번째 요청에서 경과 확인"
  - "Owner 유무 쿼리의 Kill Switch 독립성: agents.owner_address는 Kill Switch 캐스케이드에서 변경되지 않음"
  - "rejectButton 플래그 기반 채널 어댑터 템플릿 분기: 채널 어댑터가 context.rejectButton으로 포맷 결정"

# Metrics
duration: 6min
completed: 2026-02-09
---

# Phase 34 Plan 02: Kill Switch 복구 + 세션 갱신 Owner 분기 설계 Summary

**Kill Switch 복구 대기 시간의 Owner 유무 분기(30min vs 24h)와 2단계 복구 패턴을 36-killswitch에 설계하고, 세션 갱신의 OwnerState별 분기(즉시 확정 vs [거부하기] 버튼)를 53-session-renewal과 35-notification에 3채널 명세 완료**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-09T01:56:30Z
- **Completed:** 2026-02-09T02:02:23Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Kill Switch 복구 Owner 유무별 대기 시간 분기 테이블 (Owner 있음: 30min, Owner 없음: 24h)
- 2단계 복구 패턴 설계: Step 1(ACTIVATED->RECOVERING, recovery_eligible_at 기록) + Step 2(대기 완료 확인->NORMAL)
- RecoverRequest 스키마 ownerAuth 선택적 분기 (Owner 있을 때만 필수)
- IKillSwitchService.recover() 인터페이스 업데이트 (RecoverInitiatedResult 추가)
- system_state 키 2개 추가 (recovery_eligible_at, recovery_wait_seconds)
- config.toml kill_switch_recovery_wait_owner/no_owner 설정 + Zod 스키마
- RECOVERY_WAIT_REQUIRED + RECOVERY_ALREADY_STARTED 에러 코드 4개 추가
- 세션 갱신 OwnerState별 분기 테이블 (NONE/GRACE: 즉시 확정, LOCKED: [거부하기] 활성)
- SESSION_RENEWED context에 rejectButton/rejectUrl/rejectWindowExpiry 플래그 추가
- [거부하기] 버튼 3채널 명세: Telegram(InlineKeyboard url), Discord(Embed 링크), ntfy.sh(Actions view)
- [거부하기] URL 보안 테이블 (nonce, localhost, masterAuth, DELETE 재활용)
- 거부 윈도우 비강제 의미 명확화

## Task Commits

Each task was committed atomically:

1. **Task 1: Kill Switch 복구 Owner 유무 분기를 36-killswitch-autostop-evm.md에 반영** - `1ce2040` (feat)
2. **Task 2: 세션 갱신 Owner 분기 + [거부하기] 버튼을 53/35에 반영** - `e8239fd` (feat)

## Files Created/Modified

- `.planning/deliverables/36-killswitch-autostop-evm.md` - Kill Switch 복구 Owner 유무 분기, 2단계 복구 패턴, system_state 키, config.toml 설정, 에러 코드, IKillSwitchService 업데이트
- `.planning/deliverables/53-session-renewal-protocol.md` - 세션 갱신 OwnerState별 분기, rejectButton 플래그, 거부 윈도우 명확화
- `.planning/deliverables/35-notification-architecture.md` - SESSION_RENEWED Owner 분기 3채널 템플릿, [거부하기] 버튼 채널별 명세, URL 보안 테이블

## Decisions Made

- **Kill Switch 복구 시스템별 분기:** 에이전트별 분기가 아닌 시스템별 분기. agents.owner_address IS NOT NULL 존재 여부로 판단. Owner가 있는 에이전트의 자금 보호가 최우선이므로 1명이라도 있으면 ownerAuth 요구 + 30분 대기
- **config.toml로 복구 대기 시간 재정의 가능:** 기본값(30min/24h) 유지하되 운영 유연성을 위해 config.toml [security] 섹션에서 재정의 가능
- **Step 2에서 masterAuth만 재검증:** ownerAuth는 Step 1에서 이미 검증 완료. Step 2는 대기 시간 경과 확인 + masterAuth 재검증만 수행 (키스토어 해제에 필요)
- **SESSION_RENEWED [거부하기]는 masterAuth(implicit)만:** APPROVAL 승인 URL은 ownerAuth(SIWS/SIWE 서명) 필수이나, 세션 거부는 masterAuth(데몬 접근)만으로 충분. 이는 DELETE /v1/sessions/:id의 기존 인증 수준과 동일
- **거부 윈도우 비강제:** 53 섹션 4.5 결정 유지. 거부 윈도우는 안내 문구일 뿐이며 Owner의 DELETE 권한을 시간적으로 제한하지 않음

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- SECURITY-01 충족: Owner 없음 복구 24h
- SECURITY-02 충족: Owner 있음 복구 30min
- SECURITY-03 충족: Owner 없음 세션 갱신 즉시 확정
- SECURITY-04 충족: Owner 있음 세션 갱신 [거부하기] 버튼
- NOTIF-03 충족: [거부하기] 버튼 채널별 명세
- Phase 34 전체 완료 조건 충족 (34-01 + 34-02)
- Phase 35(DX 설계 문서 통합) 진행 가능

## Self-Check: PASSED

---
*Phase: 34-자금-회수-보안-분기-설계*
*Completed: 2026-02-09*
