# Requirements: WAIaaS v28.0 기본 DeFi 프로토콜 설계

**Defined:** 2026-02-23
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v1 Requirements

v28.0 설계 마일스톤 요구사항. 각 설계 산출물은 m28-01~m28-05 구현 마일스톤의 입력으로 소비된다.

### 패키지 구조 (DEFI-01)

- [x] **PKGS-01**: packages/actions/ 디렉토리 구조가 확정되어 m28-01에서 패키지 스캐폴딩을 바로 생성할 수 있다
- [x] **PKGS-02**: 내장 프로바이더 등록/해제 라이프사이클이 설계되어 데몬 시작 시 enabled 프로바이더만 로딩하는 방식이 명확하다
- [x] **PKGS-03**: config.toml [actions.*] 공통 스키마 패턴이 정의되어 프로바이더별 설정 추가 시 일관된 구조를 따른다
- [x] **PKGS-04**: Admin Settings 런타임 변경 가능 설정 항목(API 키, 슬리피지 등)이 정의되어 config.toml vs Admin Settings 경계가 명확하다

### API 변환 패턴 (DEFI-02)

- [x] **APIC-01**: ActionApiClient 베이스 패턴(native fetch + AbortController 타임아웃 + Zod 응답 검증)이 설계되어 4개 프로바이더 API 클라이언트의 공통 기반으로 사용할 수 있다
- [x] **APIC-02**: 외부 REST API 응답 → ContractCallRequest 변환 매핑이 Solana(programId/instructionData/accounts)와 EVM(to/data/value) 양쪽에 대해 정의된다
- [x] **APIC-03**: DeFi 에러 코드(ACTION_API_ERROR, ACTION_RATE_LIMITED, PRICE_IMPACT_TOO_HIGH)가 기존 에러 체계에 추가 설계된다
- [x] **APIC-04**: 슬리피지 제어 공통 로직(기본값/상한/클램핑)이 프로바이더별 단위(Jupiter=bps, 0x/LI.FI=pct)를 포함하여 설계된다
- [x] **APIC-05**: 0x AllowanceHolder 토큰 승인 플로우가 Permit2 대신 설계되어, 기존 APPROVE 파이프라인 타입과의 연동이 명확하다

### 정책 연동 (DEFI-03)

- [x] **PLCY-01**: ActionProvider → 정책 평가 연동 플로우가 다이어그램으로 정의되어 resolve() 결과가 파이프라인 Stage 2에 도달하는 경로가 명확하다
- [x] **PLCY-02**: 4개 프로토콜의 CONTRACT_WHITELIST 등록 대상(프로그램/컨트랙트 주소)이 확정되어 구현 시 화이트리스트 설정을 바로 생성할 수 있다
- [x] **PLCY-03**: 크로스체인 정책 평가 규칙이 확정되어 출발 체인 월렛의 정책으로 평가하는 방식이 명문화된다
- [x] **PLCY-04**: 크로스체인 도착 주소 정책 검증 설계가 완료되어 목적지 주소 변조 공격을 방지할 수 있다

### 비동기 추적 (DEFI-04)

- [ ] **ASNC-01**: AsyncStatusTracker 공통 인터페이스가 설계되어 브릿지/unstake/가스대기 3개 구현체가 동일 패턴을 따를 수 있다
- [ ] **ASNC-02**: 폴링 스케줄러 설계(setTimeout 체인, 간격/최대횟수 설정)가 완료되어 BackgroundWorkers에 통합 가능하다
- [ ] **ASNC-03**: 통합 DB 마이그레이션 설계(bridge_status + bridge_metadata 컬럼 + GAS_WAITING 상태)가 단일 마이그레이션으로 확정된다
- [ ] **ASNC-04**: 트랜잭션 상태 머신이 8-state → 9-state(GAS_WAITING 추가)로 확장 설계되어 전이 다이어그램이 완성된다
- [ ] **ASNC-05**: 브릿지 타임아웃 정책이 설계되어 2시간+ 폴링, 자동 취소 방지, BRIDGE_MONITORING 전환이 명확하다

### 테스트 전략 (DEFI-05)

- [ ] **TEST-01**: mock API 응답 픽스처 공통 구조가 설계되어 4개 프로바이더 테스트에서 일관된 패턴으로 mock을 구성할 수 있다
- [ ] **TEST-02**: 프로바이더 테스트 헬퍼(createMockApiResponse, assertContractCallRequest)가 설계되어 반복 코드를 최소화한다
- [ ] **TEST-03**: 4개 프로토콜 × 공통 시나리오 매트릭스가 정의되어 각 프로바이더가 검증해야 할 테스트 목록이 명확하다

### 안전성 설계

- [ ] **SAFE-01**: Jito MEV 보호 fail-closed 설계가 완료되어 Jito 미가용 시 공개 멤풀 폴백 없이 실패하는 방식이 확정된다
- [ ] **SAFE-02**: stETH 리베이스 대응 아키텍처 결정(stETH vs wstETH)이 완료되어 잔액 추적, 정책 평가, 전액 전송 시나리오에 대한 방침이 확정된다
- [ ] **SAFE-03**: 가스 조건부 실행 시 stale calldata 재조회 패턴이 설계되어 대기 후 실행 시 신선한 견적으로 교체하는 플로우가 명확하다
- [ ] **SAFE-04**: 외부 API 드리프트 대응 전략(Zod strict 검증 + 버전 고정 + 실패 로깅)이 설계되어 API 변경 시 안전하게 실패하는 방식이 명확하다

## Future Requirements

다음 마일스톤(m28-01~m28-05 구현)에서 다루거나 이후로 연기.

### 구현 단계

- **IMPL-01**: Yield farming / LP position management (impermanent loss 복잡도 10x — 별도 마일스톤 필요)
- **IMPL-02**: Limit orders / TWAP execution (지속적 오더북 모니터링, 부분 체결 — 가스 조건부 실행이 "조건부 대기" 유즈케이스를 대체)
- **IMPL-03**: Leveraged positions / lending (Aave, Compound — 청산 위험, 자율 에이전트에 위험)
- **IMPL-04**: wstETH wrapping / L2 Lido staking (v1에서 stETH mainnet 먼저, L2 확장은 이후)
- **IMPL-05**: Real-time yield comparison across protocols (yield aggregator는 지갑 인프라 범위 밖)
- **IMPL-06**: Admin UI staking dashboard with APY visualization (구현 마일스톤 m28-04에서 상세 설계)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Intent-based / gasless swap (Jupiter Ultra, 1inch Fusion) | WAIaaS는 6-stage 파이프라인 통한 트랜잭션 통제가 핵심. 가스리스 API는 이 통제를 제거함 |
| Token sniping / MEV extraction | 윤리적 문제 + 규제 리스크. WAIaaS는 MEV 방어(protection)만 제공, 공격(extraction) 불가 |
| Automatic portfolio rebalancing | 에이전트 애플리케이션 로직이지 지갑 인프라가 아님. 도구(swap/stake)만 제공 |
| Multi-hop manual route construction | Jupiter/0x/LI.FI 애그리게이터가 최적 경로를 자동 계산. 수동 구성 불필요 |
| 개별 브릿지 직접 통합 (Wormhole, Stargate 등) | LI.FI 메타 애그리게이터가 100+ 브릿지를 단일 API로 집계. 개별 통합 대비 유지보수 비용 최소화 |

## Traceability

요구사항 -> 페이즈 매핑. 로드맵 생성 시 업데이트.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PKGS-01 | Phase 244 | Complete |
| PKGS-02 | Phase 244 | Complete |
| PKGS-03 | Phase 244 | Complete |
| PKGS-04 | Phase 244 | Complete |
| APIC-01 | Phase 244 | Complete |
| APIC-02 | Phase 244 | Complete |
| APIC-03 | Phase 244 | Complete |
| APIC-04 | Phase 244 | Complete |
| APIC-05 | Phase 244 | Complete |
| PLCY-01 | Phase 244 | Complete |
| PLCY-02 | Phase 244 | Complete |
| PLCY-03 | Phase 244 | Complete |
| PLCY-04 | Phase 244 | Complete |
| ASNC-01 | Phase 245 | Pending |
| ASNC-02 | Phase 245 | Pending |
| ASNC-03 | Phase 245 | Pending |
| ASNC-04 | Phase 245 | Pending |
| ASNC-05 | Phase 245 | Pending |
| TEST-01 | Phase 245 | Pending |
| TEST-02 | Phase 245 | Pending |
| TEST-03 | Phase 245 | Pending |
| SAFE-01 | Phase 245 | Pending |
| SAFE-02 | Phase 245 | Pending |
| SAFE-03 | Phase 245 | Pending |
| SAFE-04 | Phase 245 | Pending |

**Coverage:**
- v1 requirements: 25 total
- Mapped to phases: 25
- Unmapped: 0

---
*Requirements defined: 2026-02-23*
*Last updated: 2026-02-23 after roadmap creation*
