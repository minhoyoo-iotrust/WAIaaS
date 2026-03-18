# Requirements: WAIaaS v32.9 Push Relay 직접 연동

**Defined:** 2026-03-18
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인이 자금 통제권을 유지하면서.

## v32.9 Requirements

Requirements for Push Relay 직접 연동 (ntfy.sh 제거). Each maps to roadmap phases.

### DB & Migration

- [ ] **DB-01**: v60 마이그레이션으로 wallet_apps 테이블에 push_relay_url TEXT 컬럼 추가
- [ ] **DB-02**: v60 마이그레이션에서 dcent wallet_type의 push_relay_url을 'https://waiaas-push.dcentwallet.com'으로 자동 설정
- [ ] **DB-03**: sign_topic, notify_topic 컬럼을 NULL로 비우고 코드에서 미참조 처리
- [ ] **DB-04**: Push Relay DB에 sign_responses 테이블 생성 (request_id PK, response TEXT, expires_at/created_at INTEGER)
- [ ] **DB-05**: sign_responses 테이블의 만료 레코드를 TTL 기반으로 주기적 자동 정리

### Core Types

- [ ] **CORE-01**: ResponseChannelSchema에서 type: 'ntfy' 제거하고 type: 'push_relay' (pushRelayUrl, requestId) 추가
- [ ] **CORE-02**: APPROVAL_METHODS에서 'sdk_ntfy'를 'sdk_push'로 변경
- [ ] **CORE-03**: sign-request-builder에서 responseChannel을 type: 'push_relay'로 구성

### Daemon Signing

- [ ] **SIGN-01**: NtfySigningChannel을 PushRelaySigningChannel로 리네이밍 및 Push Relay HTTP POST로 서명 요청 전송
- [ ] **SIGN-02**: subscribeToResponseTopic을 ntfy SSE에서 Push Relay long-polling으로 교체
- [ ] **SIGN-03**: wallet-notification-channel에서 ntfy publish를 Push Relay HTTP POST로 교체
- [ ] **SIGN-04**: approval-channel-router에서 sdk_ntfy를 sdk_push로 라우팅 변경
- [ ] **SIGN-05**: NtfyChannel (notifications/channels/ntfy.ts) 제거

### Daemon Config

- [ ] **CONF-01**: config/loader.ts에서 ntfy_server, ntfy_topic 기본값 및 스키마 필드 제거
- [ ] **CONF-02**: setting-keys.ts에서 notifications.ntfy_server 설정 키 제거
- [ ] **CONF-03**: hot-reload.ts에서 ntfy hot-reload 트리거 제거

### Push Relay Server

- [ ] **RELAY-01**: ntfy-subscriber.ts 전체 제거 (SSE 연결/재연결/토픽 관리)
- [ ] **RELAY-02**: POST /v1/push API 추가 (subscriptionToken, category, payload → IPushProvider 라우팅)
- [ ] **RELAY-03**: POST /v1/sign-response를 ntfy relay 대신 자체 DB에 응답 저장으로 변경
- [ ] **RELAY-04**: GET /v1/sign-response/:requestId?timeout=N long-polling API 구현 (응답 있으면 즉시, 없으면 timeout 후 204)
- [ ] **RELAY-05**: config.ts에서 ntfy_server, sign_topic_prefix, notify_topic_prefix 설정 제거
- [ ] **RELAY-06**: bin.ts에서 NtfySubscriber 초기화 및 토픽 복원 로직 제거
- [ ] **RELAY-07**: server.ts에서 ServerOpts ntfy 관련 필드 제거

### Wallet SDK

- [ ] **SDK-01**: sendViaNtfy(), subscribeToRequests(), subscribeToNotifications(), parseNotification() deprecated 표시
- [ ] **SDK-02**: sendViaRelay(), registerDevice(), unregisterDevice(), getSubscriptionToken() 유지 확인

### Admin UI

- [ ] **ADMIN-01**: Register Wallet App 다이얼로그에 Push Relay URL 필드 추가 (프리셋 시 자동 채움)
- [ ] **ADMIN-02**: Registered Apps 카드에서 ntfy Topics 표시를 Push Relay URL + Subscription Token으로 변경
- [ ] **ADMIN-03**: Approval Method 라디오 라벨 "Wallet App (ntfy)" → "Wallet App (Push)" 변경
- [ ] **ADMIN-04**: 프리셋 wallet type의 Approval Method 라디오 비활성화 + 안내 표시
- [ ] **ADMIN-05**: custom wallet type에서 push_relay_url 유무에 따른 Wallet App (Push) 옵션 조건부 표시
- [ ] **ADMIN-06**: 페이지 헤더 ntfy 참조를 Push Relay로 변경

### Error Handling

- [ ] **ERR-01**: Push Relay 다운 시 데몬이 서명 요청 POST 실패 → PENDING_APPROVAL 유지, 에러 로그
- [ ] **ERR-02**: long-polling 연결 실패 시 지수 백오프 재시도 (최대 3회), 최종 실패 시 서명 요청 만료

## Future Requirements

None — this milestone fully covers the ntfy.sh removal scope.

## Out of Scope

| Feature | Reason |
|---------|--------|
| ntfy.sh 하위 호환 유지 | DCent Push Relay가 아직 라이브 전이므로 불필요 |
| Push Relay → 디바이스 구간 변경 | 기존 IPushProvider 유지 |
| Wallet SDK registerDevice/unregisterDevice API 변경 | Push Relay 측 디바이스 등록 API는 그대로 |
| Wallet SDK ntfy 함수 즉시 제거 | deprecated 처리 후 다음 메이저 버전에서 제거 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| (populated by roadmapper) | | |

**Coverage:**
- v32.9 requirements: 32 total
- Mapped to phases: 0
- Unmapped: 32 ⚠️

---
*Requirements defined: 2026-03-18*
*Last updated: 2026-03-18 after initial definition*
