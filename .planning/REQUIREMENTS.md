# Requirements: WAIaaS

**Defined:** 2026-02-19
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v2.6 Requirements

Wallet SDK 설계 마일스톤. 지갑 개발사(D'CENT 등)가 WAIaaS와 통합하기 위한 공통 설계를 확정한다. 코드 구현은 후속 마일스톤(m26-01~03)에서 수행.

### Signing Protocol v1

- [x] **PROTO-01**: SignRequest/SignResponse Zod 스키마 + 서명 메시지 포맷 설계서 확정
- [x] **PROTO-02**: 유니버셜 링크 URL 구조 (지갑 도메인 활용, base64url 인코딩) 설계서 확정
- [ ] **PROTO-03**: ntfy 요청/응답 토픽 네이밍 규칙 + 보안 모델 설계서 확정
- [ ] **PROTO-04**: Telegram 인라인 버튼 + 공유 인텐트 응답 플로우 설계서 확정

### Wallet SDK 패키지

- [ ] **WSDK-01**: 공개 API 인터페이스 6개 함수 시그니처 확정
- [ ] **WSDK-02**: WalletLinkConfig 스키마 + registerWallet() 확정
- [ ] **WSDK-03**: 패키지 구조 (packages/wallet-sdk/) + 빌드/배포 설정 확정

### 데몬 컴포넌트

- [ ] **DMON-01**: SignRequestBuilder + SignResponseHandler 인터페이스 + 책임 정의 확정
- [ ] **DMON-02**: NtfySigningChannel + TelegramSigningChannel 인터페이스 확정
- [ ] **DMON-03**: WalletLinkRegistry + ApprovalChannelRouter 라우팅 로직 확정
- [ ] **DMON-04**: SettingsService signing_sdk 6개 키 + WalletLinkRegistry 저장 구조 확정
- [ ] **DMON-05**: wallets.owner_approval_method 컬럼 + REST API approval_method 필드 설계 확정

### 알림 채널

- [ ] **NOTIF-01**: 서명/알림 토픽 분리 구조 + ntfy priority 차등 설계 확정
- [ ] **NOTIF-02**: NotificationMessage 스키마 + SDK subscribeToNotifications() 인터페이스 확정
- [ ] **NOTIF-03**: WalletNotificationChannel + 기존 INotificationChannel 통합 설계 확정

### Push Relay Server

- [ ] **RELAY-01**: IPushProvider 인터페이스 + PushPayload/PushResult 스키마 확정
- [ ] **RELAY-02**: PushwooshProvider + FcmProvider 구현 설계 (API 인증, 페이로드 매핑) 확정
- [ ] **RELAY-03**: ntfy SSE 구독 + 메시지→PushPayload 변환 매핑 확정
- [ ] **RELAY-04**: 디바이스 토큰 등록 API + config.toml 스키마 + Docker 배포 설계 확정

### 설계 문서 갱신

- [ ] **DOCS-01**: doc 35 알림 아키텍처 — 지갑 앱 채널 + 토픽 구조 추가
- [ ] **DOCS-02**: doc 37 REST API — PUT /wallets/:id/owner approval_method 필드 확장
- [ ] **DOCS-03**: doc 25 SQLite — wallets.owner_approval_method 컬럼 + 마이그레이션 추가
- [ ] **DOCS-04**: doc 67 Admin UI — Owner Settings > Approval Method UI 설계 추가

## Future Requirements

후속 구현 마일스톤에서 다룸 (m26-01~03):
- Signing SDK 구현 + @waiaas/wallet-sdk 패키지 빌드
- 데몬 서명 채널 구현 + DB 마이그레이션 실행
- 지갑 앱 알림 채널 구현
- Push Relay Server 구현 + Docker 배포

## Out of Scope

| Feature | Reason |
|---------|--------|
| Slack/Discord 양방향 서명 채널 | Socket Mode/Gateway Bot 미구현, m26-01 이후 |
| ntfy 토픽 인증 (Authorization) | 보안 강화 시 별도 마일스톤 |
| D'CENT 외 추가 지갑 파트너 통합 | 사용자 기반 확장 시 |
| ApnsProvider 구현 설계 | FcmProvider로 iOS 커버 가능, 추후 필요 시 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PROTO-01 | Phase 198 | Complete |
| PROTO-02 | Phase 198 | Complete |
| PROTO-03 | Phase 198 | Pending |
| PROTO-04 | Phase 198 | Pending |
| WSDK-01 | Phase 199 | Pending |
| WSDK-02 | Phase 199 | Pending |
| WSDK-03 | Phase 199 | Pending |
| DMON-01 | Phase 199 | Pending |
| DMON-02 | Phase 199 | Pending |
| DMON-03 | Phase 199 | Pending |
| DMON-04 | Phase 199 | Pending |
| DMON-05 | Phase 199 | Pending |
| NOTIF-01 | Phase 200 | Pending |
| NOTIF-02 | Phase 200 | Pending |
| NOTIF-03 | Phase 200 | Pending |
| RELAY-01 | Phase 200 | Pending |
| RELAY-02 | Phase 200 | Pending |
| RELAY-03 | Phase 200 | Pending |
| RELAY-04 | Phase 200 | Pending |
| DOCS-01 | Phase 201 | Pending |
| DOCS-02 | Phase 201 | Pending |
| DOCS-03 | Phase 201 | Pending |
| DOCS-04 | Phase 201 | Pending |

**Coverage:**
- v2.6 requirements: 23 total
- Mapped to phases: 23
- Unmapped: 0

---
*Requirements defined: 2026-02-19*
*Last updated: 2026-02-19 after roadmap creation*
