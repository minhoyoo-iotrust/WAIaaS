# Phase 14: 테스트 기반 정의 - Context

**Gathered:** 2026-02-06
**Status:** Ready for planning

<domain>
## Phase Boundary

전체 테스트 전략의 뼈대를 확정한다. 6개 테스트 레벨의 정의, 9개 모듈별 테스트 매트릭스, 패키지별 커버리지 목표, 5개 외부 의존성의 Mock 방식, IClock/ISigner 인터페이스 스펙과 기존 인터페이스의 Contract Test 전략을 문서화한다. 개별 도메인 시나리오(보안 공격, 블록체인 환경, CI/CD 등)는 Phase 15~18에서 다룬다.

</domain>

<decisions>
## Implementation Decisions

### 커버리지 기준 철학
- 보안 위험도 기반 차등 적용: 키스토어/세션/정책 등 보안 critical 모듈은 90%+, 일반 모듈 80%, 유틸리티/CLI 70%
- 커버리지 수치에 포함하는 테스트 레벨: Unit + Integration만 (E2E는 별도 관리)
- CI 게이트: 단계적 적용 — 초기 soft gate(경고만), 안정화 후 hard gate(PR 차단)로 전환
- 커버리지 측정 단위: Claude 판단 (패키지별 역할과 복잡도 분석 후 적절한 측정 단위 제시)

### 테스트 실행 전략
- 로컬 개발: Watch 모드 기본 (파일 변경 시 자동 실행)
- 테스트 프레임워크: Jest
- 실행 빈도: 표준 피라미드 — Unit 매 커밋, Integration 매 PR, E2E/Security nightly/릴리스
- 속도 vs 충실도 균형: Claude 판단 (테스트 레벨별 특성 분석 후 최적 전략 제시)

### Mock 경계 철학
- 블록체인 RPC: Mock-first — Unit/Integration에서는 Mock RPC, Local Validator는 E2E에서만 (Phase 16에서 상세화)
- 알림 채널(Telegram/Discord/ntfy.sh): 완전 Mock — 모든 레벨에서 Mock, 실제 채널 호출 없음
- 시간(IClock): DI 인터페이스 — IClock 인터페이스로 주입, 테스트 시 FakeClock 사용 (JWT 만료, 타임락 등 시간 제어)
- Owner 서명(ISigner): DI 인터페이스 — ISigner 인터페이스로 주입, 테스트 시 고정 키쌍으로 서명/검증
- 파일시스템: 레벨별 분리 — Unit에서 메모리 기반 mock, Integration에서 임시 디렉토리 사용

### 테스트 인터페이스 설계 방향
- Contract Test: 전체 인터페이스 적용 (IChainAdapter, IPolicyEngine, INotificationChannel, IClock, ISigner)
- IClock 범위: 최소한 — now(): Date만 제공, setTimeout/setInterval은 Jest mock 사용
- ISigner 범위: Claude 판단 (Owner 서명만 vs Owner+Agent 통합, 서명 흐름 분석 후 결정)
- IChainAdapter Mock 검증: 13개 메소드 전체에 대해 Mock 구현 가능성과 Contract Test 작성

### Claude's Discretion
- 커버리지 측정 단위 (패키지 단위 vs 패키지+모듈 혼합)
- 속도 vs 충실도 균형에서의 테스트 레벨별 최적화 전략
- ISigner 인터페이스의 Owner 전용 vs Owner+Agent 통합 범위 결정
- 파일시스템 Mock의 구체적 구현 방식

</decisions>

<specifics>
## Specific Ideas

- Jest 선택 — 넓은 생태계, 안정적 matcher, 기존 경험 활용
- Watch 모드 기본 — 빠른 피드백 루프로 개발 생산성 확보
- DI 기반 시간/서명 mock — 코드 수준에서 테스트 가능성 확보 (Jest fake timer와 병행 가능)
- 단계적 gate — 프로젝트 초기 유연성 확보 후 점진적 엄격화

</specifics>

<deferred>
## Deferred Ideas

None — 논의가 Phase 14 범위 내에 머물렀음

</deferred>

---

*Phase: 14-test-foundation*
*Context gathered: 2026-02-06*
