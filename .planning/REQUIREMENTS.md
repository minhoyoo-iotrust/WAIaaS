# Requirements: WAIaaS v29.2 EVM Lending (Aave V3)

**Defined:** 2026-02-26
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v29.2 Requirements

Requirements for EVM Lending framework + Aave V3 provider. Each maps to roadmap phases.

### SSoT Enum + DB Foundation

- [ ] **ENUM-01**: LIQUIDATION_WARNING 등 4개 DeFi 알림 이벤트가 notification enum에 추가됨
- [ ] **ENUM-02**: POSITION_CATEGORIES (LENDING/YIELD/PERP/STAKING) enum이 core/enums/defi.ts에 정의됨
- [ ] **ENUM-03**: POSITION_STATUSES (ACTIVE/CLOSED/LIQUIDATED) enum이 core/enums/defi.ts에 정의됨
- [ ] **ENUM-04**: defi_positions 테이블이 DB 마이그레이션으로 생성됨 (category discriminant, UNIQUE key)
- [ ] **ENUM-05**: DeFi 이벤트 메시지 템플릿이 알림 서비스에 등록됨

### Lending Framework

- [ ] **LEND-01**: ILendingProvider 인터페이스가 IActionProvider를 확장하여 getPosition/getHealthFactor/getMarkets 메서드 제공
- [ ] **LEND-02**: IPositionProvider 인터페이스가 PositionTracker용 읽기 전용 동기화 메서드 제공
- [ ] **LEND-03**: PositionTracker가 등록된 provider별로 5분 간격 포지션 동기화 수행
- [ ] **LEND-04**: PositionTracker가 defi_positions 테이블에 batch upsert로 포지션 캐시
- [ ] **LEND-05**: HealthFactorMonitor가 DB 캐시에서 HF < threshold(기본 1.2) 감지 시 LIQUIDATION_WARNING 발송
- [ ] **LEND-06**: HealthFactorMonitor가 HF < 1.5일 때 폴링 주기를 5분→1분으로 단축 (적응형)
- [ ] **LEND-07**: LendingPolicyEvaluator가 max_ltv_pct 기반 차입 제한 평가
- [ ] **LEND-08**: LendingPolicyEvaluator가 supply/repay를 비지출(non-spending)로 분류하여 SPENDING_LIMIT 미차감
- [ ] **LEND-09**: LendingPolicyEvaluator가 USD 기준 차입 한도 평가

### Aave V3 Provider

- [ ] **AAVE-01**: AaveV3LendingProvider가 supply 액션을 Pool.supply() calldata로 resolve
- [ ] **AAVE-02**: AaveV3LendingProvider가 borrow 액션을 Pool.borrow() calldata로 resolve (variable rate only)
- [ ] **AAVE-03**: AaveV3LendingProvider가 repay 액션을 Pool.repay() calldata로 resolve
- [ ] **AAVE-04**: AaveV3LendingProvider가 withdraw 액션을 Pool.withdraw() calldata로 resolve
- [ ] **AAVE-05**: supply/repay 시 ERC-20 approve를 포함한 multi-step ContractCallRequest[] 반환
- [ ] **AAVE-06**: 5개 EVM 체인(Ethereum/Arbitrum/Optimism/Polygon/Base) Pool/DataProvider/Oracle 주소 매핑
- [ ] **AAVE-07**: getUserAccountData()로 헬스 팩터 조회 (18-decimal bigint 정밀도)
- [ ] **AAVE-08**: 자산별 APY/LTV/유동성 시장 데이터 조회
- [ ] **AAVE-09**: borrow/withdraw 전 HF 시뮬레이션으로 자기 청산 방지
- [ ] **AAVE-10**: manual hex ABI encoding (viem 미사용, Lido 패턴 준수)

### API + MCP + SDK

- [ ] **API-01**: GET /v1/wallets/:id/positions로 DeFi 포지션 목록 조회
- [ ] **API-02**: GET /v1/wallets/:id/health-factor로 헬스 팩터 조회
- [ ] **API-03**: MCP 도구 5개 (aave_supply/borrow/repay/withdraw/positions) 자동 등록
- [ ] **API-04**: TS/Python SDK에서 executeAction('aave_supply', params) 등으로 Lending 액션 실행
- [ ] **API-05**: 포지션 조회 API가 USD 환산 금액 포함

### Admin UI + Settings

- [ ] **ADMN-01**: Admin 대시보드에 DeFi 포지션 섹션 표시 (예치/차입 현황, HF, APY)
- [ ] **ADMN-02**: Admin Settings에서 aave_v3.health_factor_warning_threshold 설정 가능
- [ ] **ADMN-03**: Admin Settings에서 aave_v3.position_sync_interval_sec 설정 가능
- [ ] **ADMN-04**: Admin Settings에서 aave_v3.max_ltv_pct 설정 가능
- [ ] **ADMN-05**: Admin Settings에서 aave_v3.enabled 토글로 프로바이더 활성화/비활성화

## Future Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Lending

- **LEND-10**: E-Mode 지원 (자산 카테고리별 높은 LTV)
- **LEND-11**: Flash loan 지원
- **LEND-12**: Credit delegation (제3자 차입 위임)
- **LEND-13**: Auto-leverage (반복 공급+차입)

### Multi-Protocol

- **LEND-14**: Kamino Lending (Solana) 통합
- **LEND-15**: Morpho Lending (EVM) 통합
- **LEND-16**: Compound V3 통합

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Flash loan 실행 | AI 에이전트 지갑에서 flash loan은 악용 위험 높음 |
| Credit delegation | 복잡한 위험 관리, 별도 설계 필요 |
| Auto-leverage | 반복 공급+차입 자동화는 청산 위험 증가 |
| Liquidation 실행 | 청산 봇 기능은 지갑 시스템 범위 외 |
| Stable rate 차입 | Aave V3 거버넌스에서 비활성화됨 |
| Avalanche 체인 지원 | WAIaaS NETWORK_TYPES 미포함, 향후 추가 가능 |
| 실시간 WebSocket HF 모니터링 | RPC 비용 과다, 폴링 기반으로 충분 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ENUM-01 | Phase 274 | Pending |
| ENUM-02 | Phase 274 | Pending |
| ENUM-03 | Phase 274 | Pending |
| ENUM-04 | Phase 274 | Pending |
| ENUM-05 | Phase 274 | Pending |
| LEND-01 | Phase 274 | Pending |
| LEND-02 | Phase 274 | Pending |
| LEND-03 | Phase 275 | Pending |
| LEND-04 | Phase 275 | Pending |
| LEND-05 | Phase 275 | Pending |
| LEND-06 | Phase 275 | Pending |
| LEND-07 | Phase 275 | Pending |
| LEND-08 | Phase 275 | Pending |
| LEND-09 | Phase 275 | Pending |
| AAVE-01 | Phase 276 | Pending |
| AAVE-02 | Phase 276 | Pending |
| AAVE-03 | Phase 276 | Pending |
| AAVE-04 | Phase 276 | Pending |
| AAVE-05 | Phase 276 | Pending |
| AAVE-06 | Phase 276 | Pending |
| AAVE-07 | Phase 276 | Pending |
| AAVE-08 | Phase 276 | Pending |
| AAVE-09 | Phase 276 | Pending |
| AAVE-10 | Phase 276 | Pending |
| API-01 | Phase 277 | Pending |
| API-02 | Phase 277 | Pending |
| API-03 | Phase 277 | Pending |
| API-04 | Phase 277 | Pending |
| API-05 | Phase 277 | Pending |
| ADMN-01 | Phase 278 | Pending |
| ADMN-02 | Phase 278 | Pending |
| ADMN-03 | Phase 278 | Pending |
| ADMN-04 | Phase 278 | Pending |
| ADMN-05 | Phase 278 | Pending |

**Coverage:**
- v29.2 requirements: 34 total
- Mapped to phases: 34
- Unmapped: 0

---
*Requirements defined: 2026-02-26*
*Last updated: 2026-02-26 after roadmap creation -- traceability updated*
