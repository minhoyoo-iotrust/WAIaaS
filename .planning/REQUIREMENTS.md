# Requirements: WAIaaS

**Defined:** 2026-03-01
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v29.7 Requirements

Requirements for milestone v29.7: D'CENT 직접 서명 + Human Wallet Apps 통합.

### Signing Infrastructure

- [ ] **SIGN-01**: D'CENT 프리셋 적용 시 approval_method가 sdk_ntfy로 설정된다
- [ ] **SIGN-02**: D'CENT 프리셋 description이 "D'CENT hardware wallet with push notification signing"으로 표시된다
- [ ] **SIGN-03**: wallet_type이 설정된 지갑의 서명 요청이 waiaas-sign-{wallet_type} 토픽으로 발행된다
- [ ] **SIGN-04**: wallet_type이 NULL인 지갑은 글로벌 preferred_wallet 설정값으로 토픽이 결정된다
- [ ] **SIGN-05**: wallet_type=NULL이고 preferred_wallet 미설정 시 WALLET_NOT_REGISTERED 에러가 발생한다
- [ ] **SIGN-06**: D'CENT 프리셋 적용 시 PresetAutoSetupService가 signing_sdk 관련 설정을 자동 활성화한다

### Owner UX

- [ ] **OWN-01**: NONE 상태에서 Admin UI로 Wallet Type(프리셋)을 선택할 수 있다
- [ ] **OWN-02**: GRACE 상태에서 Admin UI로 Wallet Type을 변경할 수 있다
- [ ] **OWN-03**: LOCKED 상태에서 Wallet Type이 읽기 전용으로 표시된다
- [ ] **OWN-04**: 프리셋 선택 시 해당 프리셋의 approval method가 미리보기로 표시된다
- [ ] **OWN-05**: 프리셋 변경 시 approval method가 자동으로 갱신된다
- [ ] **OWN-06**: approval_method가 sdk_ntfy일 때 WalletConnect 섹션이 숨겨진다
- [ ] **OWN-07**: approval_method가 walletconnect일 때 WalletConnect 섹션이 표시된다

### Wallet Apps Registry

- [ ] **APP-01**: wallet_apps 테이블이 DB migration v31로 생성된다
- [ ] **APP-02**: WalletAppService로 지갑 앱을 등록(name, display_name)할 수 있다
- [ ] **APP-03**: WalletAppService로 지갑 앱 목록을 조회할 수 있다
- [ ] **APP-04**: WalletAppService로 지갑 앱의 signing_enabled/alerts_enabled를 토글할 수 있다
- [ ] **APP-05**: WalletAppService로 지갑 앱을 삭제할 수 있다
- [ ] **APP-06**: REST API(GET/POST/PUT/DELETE /v1/admin/wallet-apps)로 지갑 앱 CRUD가 가능하다
- [ ] **APP-07**: 동일 name으로 중복 등록 시 409 Conflict가 반환된다
- [ ] **APP-08**: signing_enabled=0인 앱의 지갑에서 서명 요청 시 SIGNING_DISABLED 에러가 발생한다
- [ ] **APP-09**: 프리셋 적용 시 해당 앱이 wallet_apps에 자동 등록된다
- [ ] **APP-10**: GET /v1/admin/wallet-apps 응답에 "used_by" 필드로 해당 앱을 사용하는 지갑 목록이 포함된다

### Human Wallet Apps UI

- [ ] **HWUI-01**: Admin 사이드바에 Human Wallet Apps 최상위 메뉴가 표시된다
- [ ] **HWUI-02**: System 페이지에서 Signing SDK 서브섹션이 제거된다
- [ ] **HWUI-03**: Human Wallet Apps 페이지에 wallet_apps 기반 앱 카드가 표시된다
- [ ] **HWUI-04**: 앱 카드에서 Signing 토글을 켜고 끌 수 있다
- [ ] **HWUI-05**: 앱 카드에서 Alerts 토글을 켜고 끌 수 있다
- [ ] **HWUI-06**: 앱 카드에 "Used by" 지갑 목록이 표시된다
- [ ] **HWUI-07**: 페이지 상단에서 ntfy 서버 URL을 설정할 수 있다
- [ ] **HWUI-08**: [+ Register App] 버튼으로 새 앱을 등록할 수 있다
- [ ] **HWUI-09**: [Remove] 버튼으로 앱을 삭제할 수 있다

### Notification Routing

- [x] **NOTI-01**: WalletNotificationChannel이 alerts_enabled=1인 앱의 waiaas-notify-{name} 토픽으로 알림을 발행한다
- [x] **NOTI-02**: alerts_enabled=0인 앱에는 알림이 발행되지 않는다
- [x] **NOTI-03**: Alerts 활성 앱이 0개이면 WalletNotificationChannel이 skip된다

### Documentation

- [ ] **DOC-01**: Notifications Settings 탭에서 ntfy가 독립 섹션(FieldGroup)으로 표시된다
- [ ] **DOC-02**: Other Channels에서 ntfy 설정이 제거되고 Discord+Slack만 표시된다
- [ ] **DOC-03**: ntfy 섹션에 Human Wallet Apps 페이지 링크가 포함된다
- [ ] **DOC-04**: skills/admin.skill.md에 Human Wallet Apps 메뉴와 ntfy 섹션이 반영된다
- [ ] **DOC-05**: skills/wallet.skill.md에 D'CENT sdk_ntfy 오너 설정 예시가 반영된다

## Future Requirements

### Wallet Apps Advanced

- **APPX-01**: 지갑 앱별 알림 필터링 (카테고리/우선순위별 구독 제어)
- **APPX-02**: 앱별 커스텀 ntfy 서버 URL 설정

## Out of Scope

| Feature | Reason |
|---------|--------|
| Push Relay URL 데몬 설정 | 데몬과 Push Relay는 ntfy를 허브로 간접 연결. 데몬은 Push Relay URL 알 필요 없음 |
| signing_sdk.* → human_wallet_apps.* 설정 키 변경 | 내부 호환 유지. UI 레이블만 변경, 설정 키는 기존 유지 |
| 기존 WC 기반 D'CENT 지갑 자동 마이그레이션 | 프리셋 변경은 신규 설정에만 적용. 기존 사용자는 Admin UI에서 수동 변경 |
| 지갑별 알림 필터링 | 복잡도 대비 실용성 낮음. 앱별 전체 수신(텔레그램과 동일 패턴) |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SIGN-01 | Phase 291 | Pending |
| SIGN-02 | Phase 291 | Pending |
| SIGN-03 | Phase 291 | Pending |
| SIGN-04 | Phase 291 | Pending |
| SIGN-05 | Phase 291 | Pending |
| SIGN-06 | Phase 291 | Pending |
| OWN-01 | Phase 292 | Pending |
| OWN-02 | Phase 292 | Pending |
| OWN-03 | Phase 292 | Pending |
| OWN-04 | Phase 292 | Pending |
| OWN-05 | Phase 292 | Pending |
| OWN-06 | Phase 292 | Pending |
| OWN-07 | Phase 292 | Pending |
| APP-01 | Phase 293 | Pending |
| APP-02 | Phase 293 | Pending |
| APP-03 | Phase 293 | Pending |
| APP-04 | Phase 293 | Pending |
| APP-05 | Phase 293 | Pending |
| APP-06 | Phase 293 | Pending |
| APP-07 | Phase 293 | Pending |
| APP-08 | Phase 293 | Pending |
| APP-09 | Phase 293 | Pending |
| APP-10 | Phase 293 | Pending |
| HWUI-01 | Phase 293 | Pending |
| HWUI-02 | Phase 293 | Pending |
| HWUI-03 | Phase 293 | Pending |
| HWUI-04 | Phase 293 | Pending |
| HWUI-05 | Phase 293 | Pending |
| HWUI-06 | Phase 293 | Pending |
| HWUI-07 | Phase 293 | Pending |
| HWUI-08 | Phase 293 | Pending |
| HWUI-09 | Phase 293 | Pending |
| NOTI-01 | Phase 294 | Complete |
| NOTI-02 | Phase 294 | Complete |
| NOTI-03 | Phase 294 | Complete |
| DOC-01 | Phase 295 | Pending |
| DOC-02 | Phase 295 | Pending |
| DOC-03 | Phase 295 | Pending |
| DOC-04 | Phase 296 | Pending |
| DOC-05 | Phase 296 | Pending |

**Coverage:**
- v29.7 requirements: 40 total
- Mapped to phases: 40/40
- Unmapped: 0

---
*Requirements defined: 2026-03-01*
*Last updated: 2026-03-01 after roadmap creation (traceability updated)*
