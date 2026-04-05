# Phase 4: 소유자-에이전트 관계 모델 - Context

**Gathered:** 2026-02-05
**Status:** Ready for planning

<domain>
## Phase Boundary

소유자(사람)와 에이전트(AI) 간의 자금 흐름, 권한 관리, 비상 절차, 멀티 에이전트 운영 모델을 정의한다. Phase 3에서 확정된 Dual Key 아키텍처(Owner Key + Agent Key), Squads 멀티시그, 3중 정책 검증 레이어 위에서 실제 운영 시나리오를 구체화하는 설계 문서이다.

범위: 자금 충전/회수 프로세스, 에이전트 키 관리(생성/정지/폐기), 비상 회수 메커니즘, 멀티 에이전트 관리 모델
범위 외: API 스펙(Phase 5), 온체인 트랜잭션 실행 로직(구현 마일스톤), 프론트엔드 대시보드 UI(구현 마일스톤)

</domain>

<decisions>
## Implementation Decisions

### 자금 충전 프로세스
- 예산 풀 방식 — 소유자가 에이전트 지갑에 일정 금액을 예치하고, 에이전트가 정책 범위 내에서 사용
- 보충 정책: 자동 보충(잔액 임계값 이하 시)과 알림 후 수동 보충 두 가지 모두 지원
- 소유자가 보충 모드를 선택할 수 있어야 함

### 자금 회수 프로세스
- 에이전트 폐기 시 잔액 전액 자동으로 소유자 지갑에 회수 (사용자 결정)

### 에이전트 생명주기
- 에이전트 폐기 시 잔여 자금은 자동으로 소유자 지갑에 회수 (사용자 결정)

### 멀티 에이전트 관리
- 에이전트 간 자금 이동: 허용 — 소유자가 설정한 정책 범위 내에서 에이전트 간 직접 이동 가능
- 에이전트 역할 구분: 불필요 — 모든 에이전트가 동일한 권한, 예산 한도로만 구분
- 통합 대시보드: 필요 — 소유자가 모든 에이전트의 상태/잔액/활동을 한곳에서 확인하는 API 지원

### Claude's Discretion
- 자금 회수 트리거 설계 (수동 회수, 자동 회수 규칙 등)
- 예산 한도 단위 설계 (건당/일일/월간 등 한도 체계)
- 에이전트 생성 시 초기 설정 플로우 (필수 입력, 기본값 정책)
- 에이전트 상태 모델 (활성/정지/폐기 등 상태 전환)
- 키 로테이션 시 진행 중 트랜잭션 처리 절차
- 비상 회수 트리거 주체 (소유자 수동 / 시스템 자동 / 혼합)
- 타임락 설계 (에이전트 비활성 시 자동 비상 모드 전환 여부)
- 가디언 매커니즘 (소유자 키 분실 대비 복구 경로)
- 비상 회수 시 대기 트랜잭션 처리 방법
- 전체 에이전트 합산 예산 한도 설계

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-owner-agent-relationship*
*Context gathered: 2026-02-05*
