---
phase: 384-policy-tracking
plan: 02
subsystem: tracking
tags: [async-tracking, bridge-status, polling-service, off-chain-order, clob, cex]

requires:
  - phase: 383-pipeline-routing
    provides: off-chain action DB 기록 (action_kind, CONFIRMED 상태) + tracking 필드
  - phase: 380-resolved-action-type-system
    provides: SignedDataActionTrackingSchema (trackerName + metadata)
provides:
  - AsyncTrackingResult.state 9종 확장 (기존 4 + PARTIALLY_FILLED/FILLED/CANCELED/SETTLED/EXPIRED)
  - AsyncPollingService 쿼리 확장 (PARTIALLY_FILLED 포함)
  - tracker 메타데이터 확장 (venue/operation/externalId/fillPercentage/trackerSpecific)
  - 상태 저장 위치 결정 (bridge_status/bridge_metadata 재사용)
  - DB 마이그레이션 v57 (복합 인덱스)
  - 알림 이벤트 6종 (external_action_* 네임스페이스)
affects: [385-design-integration, async-polling-service, notification-channel]

tech-stack:
  added: []
  patterns: [bridge_status 재사용 off-chain 추적, PARTIALLY_FILLED 폴링 계속 패턴, trackerName 우선 tracker fallback]

key-files:
  created:
    - .planning/phases/384-policy-tracking/design/async-tracking-extension-design.md
  modified: []

key-decisions:
  - "bridge_status/bridge_metadata 재사용 (별도 테이블 아님) -- AsyncPollingService 인프라 100% 재사용"
  - "state 9종 확장: PARTIALLY_FILLED/FILLED은 폴링 계속/정상 종료, CANCELED/EXPIRED는 실패 종료"
  - "PARTIALLY_FILLED를 폴링 대상에 포함 (부분 체결 주문 추적)"
  - "tracking 없는 off-chain action은 bridge_status NULL (비동기 추적 불필요)"
  - "DB 마이그레이션 v57: bridge_status CHECK 없음 확인, 복합 인덱스 추가만"

patterns-established:
  - "bridge_status 범용 비동기 추적: on-chain 브릿지 + off-chain 주문 통합"
  - "trackerName 우선 -> tracker fallback: Phase 380 설계와 기존 호환 양립"
  - "external_action_* 알림 이벤트: off-chain 전용 네임스페이스"

requirements-completed: [TRCK-01, TRCK-02, TRCK-03, TRCK-04]

duration: 5min
completed: 2026-03-12
---

# Phase 384 Plan 02: Async Tracking Extension Design Summary

**AsyncTrackingResult 9종 state(PARTIALLY_FILLED/FILLED/CANCELED/SETTLED/EXPIRED 추가) + bridge_status 재사용 결정 + AsyncPollingService 쿼리/메타데이터 확장으로 off-chain action 비동기 추적 인프라 설계**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-11T15:37:00Z
- **Completed:** 2026-03-11T15:42:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- AsyncTrackingResult.state를 기존 4종에서 9종으로 확장 (3-category 분류: 폴링 계속/정상 종료/실패 종료)
- 상태 저장 위치 결정: Option A (bridge_status/bridge_metadata 재사용) -- 구현 복잡도 최소화
- AsyncPollingService 쿼리 확장: PARTIALLY_FILLED 폴링 대상 포함
- tracker 메타데이터에 venue/operation/externalId/fillPercentage/trackerSpecific 등 7개 확장 필드
- DB 마이그레이션 v57: 복합 인덱스 (action_kind, bridge_status) 추가
- 신규 알림 이벤트 6종 (external_action_* 네임스페이스, defi 카테고리)
- 8개 설계 결정 + 7개 pitfall 방지 체크리스트

## Task Commits

1. **Task 1: off-chain action 비동기 추적 확장 설계 문서 작성** - `fafabea7` (docs)

## Files Created/Modified
- `.planning/phases/384-policy-tracking/design/async-tracking-extension-design.md` - TRCK-01~04 전체 설계

## Decisions Made
- bridge_status/bridge_metadata 재사용 (별도 external_action_status 테이블 아님)
- FILLED vs COMPLETED vs SETTLED 의미론적 구분 (off-chain 체결/on-chain 완료/정산 확인)
- TIMEOUT vs EXPIRED 구분 (시스템 폴링 초과 vs 비즈니스 만료)
- Phase 383 수정 제안: tracking 있으면 bridge_status='PENDING'으로 기록 (CONFIRMED 대신)
- 향후 bridge_status -> tracking_status 리네이밍은 major version에서 수행

## Deviations from Plan

None - plan executed exactly as written.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 385 설계 문서 통합(doc-77)에서 AsyncTracker 확장 섹션 포함 가능
- 기존 5종 tracker 무변경 확인 완료 -- 구현 시 타입 안전성만 보장하면 됨
- Phase 383 수정 제안 (tracking 있으면 PENDING 기록)은 doc-77에 반영 필요

---
*Phase: 384-policy-tracking*
*Completed: 2026-03-12*
