# Requirements: WAIaaS v29.10 — ntfy 토픽 지갑별 설정 전환

**Defined:** 2026-03-02
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다

## v1 Requirements

Requirements for v29.10. Each maps to roadmap phases.

### DB Schema

- [ ] **DBSC-01**: User can see sign_topic and notify_topic columns in wallet_apps table after DB migration
- [ ] **DBSC-02**: Existing wallet_apps rows receive default topic values (prefix+appName) via migration
- [ ] **DBSC-03**: New wallet app registration auto-generates sign_topic and notify_topic from prefix+appName when not specified
- [ ] **DBSC-04**: NULL topic values fall back to prefix+appName combination at runtime

### Channel Logic

- [ ] **CHAN-01**: NtfySigningChannel reads sign_topic from wallet_apps table instead of prefix-based dynamic combination
- [ ] **CHAN-02**: WalletNotificationChannel reads notify_topic from wallet_apps table instead of hardcoded prefix+walletName
- [ ] **CHAN-03**: NotificationService no longer initializes global NtfyChannel instance (Path B ntfy removal)
- [ ] **CHAN-04**: Telegram/Discord/Slack channels continue to function unchanged after global NtfyChannel removal
- [ ] **CHAN-05**: System events (UPDATE_AVAILABLE etc.) reach all active wallet apps via WalletNotificationChannel (Path A)

### REST API

- [ ] **API-01**: User can specify optional signTopic/notifyTopic in POST /v1/admin/wallet-apps request
- [ ] **API-02**: User can modify signTopic/notifyTopic via PUT /v1/admin/wallet-apps/{id}
- [ ] **API-03**: GET /v1/admin/wallet-apps response includes signTopic and notifyTopic fields
- [ ] **API-04**: OpenAPI schema reflects signTopic/notifyTopic fields on WalletApp model

### Admin Settings

- [ ] **ASET-01**: notifications.ntfy_topic setting key is removed from SettingsService
- [ ] **ASET-02**: notifications.ntfy_server setting remains available (global shared ntfy server URL)
- [ ] **ASET-03**: signing_sdk.ntfy_request_topic_prefix remains available as fallback for new app topic defaults

### Admin UI

- [ ] **ADUI-01**: Notifications page no longer shows global Ntfy channel card
- [ ] **ADUI-02**: Human Wallet Apps page displays sign_topic and notify_topic for each wallet app
- [ ] **ADUI-03**: User can edit sign_topic and notify_topic values in Human Wallet Apps page
- [ ] **ADUI-04**: Notifications page provides guidance to manage ntfy via Human Wallet Apps

### Skill Files

- [ ] **SKIL-01**: admin.skill.md reflects wallet-apps API changes (signTopic/notifyTopic fields)

## v2 Requirements

### Enhanced Topic Management

- **ETOP-01**: Topic validation — enforce naming conventions and uniqueness constraints
- **ETOP-02**: Topic connectivity test — verify ntfy server reachability for configured topics

## Out of Scope

| Feature | Reason |
|---------|--------|
| ntfy 서버 멀티 인스턴스 | 단일 ntfy_server로 충분, 멀티 서버는 별도 마일스톤 |
| Push Relay 자동 구독 동기화 | Push Relay는 자체 구독 관리, 데몬 측 변경만 범위 |
| NtfyChannel 완전 제거 (코드 삭제) | 채널 인스턴스만 제거, NtfyChannel 클래스는 WalletNotificationChannel에서 재사용 가능 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DBSC-01 | — | Pending |
| DBSC-02 | — | Pending |
| DBSC-03 | — | Pending |
| DBSC-04 | — | Pending |
| CHAN-01 | — | Pending |
| CHAN-02 | — | Pending |
| CHAN-03 | — | Pending |
| CHAN-04 | — | Pending |
| CHAN-05 | — | Pending |
| API-01 | — | Pending |
| API-02 | — | Pending |
| API-03 | — | Pending |
| API-04 | — | Pending |
| ASET-01 | — | Pending |
| ASET-02 | — | Pending |
| ASET-03 | — | Pending |
| ADUI-01 | — | Pending |
| ADUI-02 | — | Pending |
| ADUI-03 | — | Pending |
| ADUI-04 | — | Pending |
| SKIL-01 | — | Pending |

**Coverage:**
- v1 requirements: 21 total
- Mapped to phases: 0
- Unmapped: 21 ⚠️

---
*Requirements defined: 2026-03-02*
*Last updated: 2026-03-02 after initial definition*
