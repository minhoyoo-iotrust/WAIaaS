---
phase: 40-test-design-doc-integration
plan: 01
subsystem: testing
tags: [test-design, mcp, session-manager, security-scenarios, traceability]

# Dependency graph
requires:
  - phase: 36-token-file-infrastructure
    provides: TF-01~TF-05 토큰 파일 설계 결정, NOTI-01~NOTI-05 알림 설계 결정
  - phase: 37-session-manager-core
    provides: SM-01~SM-14 SessionManager 핵심 설계 결정
  - phase: 38-sessionmanager-mcp-integration
    provides: SMGI-D01~SMGI-D04 MCP 통합 설계 결정
  - phase: 39-cli-telegram-integration
    provides: CLI-01~CLI-06 CLI 설계 결정, TG-01~TG-06 Telegram 설계 결정
provides:
  - 18개 테스트 시나리오 설계 (T-01~T-14 핵심 + S-01~S-04 보안)가 38-sdk-mcp-interface.md 섹션 12에 SSoT로 통합
  - v0.9 objectives 성공 기준 10/11번 설계 완료 표기
affects: [v1.3-sdk-mcp-implementation, test-planning]

# Tech tracking
tech-stack:
  added: []
  patterns: [인라인 테스트 시나리오 명시 패턴 (소규모 시나리오 -> 기존 설계 문서 내 섹션)]

key-files:
  created: []
  modified:
    - .planning/deliverables/38-sdk-mcp-interface.md
    - objectives/v0.9-session-management-automation.md

key-decisions:
  - "18개 테스트 시나리오를 38-sdk-mcp-interface.md 섹션 12에 인라인 통합 (별도 문서 미생성)"
  - "각 시나리오에 검증 방법 + 관련 설계 결정 ID를 포함하여 추적성 확보"

patterns-established:
  - "소규모 테스트 시나리오(20개 미만)는 기존 설계 문서 내 인라인 섹션으로 통합하여 SSoT 유지"
  - "테스트 시나리오 테이블에 '관련 설계 결정' 컬럼을 포함하여 설계-테스트 추적성 확보"

# Metrics
duration: 2min
completed: 2026-02-09
---

# Phase 40 Plan 01: 테스트 설계 문서 명시 Summary

**38-sdk-mcp-interface.md 섹션 12에 18개 테스트 시나리오(T-01~T-14 핵심 + S-01~S-04 보안) 검증 방법/테스트 레벨/설계 결정 ID 매핑 완료**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-09T09:06:03Z
- **Completed:** 2026-02-09T09:08:30Z
- **Tasks:** 2/2
- **Files modified:** 2

## Accomplishments

- 38-sdk-mcp-interface.md에 "## 12. v0.9 테스트 설계 [v0.9]" 섹션 추가: 14개 핵심 검증 시나리오(T-01~T-14)와 4개 보안 시나리오(S-01~S-04) 각각에 검증 내용, 테스트 레벨(Unit/Integration), 검증 방법, 관련 설계 결정 ID를 테이블로 명시
- v0.9 objectives 성공 기준 10번(테스트 시나리오 명시)과 11번(테스트 레벨 정의)을 "설계 확정 -- Phase 40-01"로 업데이트
- Phase 36-39의 40개 설계 결정(SM-01~14, SMGI-D01~04, TF-01~05, NOTI-01~05, CLI-01~06, TG-01~06)이 테스트 시나리오에서 추적 가능하도록 매핑

## Task Commits

Each task was committed atomically:

1. **Task 1: 38-sdk-mcp-interface.md에 테스트 설계 섹션 추가** - `035a555` (docs)
2. **Task 2: v0.9 objectives 성공 기준 업데이트** - `8188e0e` (docs)

## Files Created/Modified

- `.planning/deliverables/38-sdk-mcp-interface.md` - 섹션 12 "v0.9 테스트 설계" 추가 (T-01~T-14, S-01~S-04 테이블 2개 + 참조 설명)
- `objectives/v0.9-session-management-automation.md` - 성공 기준 10/11번 Phase 40-01 완료 표기 + 하단 업데이트 이력 추가

## Decisions Made

- 18개 테스트 시나리오를 별도 문서 대신 38-sdk-mcp-interface.md 섹션 12에 인라인 통합. 이유: v0.9 테스트는 18개로 소규모이며, 대부분 SessionManager/토큰 파일 관련이므로 기존 문서 내 인라인이 SSoT 유지와 참조 편의성에 유리.
- 검증 방법은 40-RESEARCH.md의 Phase 36-39 설계 결정 매핑을 그대로 사용. 특히 T-07(외부 토큰 교체 감지)의 검증 방법이 SM-12(handleUnauthorized 4-step)와 일치하는지 확인 완료.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 40-01(테스트 설계 명시) 완료. Plan 40-02(설계 문서 통합 + pitfall 반영)에서 7개 기존 설계 문서의 v0.9 통합 완결성 검증 + REQUIREMENTS.md 상태 갱신 진행 예정.
- 18개 테스트 시나리오가 설계 문서에 SSoT로 존재하므로, 구현 단계(v1.3)에서 테스트 코드 작성 시 직접 참조 가능.

## Self-Check: PASSED

---
*Phase: 40-test-design-doc-integration*
*Completed: 2026-02-09*
