---
phase: 35-dx-설계-문서-통합
plan: 03
subsystem: design-doc-integration
tags: [v0.8, integration, cross-validation, INTEG-01, matrix-ssot, killswitch-withdraw, sweepAll, downgrade]

# Dependency graph
requires:
  - phase: 35-dx-설계-문서-통합/35-01
    provides: 54-cli v0.8 전면 갱신 (118개 [v0.8] 태그), Kill Switch withdraw 방안 A 결정
  - phase: 35-dx-설계-문서-통합/35-02
    provides: Owner 상태 분기 매트릭스 SSoT (18행 x 3열), 교차 검증 10건 전건 일치
  - phase: 34-자금-회수-보안-분기-설계
    provides: withdraw API, Kill Switch 복구 분기, 세션 갱신 Owner 분기
  - phase: 33-정책-다운그레이드-알림-설계
    provides: APPROVAL 다운그레이드 Step 9.5, TX_DOWNGRADED 감사 이벤트
provides:
  - 14개 설계 문서 + 3개 참조 문서 v0.8 통합 반영 (INTEG-01)
  - 4개 미변경 문서(30, 31, 40, 36) 첫 v0.8 태그 적용
  - killSwitchGuard 5번째 허용 경로 (withdraw) 반영
  - 매트릭스 SSoT 교차 검증 통과
  - 37-rest-api Kill Switch withdraw Open Question 해결
affects: [구현 Phase]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "문서 통합 패턴: 매트릭스 SSoT 기준으로 14개 설계 문서 교차 검증"
    - "교차 참조 패턴: v0.8 신규 기능(sweepAll, 다운그레이드)이 기존 v0.6 문서(57, 60, 61)에 역참조"
    - "Open Question 해소 패턴: 35-01 결정을 downstream 문서에 전파 (37-rest-api)"

key-files:
  created: []
  modified:
    - ".planning/deliverables/30-session-token-protocol.md"
    - ".planning/deliverables/31-solana-adapter-detail.md"
    - ".planning/deliverables/40-telegram-bot-docker.md"
    - ".planning/deliverables/36-killswitch-autostop-evm.md"
    - ".planning/deliverables/34-owner-wallet-connection.md"
    - ".planning/deliverables/37-rest-api-complete-spec.md"
    - "docs/57-asset-query-fee-estimation-spec.md"
    - "docs/60-batch-transaction-spec.md"
    - "docs/61-price-oracle-spec.md"

key-decisions:
  - "37-rest-api §8.18.2 Kill Switch withdraw Open Question 해소: 방안 A 확정 반영 (35-01 결정 전파)"
  - "30-session 세션 토큰 Owner 독립성 명시: JWT 구조/발급/검증은 Owner 무관, 갱신 후속 동작만 분기"
  - "31-solana sweepAll 18번째 구현 메서드: IChainAdapter 19+1=20 중 SolanaAdapter 실질 구현 18개"
  - "40-telegram url 기반 InlineKeyboard 통일: APPROVAL, SESSION_RENEWED 모두 url 기반 (33-02, 34-02 결정)"

patterns-established:
  - "v0.8 통합 완료 후 모든 설계 문서가 매트릭스 SSoT와 일관"
  - "Open Question -> 결정 -> 전파 패턴: 34-01 -> 35-01 -> 36-killswitch + 37-rest-api"

# Metrics
duration: 9min
completed: 2026-02-09
---

# Phase 35 Plan 03: 14개 설계 문서 v0.8 통합 반영 Summary

**14개 기존 설계 문서 + 3개 참조 문서에 v0.8 Owner 선택적 모델 통합 -- 4개 미변경 문서(30-session, 31-solana, 40-telegram, 36-killswitch)에 첫 v0.8 태그 적용, killSwitchGuard 5번째 허용 경로(withdraw) 반영, 37-rest-api Open Question 해소, 매트릭스 SSoT 교차 검증 전건 통과**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-09T03:15:47Z
- **Completed:** 2026-02-09T03:24:34Z
- **Tasks:** 2/2
- **Files modified:** 9

## Accomplishments

- 30-session-token-protocol.md: 첫 v0.8 반영 (2개 태그) -- 세션 갱신 Owner 분기 참조, 토큰과 Owner 독립성 명시
- 31-solana-adapter-detail.md: 첫 v0.8 반영 (3개 태그) -- sweepAll 18번째 메서드 추가, 4단계 실행 순서 참조 섹션 추가
- 40-telegram-bot-docker.md: 첫 v0.8 반영 (8개 태그) -- TX_DOWNGRADED_DELAY, APPROVAL url 기반 버튼, SESSION_RENEWED [거부하기] 3종 알림 추가
- 36-killswitch-autostop-evm.md: killSwitchGuard 5번째 허용 경로 `POST /v1/owner/agents/:agentId/withdraw` 추가 (14개 태그, 기존 9 + 신규 5)
- 34-owner-wallet-connection.md: 매트릭스 SSoT 교차 참조 링크 추가 (10개 태그, 기존 9 + 신규 1)
- 37-rest-api-complete-spec.md: §8.18.2 Kill Switch withdraw Open Question -> 방안 A 확정으로 갱신 (12개 태그, 기존 10 + 신규 2)
- docs/57-asset-query-fee-estimation-spec.md: sweepAll이 getAssets() 활용 [v0.8] 교차 참조 추가
- docs/60-batch-transaction-spec.md: sweepAll 토큰 배치가 buildBatch() 활용 [v0.8] 교차 참조 추가
- docs/61-price-oracle-spec.md: APPROVAL 다운그레이드 시 resolveEffectiveAmountUsd() 교차 참조 추가
- 기존 10개 문서(25, 27, 32, 33, 34, 35, 37, 52, 53) v0.8 태그 매트릭스 SSoT 대조 일치 확인

## v0.8 태그 총괄

| 문서 | 태그 수 | 상태 |
|------|:------:|:----:|
| 25-sqlite-schema | 18 | 기존 유지 |
| 27-chain-adapter | 1 | 기존 유지 |
| 30-session-token | 2 | **신규** |
| 31-solana-adapter | 3 | **신규** |
| 32-transaction-pipeline | 3 | 기존 유지 |
| 33-time-lock | 25 | 기존 유지 |
| 34-owner-wallet | 10 | +1 (SSoT 참조) |
| 35-notification | 11 | 기존 유지 |
| 36-killswitch | 14 | +5 (withdraw 허용) |
| 37-rest-api | 12 | +2 (방안 A 확정) |
| 40-telegram-bot | 8 | **신규** |
| 52-auth-model | 10 | 기존 유지 |
| 53-session-renewal | 5 | 기존 유지 |
| 54-cli-flow | 118 | 35-01 완료 |
| **합계** | **240** | |

**참조 문서 (docs/):**

| 문서 | 태그 수 | 교차 참조 내용 |
|------|:------:|------------|
| 57-asset-query | 1 | sweepAll -> getAssets() |
| 60-batch-transaction | 1 | sweepAll -> buildBatch() |
| 61-price-oracle | 1 | 다운그레이드 -> resolveEffectiveAmountUsd() |

## Task Commits

Each task was committed atomically:

1. **Task 1: 4개 미변경 문서 첫 v0.8 반영 + killSwitchGuard withdraw 허용** - `3329e75` (feat)
2. **Task 2: 기존 10개 문서 교차 검증 + 3개 참조 문서 보강** - `82ebbe1` (feat)

## Files Created/Modified

- `.planning/deliverables/30-session-token-protocol.md` - v0.8 보완 (세션 갱신 Owner 분기, 토큰 독립성)
- `.planning/deliverables/31-solana-adapter-detail.md` - v0.8 보완 (sweepAll 18번째 메서드, 4단계 실행)
- `.planning/deliverables/40-telegram-bot-docker.md` - v0.8 보완 (3종 알림 유형 추가)
- `.planning/deliverables/36-killswitch-autostop-evm.md` - killSwitchGuard 5번째 허용 경로 추가
- `.planning/deliverables/34-owner-wallet-connection.md` - 매트릭스 SSoT 교차 참조 추가
- `.planning/deliverables/37-rest-api-complete-spec.md` - §8.18.2 Open Question 해소
- `docs/57-asset-query-fee-estimation-spec.md` - sweepAll/getAssets() 교차 참조
- `docs/60-batch-transaction-spec.md` - sweepAll/buildBatch() 교차 참조
- `docs/61-price-oracle-spec.md` - 다운그레이드/resolveEffectiveAmountUsd() 교차 참조

## Decisions Made

1. **37-rest-api §8.18.2 Kill Switch withdraw Open Question 해소:** 35-01에서 방안 A가 채택되었으나 37-rest-api에는 아직 "구현 시 결정"으로 남아있었다. 방안 A 확정을 반영하고 5개 허용 경로 목록을 명시했다.

2. **30-session 세션 토큰 Owner 독립성 명시:** JWT 구조, 발급, 검증, 폐기는 Owner 유무와 무관하게 동일 동작. Owner 분기는 갱신(Renew) 후속 동작(거부 윈도우)에만 영향. 이 관계를 명시하여 구현 시 혼동 방지.

3. **40-telegram url 기반 InlineKeyboard 통일:** APPROVAL 승인/거부(ownerAuth 필요)와 SESSION_RENEWED 거부(masterAuth implicit) 모두 url 기반 버튼 사용. callback_data로는 ownerAuth 서명이 불가하므로 url로 Desktop/CLI를 통한 서명 유도. 일관성을 위해 SESSION_RENEWED도 동일 패턴.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 37-rest-api §8.18.2 Open Question 미갱신**
- **Found during:** Task 2 교차 검증
- **Issue:** 35-01에서 Kill Switch withdraw 방안 A가 채택되었으나, 37-rest-api §8.18.2는 여전히 "구현 시 결정 사항"으로 기록되어 있고 방안 A/B를 병렬 나열
- **Fix:** §8.18.2 제목을 "(방안 A 확정)"으로 변경, 내용을 5개 허용 경로 목록으로 교체
- **Files modified:** .planning/deliverables/37-rest-api-complete-spec.md
- **Commit:** 82ebbe1

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Requirements Mapping

| 요구사항 | 충족 | 근거 |
|---------|------|------|
| INTEG-01 | Yes | 14개 설계 문서 + 3개 참조 문서에 v0.8 변경 일관 반영, 240개 [v0.8] 태그 |
| Kill Switch withdraw | Yes | 36-killswitch killSwitchGuard 5번째 허용 경로 반영 (35-01 방안 A) |
| Matrix SSoT 일관성 | Yes | 매트릭스 18행 x 3열 vs 14개 문서 교차 검증 통과 |
| 참조 문서 교차 참조 | Yes | 57(getAssets), 60(buildBatch), 61(resolveEffectiveAmountUsd) 각 1개 교차 참조 |

## Next Phase Readiness

- Phase 35 (DX + 설계 문서 통합) 전체 완료
- v0.8 마일스톤 설계 완료: 35 phases, 90 plans, 243 reqs, 30 설계 문서 + objectives/v0.8
- 모든 설계 문서가 매트릭스 SSoT와 일관되며 구현 준비 완료
- 다음 단계: 구현 Phase (코드 작성)

## Self-Check: PASSED
