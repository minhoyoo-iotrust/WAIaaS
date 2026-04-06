---
phase: 04-owner-agent-relationship
plan: 03
subsystem: emergency-recovery, multi-agent
tags: [emergency-recovery, guardian, multi-agent, hub-and-spoke, global-budget, dashboard]
requires:
  - phase: 04-owner-agent-relationship
    provides: 자금 충전/회수 프로세스 (04-01), 에이전트 생명주기 (04-02)
  - phase: 03-system-architecture
    provides: Circuit Breaker, anomaly detection, Dual Key architecture
provides:
  - 비상 자금 회수 메커니즘 (REL-04)
  - 멀티 에이전트 관리 모델 (REL-05)
  - 가디언 메커니즘 (소유자 키 복구)
  - Hub-and-Spoke 멀티 에이전트 구조
  - 전체 에이전트 합산 예산 한도
  - 통합 대시보드 데이터 모델
affects: [05-api-integration]
tech-stack:
  added: []
  patterns: [Hybrid Emergency Recovery, Hub-and-Spoke, Owner-level Aggregate Budget, Guardian mechanism]
key-files:
  created: [.planning/deliverables/16-emergency-recovery.md, .planning/deliverables/17-multi-agent-management.md]
  modified: []
key-decisions:
  - "비상 회수: 자동 SUSPENDED + 수동 회수 (시스템은 자금 이동 결정 안 함)"
  - "4가지 비상 트리거: manual, circuit_breaker, anomaly_detection, inactivity_timeout"
  - "대기 tx 3단계 처리: 서명 전(거부), 서명 완료 미제출(만료 대기), 제출 완료(모니터링만)"
  - "가디언: 클라우드=AWS Root→IAM→KMS 복구, 셀프호스트=백업 필수(분실 시 불가)"
  - "recoveryDestination 사전 등록 (비상 시 패닉 방지)"
  - "Hub-and-Spoke: Owner Key가 모든 멀티시그 configAuthority"
  - "에이전트 간 이동: Owner SpendingLimit 방식, 합산 예산에 미포함 (내부 이동)"
  - "GlobalBudgetLimit: Redis 서버 레벨, 개별 온체인 한도가 최종 방어"
  - "역할 구분 불필요: 예산 한도로만 에이전트 차별화"
  - "통합 대시보드 API: GET /api/v1/owner/dashboard, OwnerDashboard 인터페이스"
patterns-established:
  - "Hybrid Emergency Recovery: 자동 정지(SUSPENDED) + 수동 회수(Owner 판단)"
  - "대기 tx 3단계 분류 처리 (Pitfall 6 반영)"
  - "Guardian mechanism: 환경별 복구 경로 (KMS vs 백업)"
  - "Hub-and-Spoke: 단일 Owner Key → 다수 Squads 멀티시그"
  - "Owner-level Aggregate Budget: Redis INCRBY 원자적 합산 추적"
  - "에이전트 간 이동: Source SpendingLimitUse → Dest Vault PDA"
  - "Batch Operation: 혼합 전략 (병렬 서버 차단 + 순차 온체인)"
duration: 8min
completed: 2026-02-05
---

# Phase 4 Plan 03: 비상 회수 및 멀티 에이전트 관리 설계 Summary

**4가지 비상 트리거(수동/Circuit Breaker/이상탐지/비활성)와 대기 tx 3단계 처리, 가디언 메커니즘을 포함한 비상 자금 회수 설계 + Hub-and-Spoke 멀티 에이전트 구조에 GlobalBudgetLimit 합산 한도와 통합 대시보드 API를 설계**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-05T02:52:17Z
- **Completed:** 2026-02-05T03:00:17Z
- **Tasks:** 2
- **Files created:** 2

## Accomplishments

- REL-04 비상 자금 회수 메커니즘: 4가지 트리거 유형, EmergencyTrigger/EmergencyEvent/PendingTxPolicy 인터페이스, 5단계 비상 절차 시퀀스 다이어그램
- 대기 트랜잭션 3단계 분류 처리 (Pitfall 6 반영): 서명 전 즉시 거부, 서명 완료 미제출 blockhash 만료 대기, 제출 완료 모니터링
- 가디언 메커니즘: 클라우드(AWS Root→IAM→KMS) vs 셀프호스트(백업 필수) 복구 경로, Mermaid 플로우차트
- 비상 시나리오별 대응 매트릭스: Agent Key 탈취, 서버 장애, Enclave 장애, 네트워크 장애, 에이전트 비활성, Owner Key 침해 등 7개 시나리오
- REL-05 멀티 에이전트 관리: Hub-and-Spoke 아키텍처, Anti-pattern (단일 멀티시그 다수 에이전트 금지)
- 에이전트 간 자금 이동: 5단계 절차, Owner SpendingLimit 방식, 합산 예산 미포함 원칙
- GlobalBudgetLimit: Redis 키 구조, 합산 vs 개별 한도 관계, 원자적 INCRBY 연산
- 통합 대시보드: OwnerDashboard/AgentSummary 인터페이스, 6개 API 엔드포인트 스케치
- 에이전트 일괄 관리: Batch Suspend/Resume/Budget/Key Rotation, 혼합 실행 전략
- 에이전트 네이밍: UUID + nickname + tags 식별 체계

## Task Commits

1. **Task 1+2: 비상 회수 및 멀티 에이전트 관리 설계 문서 작성** - `18b10a1` (docs)

## Files Created/Modified

- `.planning/deliverables/16-emergency-recovery.md` - REL-04 비상 자금 회수 메커니즘 (1,053 lines): 4가지 트리거, 비상 절차 5단계, 대기 tx 3단계, 가디언 메커니즘, EmergencyRecoveryConfig, 7개 시나리오 매트릭스
- `.planning/deliverables/17-multi-agent-management.md` - REL-05 멀티 에이전트 관리 모델 (843 lines): Hub-and-Spoke, 에이전트 간 이동, GlobalBudgetLimit, 통합 대시보드 API, 일괄 관리, 보안

## Decisions Made

1. **비상 회수 원칙**: 시스템은 자동 SUSPENDED까지만, 자금 이동은 항상 소유자 수동 판단. autoRecover=false 기본값.
2. **대기 tx 3단계**: 서명 전(즉시 거부), 서명 완료 미제출(blockhash 만료 ~90초 대기), 제출 완료(취소 불가, 모니터링). Pitfall 6 반영.
3. **가디언 메커니즘**: 클라우드=AWS Root Account가 최종 안전망 (KMS 키 분실 불가). 셀프호스트=백업 없으면 복구 불가.
4. **recoveryDestination 사전 등록**: 비상 시 패닉 상태에서 주소 오류 방지.
5. **Hub-and-Spoke 구조**: 에이전트별 독립 Squads 멀티시그, 동일 Owner Key를 configAuthority로 공유.
6. **에이전트 간 이동**: REL-02 방법 A (Owner SpendingLimit) 사용, 합산 예산에 미포함 (내부 이동).
7. **GlobalBudgetLimit**: 서버 Redis 레벨에서 관리, 개별 온체인 SpendingLimit이 최종 방어선.
8. **역할 구분 불필요**: 모든 에이전트 동일 권한, 예산 한도로만 구분 (사용자 결정 반영).
9. **일괄 관리 전략**: Batch Suspend는 혼합(병렬 서버 차단 + 순차 온체인), Batch Budget/Rotation은 순차.
10. **에이전트 네이밍**: UUID(불변) + nickname(최대 50자) + tags(최대 10개).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required (설계 문서 단계).

## Next Phase Readiness

- Phase 4 전체 완료: REL-01~REL-05 (자금 충전/회수, 에이전트 생명주기, 비상 회수, 멀티 에이전트) 설계 완료
- Phase 5 (API 통합 설계)에서 본 문서의 API 엔드포인트 스케치(`/api/v1/owner/*`)를 정식 API 스펙으로 확장
- OwnerDashboard, AgentSummary, GlobalBudgetLimit 인터페이스가 API 응답 스키마로 직접 활용
- EmergencyRecoveryConfig가 에이전트 설정 API에 포함
- 차단 요소: 없음

---
*Phase: 04-owner-agent-relationship*
*Completed: 2026-02-05*
