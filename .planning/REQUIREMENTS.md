# Requirements: WAIaaS v33.4 서명 앱 명시적 선택

**Defined:** 2026-04-02
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인이 자금 통제권을 유지하면서.

## v1 Requirements

Requirements for milestone v33.4. Each maps to roadmap phases.

### DB Migration

- [x] **MIG-01**: DB v61 마이그레이션이 `wallet_apps(wallet_type) WHERE signing_enabled = 1`에 partial unique index를 생성한다
- [x] **MIG-02**: 마이그레이션이 같은 wallet_type에 `signing_enabled = 1`인 앱이 여러 개인 경우 `created_at` 가장 빠른 앱만 유지하고 나머지를 비활성화한다
- [x] **MIG-03**: 마이그레이션이 `signing_enabled IN (0, 1)` CHECK 제약 조건을 추가한다

### Backend

- [x] **SVC-01**: WalletAppService `update()`에서 `signingEnabled = true` 설정 시 같은 wallet_type의 다른 앱을 트랜잭션 내에서 자동으로 `signing_enabled = 0`으로 변경한다
- [x] **SVC-02**: WalletAppService `register()`에서 같은 wallet_type에 이미 `signing_enabled = 1`인 앱이 있으면 새 앱을 `signing_enabled = 0`으로 등록한다
- [x] **SVC-03**: PresetAutoSetupService가 `signing_sdk.preferred_wallet` 설정 대신 `signing_enabled` 컬럼을 사용하도록 변경한다

### SignRequestBuilder

- [ ] **SIG-01**: SignRequestBuilder가 `walletName` 기반 조회 대신 `wallet_type + signing_enabled = 1` 기반으로 서명 대상 앱을 조회한다
- [ ] **SIG-02**: `signing_sdk.preferred_wallet` 설정을 deprecated 처리하고 wallet_type 그룹의 signing primary가 대체한다

### Admin UI

- [ ] **ADM-01**: Human Wallet Apps 페이지에서 같은 wallet_type의 앱을 시각적 그룹으로 묶어 표시한다
- [ ] **ADM-02**: 서명 컨트롤을 체크박스에서 라디오 버튼으로 변경하여 그룹 내 하나만 선택 가능하게 한다
- [ ] **ADM-03**: "없음" 라디오 옵션으로 해당 wallet_type의 모든 앱 `signing_enabled = 0` 설정이 가능하다
- [ ] **ADM-04**: wallet_type에 앱이 1개만 있으면 라디오가 자동 선택 상태로 표시된다

### Testing

- [x] **TST-01**: signing_enabled 라디오 토글 시 같은 wallet_type의 다른 앱이 자동으로 0이 되는 단위 테스트
- [x] **TST-02**: partial unique index가 같은 wallet_type에 signing_enabled = 1 중복 삽입을 거부하는 단위 테스트
- [ ] **TST-03**: APPROVAL 티어 TX 생성 시 signing_enabled = 1인 앱의 Push Relay URL로 요청 전송 확인 통합 테스트

## Future Requirements

None — this is a focused, self-contained milestone.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Per-wallet signing app selection | wallet_apps는 전역 테이블, 지갑별 선택은 아키텍처 변경 필요 |
| Signing primary history/audit | 서명 전환 이력 추적은 현재 요구 없음 |
| Multi-sign (여러 앱 동시 서명) | 서명은 단일 디바이스, race condition 방지 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| MIG-01 | Phase 467 | Complete |
| MIG-02 | Phase 467 | Complete |
| MIG-03 | Phase 467 | Complete |
| SVC-01 | Phase 467 | Complete |
| SVC-02 | Phase 467 | Complete |
| SVC-03 | Phase 467 | Complete |
| SIG-01 | Phase 468 | Pending |
| SIG-02 | Phase 468 | Pending |
| ADM-01 | Phase 469 | Pending |
| ADM-02 | Phase 469 | Pending |
| ADM-03 | Phase 469 | Pending |
| ADM-04 | Phase 469 | Pending |
| TST-01 | Phase 467 | Complete |
| TST-02 | Phase 467 | Complete |
| TST-03 | Phase 468 | Pending |

**Coverage:**
- v1 requirements: 15 total
- Mapped to phases: 15
- Unmapped: 0

---
*Requirements defined: 2026-04-02*
*Last updated: 2026-04-02 after roadmap creation*
