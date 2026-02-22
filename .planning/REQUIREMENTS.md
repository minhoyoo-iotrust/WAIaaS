# Requirements: WAIaaS

**Defined:** 2026-02-22
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v27.4 Requirements

Requirements for Admin UI UX 개선. Each maps to roadmap phases.

### Shared Components

- [x] **COMP-01**: ExplorerLink 컴포넌트가 13개 네트워크에 올바른 블록 익스플로러 URL을 렌더링한다
- [x] **COMP-02**: FilterBar 재사용 컴포넌트가 다중 필드 필터링을 URL query params로 지원한다
- [x] **COMP-03**: SearchInput 컴포넌트가 debounce 기반 실시간 텍스트 필터링을 지원한다

### Admin API

- [x] **API-01**: GET /v1/admin/transactions가 크로스 지갑 트랜잭션을 필터/페이지네이션과 함께 반환한다
- [x] **API-02**: GET /v1/admin/incoming이 크로스 지갑 수신 트랜잭션을 필터/페이지네이션과 함께 반환한다

### Transactions Page

- [x] **TXN-01**: /transactions 라우트에서 전체 지갑의 트랜잭션을 단일 테이블로 조회할 수 있다
- [x] **TXN-02**: 트랜잭션 테이블이 시간, 지갑명, 타입 배지, 수신자, 금액(+USD), 네트워크, 상태 배지, txHash 익스플로러 링크를 표시한다
- [x] **TXN-03**: 지갑/타입/상태/네트워크/날짜 범위로 트랜잭션을 필터링할 수 있다
- [x] **TXN-04**: 트랜잭션 목록이 서버사이드 페이지네이션(offset/limit)을 지원한다
- [x] **TXN-05**: txHash 또는 수신자 주소로 트랜잭션을 검색할 수 있다
- [x] **TXN-06**: 트랜잭션 행을 클릭하면 전체 필드가 확장 표시된다

### Token Registry

- [x] **TOKR-01**: /tokens 페이지에서 네트워크 필터로 빌트인 + 커스텀 토큰 목록을 조회할 수 있다
- [x] **TOKR-02**: 컨트랙트 주소 입력 시 온체인 메타데이터 자동 조회 후 커스텀 토큰을 추가할 수 있다
- [x] **TOKR-03**: 커스텀 토큰만 삭제 가능하며 빌트인 토큰은 삭제 불가 표시된다
- [x] **TOKR-04**: 토큰 테이블이 심볼, 이름, 주소, decimals, source 배지를 표시한다

### Incoming TX

- [ ] **INTX-01**: settings.tsx의 수신 TX 설정 필드가 /incoming 독립 페이지로 추출·이전된다
- [ ] **INTX-02**: /incoming 페이지에서 크로스 지갑 수신 트랜잭션 테이블을 조회할 수 있다
- [ ] **INTX-03**: 지갑/체인/상태/suspicious 여부로 수신 TX를 필터링할 수 있다
- [ ] **INTX-04**: 개별 지갑의 수신 모니터링을 활성화/비활성화할 수 있다

### Wallet List

- [ ] **WLST-01**: 지갑 이름 또는 공개키로 실시간 검색 필터링할 수 있다
- [ ] **WLST-02**: 체인/환경/상태로 지갑 목록을 필터링할 수 있다
- [ ] **WLST-03**: 지갑 목록에 기본 네트워크 네이티브 토큰 잔액 + USD 가치가 표시된다

### Wallet Detail

- [ ] **WDET-01**: 지갑 상세 페이지가 Overview/Transactions/Owner/MCP 4탭 구조로 변경된다
- [ ] **WDET-02**: Transactions 탭이 페이지네이션, txHash 익스플로러 링크, 상태/타입 필터를 지원한다
- [ ] **WDET-03**: 각 네트워크 잔액 옆에 USD 환산 가치가 표시된다
- [ ] **WDET-04**: 잔액 섹션에 수동 새로고침 버튼이 있다

### Dashboard

- [x] **DASH-01**: 대시보드에 APPROVAL 티어 대기 트랜잭션 건수 카드가 표시되며 클릭 시 /transactions 필터링으로 이동한다
- [x] **DASH-02**: Failed Txns, Recent Activity 카드 클릭 시 /transactions 해당 필터 적용 페이지로 이동한다
- [x] **DASH-03**: Recent Activity 테이블에 네트워크 컬럼이 추가된다
- [x] **DASH-04**: Recent Activity 테이블에 txHash 컬럼 + 익스플로러 링크가 추가된다

### Notification Log

- [x] **NLOG-01**: 알림 로그를 이벤트 타입, 채널, 상태, 날짜 범위로 필터링할 수 있다
- [x] **NLOG-02**: 알림 로그의 Wallet ID 클릭 시 지갑 상세 페이지로 이동한다

## Future Requirements

### Deferred

- Admin UI 다국어 i18n — 현재 영어 전용
- 다크 모드 Admin UI — CSS Variables 기반 향후 확장 가능
- Admin UI 실시간 WebSocket 데이터 갱신 — 폴링으로 충분

## Out of Scope

| Feature | Reason |
|---------|--------|
| Admin UI 다국어(i18n) | 영어 전용 유지, CSS 확장 가능 구조로 향후 대응 |
| 다크 모드 | CSS Variables 기반 구조는 있으나 이번 스코프 아님 |
| 트랜잭션 실시간 갱신 (WebSocket) | 기존 폴링 패턴으로 충분, 복잡도 대비 효과 낮음 |
| 모바일 반응형 레이아웃 | Desktop 관리 도구, 모바일은 범위 외 |
| 그래프/차트 위젯 (트랜잭션 추이 등) | 운영 기본 기능 우선, 분석 기능은 추후 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| COMP-01 | Phase 239 | Complete |
| COMP-02 | Phase 239 | Complete |
| COMP-03 | Phase 239 | Complete |
| API-01 | Phase 239 | Complete |
| API-02 | Phase 239 | Complete |
| TXN-01 | Phase 240 | Complete |
| TXN-02 | Phase 240 | Complete |
| TXN-03 | Phase 240 | Complete |
| TXN-04 | Phase 240 | Complete |
| TXN-05 | Phase 240 | Complete |
| TXN-06 | Phase 240 | Complete |
| DASH-01 | Phase 240 | Complete |
| DASH-02 | Phase 240 | Complete |
| DASH-03 | Phase 240 | Complete |
| DASH-04 | Phase 240 | Complete |
| TOKR-01 | Phase 241 | Complete |
| TOKR-02 | Phase 241 | Complete |
| TOKR-03 | Phase 241 | Complete |
| TOKR-04 | Phase 241 | Complete |
| NLOG-01 | Phase 241 | Complete |
| NLOG-02 | Phase 241 | Complete |
| INTX-01 | Phase 242 | Pending |
| INTX-02 | Phase 242 | Pending |
| INTX-03 | Phase 242 | Pending |
| INTX-04 | Phase 242 | Pending |
| WLST-01 | Phase 243 | Pending |
| WLST-02 | Phase 243 | Pending |
| WLST-03 | Phase 243 | Pending |
| WDET-01 | Phase 243 | Pending |
| WDET-02 | Phase 243 | Pending |
| WDET-03 | Phase 243 | Pending |
| WDET-04 | Phase 243 | Pending |

**Coverage:**
- v27.4 requirements: 32 total
- Mapped to phases: 32
- Unmapped: 0

---
*Requirements defined: 2026-02-22*
*Last updated: 2026-02-22 after roadmap creation -- traceability complete*
