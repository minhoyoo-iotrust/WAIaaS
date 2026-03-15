# Requirements: WAIaaS v32.0 Contract Name Resolution

**Defined:** 2026-03-15
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인이 자금 통제권을 유지하면서.

## v1 Requirements

Requirements for v32.0. Each maps to roadmap phases.

### Registry

- [x] **REG-01**: ContractNameRegistry는 주소+네트워크로 사람이 읽을 수 있는 이름을 동기적으로 반환한다
- [x] **REG-02**: 4단계 우선순위로 해석한다 (Action Provider > Well-known > CONTRACT_WHITELIST name > Fallback)
- [x] **REG-03**: 해석 결과에 source 필드를 포함한다 (action_provider / well_known / whitelist / fallback)
- [x] **REG-04**: EVM 주소는 대소문자 무관하게 매칭한다 (lowercase 정규화)
- [x] **REG-05**: 동일 주소가 다른 네트워크에서 다른 컨트랙트일 수 있으므로 per-network compound key로 구분한다
- [x] **REG-06**: 미등록 주소는 축약 포맷(0xabcd...1234)으로 fallback한다

### Well-known Data

- [x] **WKD-01**: Well-known 컨트랙트 레지스트리에 5개 EVM 체인(Ethereum/Base/Arbitrum/Optimism/Polygon) 데이터를 수록한다
- [x] **WKD-02**: Solana mainnet-beta 프로그램 주소 데이터를 수록한다
- [x] **WKD-03**: 최소 300개 이상의 well-known 엔트리를 확보한다
- [x] **WKD-04**: 데이터는 정적 TypeScript const 오브젝트로 @waiaas/core에 위치한다
- [x] **WKD-05**: 각 엔트리는 address, name, protocol, network 필드를 포함한다

### Action Provider

- [x] **APR-01**: IActionProvider metadata에 optional displayName 필드를 추가한다
- [x] **APR-02**: 기존 20+ 프로바이더에 displayName을 설정한다
- [x] **APR-03**: displayName 미설정 시 metadata.name에서 snake_case를 자동 변환한다 (jupiter_swap → Jupiter Swap)

### Notification

- [x] **NTF-01**: CONTRACT_CALL의 TX_REQUESTED 알림에 해석된 컨트랙트 이름을 표시한다
- [x] **NTF-02**: CONTRACT_CALL의 TX_APPROVAL_REQUIRED 알림에 해석된 컨트랙트 이름을 표시한다
- [x] **NTF-03**: CONTRACT_CALL의 TX_SUBMITTED 알림에 해석된 컨트랙트 이름을 표시한다
- [x] **NTF-04**: CONTRACT_CALL의 TX_CONFIRMED 알림에 해석된 컨트랙트 이름을 표시한다
- [x] **NTF-05**: 이름 표시 포맷은 "Protocol Name (0xabcd...1234)" 형태이다
- [x] **NTF-06**: TRANSFER/TOKEN_TRANSFER 등 비 CONTRACT_CALL 타입은 기존 {to} 동작을 유지한다

### Admin UI / API

- [x] **ADM-01**: TxDetailResponse에 contractName 필드를 추가한다 (nullable)
- [x] **ADM-02**: TxDetailResponse에 contractNameSource 필드를 추가한다 (nullable)
- [x] **ADM-03**: Admin UI 트랜잭션 목록에서 CONTRACT_CALL 행에 컨트랙트 이름을 표시한다
- [x] **ADM-04**: Admin UI 지갑 상세 Activity 탭에서 CONTRACT_CALL 행에 컨트랙트 이름을 표시한다

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Extended Resolution

- **EXT-01**: ENS 리버스 리졸루션으로 well-known 미등록 EVM 컨트랙트 이름 해석
- **EXT-02**: Etherscan/Solscan API 라벨 조회 (API 키 필요)
- **EXT-03**: 사용자 편집 가능 주소록 (CONTRACT_WHITELIST name 확장)
- **EXT-04**: 트랜잭션 calldata 디코딩 ("이 컨트랙트에서 무엇을 할 것인가" 표시)

## Out of Scope

| Feature | Reason |
|---------|--------|
| ENS/SNS 리버스 리졸루션 | DeFi 컨트랙트 <5% 설정률, 외부 의존성+RPC 비용 대비 효과 미미 |
| Etherscan API 라벨 조회 | API 키 관리+rate limit+프라이버시 노출, self-hosted 설계 원칙 위반 |
| 온체인 name() 호출 | 대부분 프록시 컨트랙트는 name() 미구현, 비동기 RPC 비용 |
| 트랜잭션 시뮬레이션/calldata 디코딩 | 별도 마일스톤 범위의 복잡도 |
| DB 테이블 신규 생성 | 정적 데이터로 충분, DB 마이그레이션 불필요 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| REG-01 | Phase 421 | Complete |
| REG-02 | Phase 421 | Complete |
| REG-03 | Phase 421 | Complete |
| REG-04 | Phase 421 | Complete |
| REG-05 | Phase 421 | Complete |
| REG-06 | Phase 421 | Complete |
| WKD-01 | Phase 421 | Complete |
| WKD-02 | Phase 421 | Complete |
| WKD-03 | Phase 421 | Complete |
| WKD-04 | Phase 421 | Complete |
| WKD-05 | Phase 421 | Complete |
| APR-01 | Phase 421 | Complete |
| APR-02 | Phase 421 | Complete |
| APR-03 | Phase 421 | Complete |
| NTF-01 | Phase 422 | Complete |
| NTF-02 | Phase 422 | Complete |
| NTF-03 | Phase 422 | Complete |
| NTF-04 | Phase 422 | Complete |
| NTF-05 | Phase 422 | Complete |
| NTF-06 | Phase 422 | Complete |
| ADM-01 | Phase 423 | Complete |
| ADM-02 | Phase 423 | Complete |
| ADM-03 | Phase 423 | Complete |
| ADM-04 | Phase 423 | Complete |

**Coverage:**
- v1 requirements: 24 total
- Mapped to phases: 24
- Unmapped: 0

---
*Requirements defined: 2026-03-15*
*Last updated: 2026-03-15 after Phase 423 completion (milestone v32.0 complete)*
