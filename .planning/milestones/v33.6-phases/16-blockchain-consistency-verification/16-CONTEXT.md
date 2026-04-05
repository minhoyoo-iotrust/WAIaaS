# Phase 16: 블록체인 & 일관성 검증 전략 - Context

**Gathered:** 2026-02-06
**Status:** Ready for planning

<domain>
## Phase Boundary

블록체인 의존성을 3단계(Mock RPC / Local Validator / Devnet)로 격리하는 테스트 환경 전략과, v0.3에서 확보한 9개 Enum SSoT 및 config.toml의 자동 검증 방법을 확정한다. 새로운 보안 시나리오나 테스트 레벨 정의는 범위 밖이다(Phase 14-15에서 완료).

</domain>

<decisions>
## Implementation Decisions

### Mock RPC 시나리오 범위
- 충실도(fidelity): Claude 재량 — 시나리오별로 최적 수준 선택 (high-fidelity가 필요한 에러 파싱 경로 vs simplified로 충분한 로직 검증)
- 시나리오 범위: Claude 재량 — SolanaAdapter 에러 매핑(31-solana-adapter-detail.md)과 Phase 15 보안 시나리오를 분석하여 필요한 것만 선별
- 상태 관리: Claude 재량 — 테스트 레벨별로 Stateless/Stateful 적절히 적용 (Unit은 Stateless, E2E는 Stateful 등)
- 패키지 구조: Claude 재량 — 모노레포 7패키지 구조와 재사용 패턴을 분석하여 Mock 위치 결정

### Local Validator 테스트 전략
- E2E 범위: Claude 재량 — Phase 14 테스트 레벨 정의(Chain Integration)와 Phase 15 보안 시나리오를 기준으로 검증 흐름 범위 결정
- Devnet 역할: Claude 재량 — Devnet 안정성과 CI 비용을 고려하여 Local Validator와의 역할 분담 결정
- CI 실행: Claude 재량 — Phase 14의 테스트 레벨 실행 빈도 정의(TLVL-01)에 맞춰 결정
- Airdrop 전략: Claude 재량 — 테스트 성격별로 적절한 SOL 충전 방식 결정

### Enum/설정 검증 자동화 수준
- **Enum SSoT 검증 시점: 빌드타임 체크** — TypeScript 컴파일러 + lint 규칙으로 Enum 불일치 즉시 차단 (가장 빠른 피드백)
- DB 스키마 일치: Claude 재량 — Drizzle ORM 특성과 CHECK 제약 구조를 분석하여 빌드타임/테스트 보완 결정
- config.toml 환경변수 우선순위: Claude 재량 — config 로딩 로직 복잡도에 따라 테스트 레벨 결정
- Enum 변경 방지: Claude 재량 — 프로젝트 규모(9개 Enum)와 4곃(타입/Zod/Drizzle/DB CHECK) 동기화 전략 결정

### NOTE-01~11 테스트 매핑 방식
- 매핑 방식: Claude 재량 — NOTE 내용을 분석하여 성격별로 최적 방식 선택 (1:1 매핑 vs 기존 시나리오 흡수)
- 추적성: Claude 재량 — 프로젝트 규모와 NOTE 성격을 고려하여 추적 수준 결정
- 테스트 불필요 NOTE 처리: Claude 재량 — NOTE 내용을 읽고 테스트 필요/불필요 판단 후 적절히 문서화

### Claude's Discretion
이 Phase에서는 대부분의 구현 세부사항이 Claude 재량에 위임됨. 핵심 제약:
- Enum 검증은 **빌드타임 우선** (사용자 명시적 선택)
- Phase 14(TLVL-01~03, MOCK-01~04)의 테스트 레벨/Mock 경계 정의를 반드시 준수
- Phase 15(SEC-01~05)의 보안 시나리오와 충돌하지 않아야 함
- v0.3 SSoT 문서(45-enum-unified-mapping.md, 24-monorepo config.toml)가 검증 대상의 기준

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. 사용자가 전 영역에서 Claude 판단에 위임하되, Enum 검증만 빌드타임 체크를 명시적으로 선택함.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 16-blockchain-consistency-verification*
*Context gathered: 2026-02-06*
