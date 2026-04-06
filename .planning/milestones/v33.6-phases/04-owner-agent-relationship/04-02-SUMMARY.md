---
phase: 04-owner-agent-relationship
plan: 02
subsystem: agent-management
tags: [agent-lifecycle, state-machine, key-rotation, drain-then-rotate, squads, heartbeat]
requires:
  - phase: 03-system-architecture
    provides: Dual Key architecture, IKeyManagementService, Circuit Breaker, anomaly detection
provides:
  - 에이전트 5단계 상태 모델 (CREATING→ACTIVE→SUSPENDED→TERMINATING→TERMINATED)
  - 에이전트 생성 8단계 / 폐기 9단계 프로세스
  - Drain-then-Rotate 키 로테이션 10단계
  - SUSPENDED 온체인 보안 처리 (SpendingLimit 비활성화)
  - Heartbeat 비활성 감지 메커니즘
  - Agent / AgentStatus 데이터 모델 (TypeScript + Prisma)
affects: [04-03, 05-api-integration]
tech-stack:
  added: []
  patterns: [5-state lifecycle, Drain-then-Rotate, SUSPENDED SpendingLimit deactivation, Heartbeat monitoring, AddMember-before-RemoveMember]
key-files:
  created: [.planning/deliverables/15-agent-lifecycle-management.md]
  modified: []
key-decisions:
  - SUSPENDED 시 Squads SpendingLimit 비활성화 (RemoveSpendingLimit) - defense-in-depth
  - 키 로테이션은 Drain-then-Rotate 패턴 (SUSPENDED → 키 교체 → 소유자 재활성화)
  - AddMember → RemoveMember 순서 엄수 (레이스 컨디션 방지)
  - 비활성 타임아웃은 SUSPENDED만, 자금 자동 회수 안 함
  - TERMINATED는 불가역 최종 상태
  - SUSPENDED → ACTIVE는 소유자 수동 승인만 허용 (자동 재활성화 금지)
  - 폐기 시 ChangeThreshold(1) → 잔액 회수 → RemoveMember 순서 (Pitfall 4)
patterns-established:
  - 5단계 상태 머신 (CREATING, ACTIVE, SUSPENDED, TERMINATING, TERMINATED)
  - Drain-then-Rotate 키 로테이션 패턴 (10단계, 듀얼 키 상태 안전 처리)
  - SUSPENDED SpendingLimit 비활성화 패턴 (온체인 defense-in-depth)
  - Heartbeat 기반 비활성 감지 (Redis TTL)
  - AgentStatusHistory 감사 이력 테이블
duration: 5min
completed: 2026-02-05
---

# Phase 4 Plan 02: 에이전트 생명주기 및 키 관리 설계 Summary

에이전트 5단계 상태 머신(CREATING→ACTIVE→SUSPENDED→TERMINATING→TERMINATED)을 Mermaid 다이어그램으로 정의하고, 생성(8단계)/폐기(9단계)/Drain-then-Rotate 키 로테이션(10단계) 프로세스를 설계함. SUSPENDED 시 Squads SpendingLimit 비활성화(Pitfall 2)와 AddMember→RemoveMember 순서 엄수(Pitfall 3)로 온체인 보안 강화.

## What Was Done

### Task 1: 에이전트 생명주기 및 키 관리 설계 문서 작성 (REL-03)
- **파일:** `.planning/deliverables/15-agent-lifecycle-management.md`
- **커밋:** `85a9d24`
- **내용:**
  - 에이전트 5단계 상태 모델 (stateDiagram-v2): CREATING, ACTIVE, SUSPENDED, TERMINATING, TERMINATED
  - 각 상태별 온체인/오프체인 매핑 테이블 (서버 DB, Squads 멤버, SpendingLimit, 트랜잭션 허용 여부)
  - 상태 전환 규칙: 자동/수동 구분, 트리거 주체 명시
  - SUSPENDED 온체인 보안 처리: RemoveSpendingLimit으로 defense-in-depth (Pitfall 2)
  - 에이전트 생성 8단계 프로세스: API 요청 → DB 레코드 → 멀티시그 생성 → Agent Key 생성 → AddMember → AddSpendingLimit → 자금 충전 → ACTIVE
  - 에이전트 폐기 9단계 프로세스: TERMINATING → 차단 → 진행 중 TX 처리 → RemoveSpendingLimit → ChangeThreshold(1) → 잔액 회수 → RemoveMember → 키 삭제 → TERMINATED
  - Drain-then-Rotate 키 로테이션 10단계: SUSPENDED → SpendingLimit 제거 → Drain 대기 → Proposal stale → 새 키 생성 → AddMember → RemoveMember → 키 삭제 → SpendingLimit 재설정 → ACTIVE
  - 레이스 컨디션 방지: AddMember before RemoveMember, 듀얼 키 상태 안전성 분석 (Pitfall 3)
  - Agent/AgentStatus TypeScript 인터페이스, AgentStatusTransition 이력 인터페이스
  - Prisma 스키마: agents, agent_status_history, agent_key_rotations 테이블
  - Redis 캐시 키: agent:{id}:status, agent:{id}:last_heartbeat, agent:{id}:circuit_breaker
  - Heartbeat 비활성 감지: 30초 주기, 60분 타임아웃, 자동 SUSPENDED (자금 회수는 수동)
  - 정기(90일) vs 긴급 키 로테이션 트리거 비교
  - Mermaid 다이어그램 5개: 상태 전이도, 생성 시퀀스, 폐기 시퀀스, 키 로테이션 시퀀스, SUSPENDED 온체인 처리

## Decisions Made

| 결정 | 근거 |
|------|------|
| SUSPENDED 시 SpendingLimit 비활성화 (RemoveSpendingLimit) | Agent Key가 Enclave 외부에서 SpendingLimitUse를 직접 호출하는 이론적 위험. defense-in-depth 원칙. |
| Drain-then-Rotate 패턴 | 키 로테이션 중 진행 중 트랜잭션과의 레이스 컨디션 방지. 먼저 SUSPENDED로 모든 활동을 배수. |
| AddMember → RemoveMember 순서 | 역순(제거 먼저)이면 AddMember 실패 시 에이전트 키가 없는 상태 → Vault 접근 불가. |
| 비활성 타임아웃 = SUSPENDED만 | 자금 자동 회수는 위험 (네트워크 장애 등 일시적 중단 시 의도치 않은 자금 이동). |
| TERMINATED 불가역 | 에이전트 폐기는 최종 결정. 복원 필요 시 새 에이전트 생성. |
| SUSPENDED → ACTIVE는 소유자 수동만 | 자동 재활성화 금지: 이상 탐지로 정지된 에이전트가 자동 복구되면 보안 위험 재발. |
| ChangeThreshold(1) → 잔액 회수 → RemoveMember | Pitfall 4: 멤버 먼저 제거하면 threshold=2에 멤버 1명 → Vault 잠김. |

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

| 검증 항목 | 결과 |
|----------|------|
| 5개 상태 언급 횟수 | 112회 (기준: >= 10) |
| stateDiagram | 1개 (기준: >= 1) |
| Mermaid 다이어그램 | 5개 (기준: >= 5) |
| 키 로테이션 언급 | 16회 (기준: >= 3) |
| Pitfall 2 반영 (SpendingLimit 비활성화) | 19회 (기준: >= 1) |
| Pitfall 3 반영 (레이스 컨디션) | 7회 (기준: >= 1) |
| TypeScript 인터페이스 | 4개 (기준: >= 2) |
| Heartbeat/비활성 언급 | 30회 (기준: >= 2) |
| 문서 라인 수 | 1,065줄 |

## Next Phase Readiness

- **04-03 (비상 회수/멀티 에이전트):** 본 문서의 SUSPENDED/TERMINATING 상태 전환이 비상 회수 프로세스의 기반
- **05 (API 설계):** Agent 데이터 모델, AgentStatus enum, Heartbeat 프로토콜이 API 엔드포인트 설계에 직접 활용
- **차단 요소:** 없음
