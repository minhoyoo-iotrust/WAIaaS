# Requirements: WAIaaS v2.7 지갑 앱 알림 채널

**Defined:** 2026-02-20
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v1 Requirements

Requirements for v2.7. 각 요구사항은 로드맵 phase에 매핑됨.

### 스키마

- [x] **SCHEMA-01**: NotificationMessageSchema가 core signing-protocol.ts에 정의되어 26개 이벤트가 6개 카테고리로 매핑된다
- [x] **SCHEMA-02**: EVENT_CATEGORY_MAP 상수가 26개 NotificationEventType 전수를 커버한다 (누락 검증 테스트 포함)
- [x] **SCHEMA-03**: NotificationMessage 타입이 wallet-sdk에서 re-export된다

### 데몬 사이드 채널

- [x] **DAEMON-01**: WalletNotificationChannel이 알림 이벤트 발생 시 waiaas-notify-{walletName} ntfy 토픽에 NotificationMessage를 base64url 인코딩하여 publish한다
- [x] **DAEMON-02**: 사이드 채널이 기존 sendWithFallback/broadcast와 독립 병행 동작한다 (양쪽 모두 수신)
- [x] **DAEMON-03**: owner_approval_method가 sdk_ntfy가 아닌 지갑에는 알림을 전송하지 않는다
- [x] **DAEMON-04**: 비-UUID walletId (system/빈값 등) 시 sdk_ntfy인 모든 지갑에 반복 전송하며, 각 메시지의 walletId는 실제 UUID로 설정한다
- [x] **DAEMON-05**: security_alert 카테고리는 ntfy priority 5, 일반 알림은 priority 3으로 전송한다
- [x] **DAEMON-06**: 사이드 채널 실패가 기존 채널 결과에 영향을 주지 않는다 (try/catch 격리)

### SDK

- [x] **SDK-01**: subscribeToNotifications(topic, callback, serverUrl?)가 ntfy SSE를 구독하고 콜백으로 NotificationMessage를 전달한다
- [x] **SDK-02**: parseNotification(data)이 base64url 디코딩 → JSON 파싱 → Zod 검증으로 NotificationMessage를 반환한다

### 설정

- [x] **SETTINGS-01**: signing_sdk.notifications_enabled 토글로 지갑 알림 채널을 활성화/비활성화한다
- [x] **SETTINGS-02**: signing_sdk.enabled=false이면 notifications_enabled와 무관하게 알림이 미전송된다
- [x] **SETTINGS-03**: signing_sdk.notify_categories JSON array 필터로 특정 카테고리만 전송할 수 있다 (빈 배열 = 전체)

### Admin UI

- [x] **ADMIN-01**: Settings 페이지에서 6개 카테고리 멀티셀렉트 체크박스로 notify_categories를 설정할 수 있다

### 인터페이스 동기화

- [x] **SYNC-01**: SDK 공개 API 변경(subscribeToNotifications, parseNotification, NotificationMessage)이 skill 파일에 반영된다

## v2 Requirements

### 향후 확장

- **NOTIF-F01**: 알림 카테고리별 소리/진동 우선순위 커스터마이징
- **NOTIF-F02**: 알림 히스토리 SDK 조회 API
- **NOTIF-F03**: Slack/Discord 사이드 채널 확장

## Out of Scope

| Feature | Reason |
|---------|--------|
| 알림 히스토리 SDK 조회 | SDK 경량 유지, 데몬 REST API로 이미 가능 |
| 알림 카테고리별 커스텀 템플릿 | 초기 버전은 고정 title/body 포맷 사용 |
| DB 마이그레이션 | 기존 스키마로 충분, 새 테이블/컬럼 불필요 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCHEMA-01 | Phase 206 | Complete |
| SCHEMA-02 | Phase 206 | Complete |
| SCHEMA-03 | Phase 206 | Complete |
| DAEMON-01 | Phase 206 | Complete |
| DAEMON-02 | Phase 206 | Complete |
| DAEMON-03 | Phase 206 | Complete |
| DAEMON-04 | Phase 206 | Complete |
| DAEMON-05 | Phase 206 | Complete |
| DAEMON-06 | Phase 206 | Complete |
| SDK-01 | Phase 206 | Complete |
| SDK-02 | Phase 206 | Complete |
| SETTINGS-01 | Phase 206 | Complete |
| SETTINGS-02 | Phase 206 | Complete |
| SETTINGS-03 | Phase 206 | Complete |
| ADMIN-01 | Phase 206 | Complete |
| SYNC-01 | Phase 206 | Complete |

**Coverage:**
- v1 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0

---
*Requirements defined: 2026-02-20*
*Last updated: 2026-02-20 after roadmap creation*
