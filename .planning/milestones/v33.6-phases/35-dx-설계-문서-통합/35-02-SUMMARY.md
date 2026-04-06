---
phase: 35-dx-설계-문서-통합
plan: 02
subsystem: owner-state-matrix
tags: [ssot, owner-state, matrix, NONE, GRACE, LOCKED, cross-validation, 33-time-lock, 34-owner, 36-killswitch]

# Dependency graph
requires:
  - phase: 35-dx-설계-문서-통합/35-01
    provides: CLI 명령어 확정 (set-owner, remove-owner, withdraw, quickstart, agent info)
  - phase: 34-자금-회수-보안-분기-설계
    provides: withdraw API 스펙, Kill Switch 복구 분기, 세션 갱신 Owner 분기
  - phase: 33-정책-다운그레이드-알림-설계
    provides: APPROVAL 다운그레이드 Step 9.5, TX_DOWNGRADED 감사 이벤트
  - phase: 32-owner-생명주기-설계
    provides: OwnerLifecycleService, 3-State 상태 머신, resolveOwnerState()
provides:
  - Owner 상태 분기 매트릭스 SSoT (18행 x 3열) in objectives/v0.8
  - GRACE APPROVAL = DELAY 다운그레이드 확정 (33-time-lock §11.6 준수)
  - v0.8 objective 본문 3-State 기준 보강 (6개 [v0.8-SSoT] 태그)
  - 교차 검증 10건 수행 결과 (전건 일치)
affects: [35-03-통합-검증, 구현 Phase]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SSoT 매트릭스 패턴: API x OwnerState(NONE/GRACE/LOCKED) 전체 동작 매트릭스"
    - "교차 검증 패턴: 매트릭스 행별 근거 문서 대조 + 일치 확인"
    - "[v0.8-SSoT] 태그 패턴: 매트릭스와 본문 정합성 보강 표시"

key-files:
  created: []
  modified:
    - "objectives/v0.8-optional-owner-progressive-security.md"

key-decisions:
  - "GRACE APPROVAL = DELAY 다운그레이드 확정: 33-time-lock §11.6 Step 9.5의 resolveOwnerState() !== 'LOCKED' 조건으로 NONE과 GRACE 모두 다운그레이드"
  - "본문 표 3-State 전환: §3, §7, §8의 Owner 없음/있음 이분법을 NONE/GRACE vs LOCKED 기준으로 정정"
  - "§3 코드 스니펫 정정: !agent.owner_address에서 resolveOwnerState() !== 'LOCKED'로 변경 (33-time-lock 확정 코드 일관)"
  - "§5.5 Kill Switch withdraw 방안 A 확정 반영: killSwitchGuard 5번째 허용 경로 (35-01 결정)"

patterns-established:
  - "매트릭스 SSoT를 objective 문서 부록에 배치하여 마일스톤 수준 참조점 확보"
  - "교차 검증 결과를 매트릭스 내에 테이블로 포함하여 자기 증명"

# Metrics
duration: 5min
completed: 2026-02-09
---

# Phase 35 Plan 02: Owner 상태 분기 매트릭스 SSoT + 교차 검증 Summary

**objectives/v0.8에 18행x3열 Owner 상태 분기 매트릭스를 SSoT로 작성 -- GRACE APPROVAL=DELAY 다운그레이드 확정(33-time-lock 준수), Kill Switch withdraw 방안 A 반영, v0.8 본문 6곳을 3-State 기준으로 보강, 교차 검증 10건 전건 일치**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-09T03:05:18Z
- **Completed:** 2026-02-09T03:10:57Z
- **Tasks:** 2/2
- **Files modified:** 1

## Accomplishments

- Owner 상태 분기 매트릭스 SSoT 작성: 18행 x 3열(NONE/GRACE/LOCKED), 6개 근거 문서 참조
- 각주 4개: [1] DELAY 다운그레이드, [2] LOCKED 전이 Step 8.5, [3] Kill Switch withdraw, [4] 보안 방어
- 상태 전이 다이어그램: 6개 전이와 매트릭스 행 번호 매핑
- GRACE APPROVAL 동작 상세 해설: Open Question 3 결론 기록
- 교차 검증 10건: 매트릭스 vs 6개 설계 문서, 전건 일치 확인
- v0.8 objective 본문 보강: §3 APPROVAL 표/코드, §5.5 Kill Switch, §7 세션 갱신, §8 알림 표
- [v0.8-SSoT] 태그 6개 부착: 매트릭스와의 정합성 표시
- CLI 명령어 표에 `owner withdraw` 추가 (35-01 결정 반영)

## Task Commits

Each task was committed atomically:

1. **Task 1: Owner 상태 분기 매트릭스 SSoT 작성** - `481748e` (feat)
2. **Task 2: 매트릭스-문서 간 교차 검증 + v0.8 본문 SSoT 보강** - `58f2d73` (feat)

## Files Created/Modified

- `objectives/v0.8-optional-owner-progressive-security.md` - 매트릭스 SSoT 부록 추가 + 본문 6곳 3-State 보강

## Decisions Made

1. **GRACE APPROVAL = DELAY 다운그레이드 확정:** 플랜에서는 GRACE APPROVAL을 "ownerAuth 승인 대기 (첫 사용 시 LOCKED 전이)"로 기술했으나, 33-time-lock §11.6 Step 9.5의 확정 코드(`resolveOwnerState() !== 'LOCKED'`)와 안티패턴 표("GRACE 상태에서 APPROVAL 허용 -> ownerAuth 미사용 상태에서 Owner 서명을 받을 수 없다")에 따라 GRACE도 DELAY 다운그레이드로 확정. 33-time-lock이 정책 엔진 동작의 SSoT이므로 이를 따른다.

2. **v0.8 objective 본문 3-State 전환:** 기존 §3, §7, §8의 "Owner 없음 / Owner 있음" 이분법 열 구분을 "NONE/GRACE vs LOCKED" 3-State 기준으로 정정. GRACE에서도 APPROVAL 다운그레이드 및 세션 갱신 거부 비활성이 적용되므로, LOCKED만 분리하는 것이 정확하다.

3. **§3 코드 스니펫 정정:** v0.8 objective 원본의 `!agent.owner_address` 조건을 `resolveOwnerState(agent) !== 'LOCKED'`로 변경. 33-time-lock §11.6의 확정 의사코드와 일관성 확보.

4. **§5.5 Kill Switch withdraw 방안 A 반영:** "구현 시 결정" 문구를 35-01 확정 결과(방안 A, killSwitchGuard 5번째 허용 경로)로 교체.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] GRACE APPROVAL 동작 정정**
- **Found during:** Task 1 매트릭스 작성 시 33-time-lock 문서와 대조
- **Issue:** 플랜에서 GRACE APPROVAL = "ownerAuth 승인 대기 (첫 사용 시 LOCKED 전이)"로 기술했으나, 33-time-lock §11.6 확정 코드(`ownerState !== 'LOCKED'`)와 안티패턴 표에서 GRACE도 다운그레이드 대상임을 명시
- **Fix:** 매트릭스에서 GRACE APPROVAL = "DELAY 다운그레이드 [1]"로 표기. 각주 [1]에 GRACE 다운그레이드 근거 상세 기술
- **Files modified:** objectives/v0.8-optional-owner-progressive-security.md
- **Commit:** 481748e

**2. [Rule 1 - Bug] v0.8 objective §3 코드 스니펫 불일치**
- **Found during:** Task 2 교차 검증
- **Issue:** v0.8 objective §3의 다운그레이드 코드가 `!agent.owner_address`를 사용하여 NONE만 다운그레이드하는 것처럼 보임. 33-time-lock 확정 코드는 `resolveOwnerState() !== 'LOCKED'`로 NONE+GRACE 모두 다운그레이드
- **Fix:** 코드 스니펫을 `resolveOwnerState(agent) !== 'LOCKED'`로 정정, [v0.8-SSoT] 태그 부착
- **Commit:** 58f2d73

**3. [Rule 2 - Missing Critical] v0.8 objective 본문 3-State 보강**
- **Found during:** Task 2 교차 검증
- **Issue:** §7 세션 갱신, §8 알림 표가 "Owner 없음/있음" 이분법으로 GRACE 동작을 부정확하게 표현
- **Fix:** 3개 표의 열 구분을 "NONE/GRACE vs LOCKED"으로 전환, [v0.8-SSoT] 주석 3개 추가
- **Commit:** 58f2d73

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Requirements Mapping

| 요구사항 | 충족 | 근거 |
|---------|------|------|
| INTEG-02 | Yes | Owner 상태 분기 매트릭스 SSoT 작성 (18행 x 3열, 부록) |
| POLICY-01 | Yes | NONE/GRACE APPROVAL = DELAY 다운그레이드 (매트릭스 행 5) |
| POLICY-02 | Yes | TX_DOWNGRADED_DELAY 알림 분기 (매트릭스 행 6) |
| WITHDRAW-08 | Yes | GRACE withdraw 불가 (매트릭스 행 8, 각주 [4]) |
| OWNER-06 | Yes | LOCKED remove-owner 불가 (매트릭스 행 16, 각주 [4]) |
| SECURITY-03/04 | Yes | 세션 갱신 LOCKED만 [거부하기] 활성 (매트릭스 행 12-13) |
| DX-04 | Yes | --quickstart --chain만 필수 (매트릭스 행 18) |
| DX-05 | Yes | agent info 안내 메시지 (매트릭스 행 17) |

## Next Phase Readiness

- 35-03 (14개 설계 문서 통합 반영) 실행 준비 완료
- 매트릭스가 SSoT로 확립되었으므로 35-03에서 각 문서의 v0.8 변경이 매트릭스와 일관되는지 기준으로 활용
- GRACE APPROVAL 다운그레이드 확정으로 35-RESEARCH Open Question 3 해결

## Self-Check: PASSED
