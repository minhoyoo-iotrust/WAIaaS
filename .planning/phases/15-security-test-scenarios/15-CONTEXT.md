# Phase 15: 보안 테스트 시나리오 - Context

**Gathered:** 2026-02-06
**Status:** Ready for planning

<domain>
## Phase Boundary

WAIaaS 3계층 보안 모델(세션 인증 / 정책 엔진+Time-Lock / Kill Switch+AutoStop)의 모든 공격 벡터를 시나리오로 문서화한다. v0.2에서 설계한 보안 계층들을 어떤 공격 관점에서 테스트할지 정의하는 것이 목적이며, 새로운 보안 기능 추가가 아닌 기존 설계의 검증 기준 확립이다.

</domain>

<decisions>
## Implementation Decisions

### 시나리오 깊이/형식
- **테스트 케이스 수준**으로 정의: 공격명 / 공격 단계 / 기대 방어 / Given-When-Then 테스트 케이스
- Given절에 **Mock 설정을 명시**하여 Phase 14의 Mock 경계 매트릭스와 직접 연결
- 각 시나리오에 **우선순위 태그(Critical/High/Medium)** 부여 — 구현 순서 결정에 활용
- 테스트 레벨(Unit/Integration/E2E 등) 명시하여 Phase 14 테스트 레벨 매트릭스와 연결

### 공격자 모델 & 위협 우선순위
- **주요 공격자: 악의적 AI 에이전트** — WAIaaS의 핵심 위협 모델
  - 유효한 세션 토큰을 보유하지만 세션 범위를 초과하려 시도
  - 다른 에이전트의 세션 탈취 시도 포함
  - 정책 우회, 한도 소진, 타이밍 공격 등 정교한 공격까지 가정
- **외부 위협**: Claude 재량 — WAIaaS 아키텍처(localhost 기반)에 맞는 수준으로 포함 (localhost 바이패스, 파일시스템 접근 등)
- **우선순위 기준: 자금 손실 가능성**
  - Critical = 자금 직접 유출 가능
  - High = 자금 유출 경로 열림 (추가 단계 필요)
  - Medium = 정보 노출 / 가용성 저하

### 경계값 테스트 범위
- **금액 경계**: 4-tier 전체 (0.1/1/10 SOL)에 ±1 패턴 적용 (0.099/0.1/0.101 등)
- **시간 경계**: 전체 시간 경계값 포함
  - JWT 만료(exp), DELAY 쿨다운(15분), APPROVAL 타임아웃(1시간)
  - 세션 최대 수명(7일), blockhash 만료(50초)
  - 각각 -1초/정확히/+1초 패턴 적용
- **동시성(TOCTOU) 경계**: 포함
  - reserved_amount 동시 경합 시나리오
  - 동시 트랜잭션으로 한도 초과 시도
  - BEGIN IMMEDIATE 락 검증

### 보안 레벨 간 연쇄 시나리오
- **End-to-End 공격 체인** 형태로 정의: Layer 1 돌파 → Layer 2 우회 시도 → Layer 3 발동까지 전체 체인
- **성공 + 실패 모두** 포함: 각 계층에서 막히는 케이스와 돌파되는 케이스 양쪽
- **복구 흐름까지 E2E**: 공격 → 방어(Kill Switch) → RECOVERING → dual-auth 복구 → 정상 운영 복귀
- **3-5개 핵심 체인**: 가장 현실적인 공격 체인을 엄선하여 상세 정의 (개별 계층 시나리오가 이미 25건+이므로)

### Claude's Discretion
- 문서 구성 단위 (계층별 1문서 vs 도메인별 분리 등)
- 외부 위협 시나리오의 구체적 범위와 깊이
- 3-5개 핵심 연쇄 체인의 선택 기준

</decisions>

<specifics>
## Specific Ideas

- 테스트 케이스의 Given절에 Phase 14 Mock 경계 매트릭스를 직접 참조하여, 구현 시 바로 테스트 코드로 변환 가능하게
- 우선순위 태그를 통해 구현 단계에서 Critical 시나리오부터 순서대로 테스트 작성 가능
- 연쇄 시나리오는 "공격자 관점 스토리"로 읽힐 수 있게 — 단계별 공격자 행동과 시스템 반응을 교대 서술

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 15-security-test-scenarios*
*Context gathered: 2026-02-06*
