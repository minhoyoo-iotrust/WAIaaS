# Requirements: WAIaaS v1.6

**Defined:** 2026-02-16
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v1 Requirements

### Kill Switch

- [ ] **KILL-01**: Kill Switch 발동 시 ACTIVE→SUSPENDED 상태 전이가 CAS ACID 패턴으로 원자적으로 수행된다
- [ ] **KILL-02**: SUSPENDED→LOCKED 전이가 CAS ACID 패턴으로 수행되어 심각도가 격상된다
- [ ] **KILL-03**: Kill Switch 발동 시 6-step cascade가 순차 실행된다 (세션 무효화→진행 중 거래 중단→월렛 정지→API 503→알림→감사 로그)
- [ ] **KILL-04**: SUSPENDED 상태에서 dual-auth(Owner 서명 + Master 패스워드)로 ACTIVE 복구가 가능하다
- [ ] **KILL-05**: LOCKED 상태에서 dual-auth + 추가 대기 시간으로 ACTIVE 복구가 가능하다
- [ ] **KILL-06**: 동시에 두 Kill Switch 요청이 도착하면 하나만 성공하고 나머지는 409를 반환한다
- [ ] **KILL-07**: 잘못된 상태 전이 시도(ACTIVE→LOCKED 직접, LOCKED→SUSPENDED 등)는 409로 거부된다
- [ ] **KILL-08**: POST /v1/admin/kill-switch(masterAuth)와 POST /v1/owner/kill-switch(ownerAuth) API가 제공된다
- [ ] **KILL-09**: Kill Switch 상태가 SUSPENDED/LOCKED일 때 killSwitch 미들웨어가 503 SYSTEM_LOCKED를 반환한다
- [ ] **KILL-10**: 기존 kill_switch_state DB 값 NORMAL→ACTIVE, ACTIVATED→SUSPENDED로 마이그레이션된다

### AutoStop Engine

- [ ] **AUTO-01**: CONSECUTIVE_FAILURES 규칙: 5회 연속 트랜잭션 실패 시 해당 월렛이 자동 정지된다
- [ ] **AUTO-02**: UNUSUAL_ACTIVITY 규칙: 정상 패턴 대비 이상 빈도 거래 감지 시 월렛이 정지되고 알림이 발송된다
- [ ] **AUTO-03**: IDLE_TIMEOUT 규칙: 설정 시간 이상 유휴 시 세션이 자동 해지된다
- [ ] **AUTO-04**: MANUAL_TRIGGER 규칙: 수동 트리거 시 Kill Switch가 자동 발동된다
- [ ] **AUTO-05**: AutoStop 규칙 임계값이 config.toml flat key + Admin Settings 런타임 오버라이드로 관리된다
- [ ] **AUTO-06**: AutoStop 규칙 트리거 시 AUTOSTOP_TRIGGERED 알림이 발송된다

### Event Bus

- [ ] **EVNT-01**: EventEmitter 기반 이벤트 버스가 도입되어 TransactionCompleted/TransactionFailed/WalletActivity 이벤트를 발행한다
- [ ] **EVNT-02**: 기존 파이프라인 NotificationService.notify() 호출 지점에서 이벤트가 동시 발행된다
- [ ] **EVNT-03**: AutoStopService와 BalanceMonitorService가 이벤트 버스를 구독하여 동작한다

### Telegram Bot

- [ ] **TGBOT-01**: TelegramBotService가 Long Polling(getUpdates, 5초 폴링 간격, 오프셋 기반)으로 명령을 수신한다
- [ ] **TGBOT-02**: /start 명령으로 chat_id가 telegram_users 테이블에 PENDING으로 자동 등록된다
- [ ] **TGBOT-03**: /status 명령으로 데몬 상태와 월렛 요약 정보를 조회할 수 있다
- [ ] **TGBOT-04**: /pending 명령으로 APPROVAL 대기 중인 거래 목록을 인라인 키보드(Approve/Reject)와 함께 조회할 수 있다
- [ ] **TGBOT-05**: /approve {txId} 명령으로 대기 중인 거래를 승인할 수 있다 (관리자만)
- [ ] **TGBOT-06**: /reject {txId} 명령으로 대기 중인 거래를 거부할 수 있다 (관리자만)
- [ ] **TGBOT-07**: /killswitch 명령으로 확인 대화(Yes/No 인라인 키보드) 후 Kill Switch를 발동할 수 있다 (관리자만)
- [ ] **TGBOT-08**: /wallets 명령으로 월렛 목록을 조회할 수 있다
- [ ] **TGBOT-09**: /newsession 명령으로 월렛 선택 인라인 키보드를 통해 새 세션을 발급할 수 있다 (관리자만)
- [ ] **TGBOT-10**: /help 명령으로 사용 가능한 명령어 도움말을 조회할 수 있다
- [ ] **TGBOT-11**: 2-Tier 인증이 적용되어 ADMIN은 승인/거부/killswitch 등 모든 명령, READONLY는 조회 명령만 사용할 수 있다
- [ ] **TGBOT-12**: Long Polling 네트워크 단절 시 지수 백오프(1s, 2s, 4s, max 30s)로 재연결된다
- [ ] **TGBOT-13**: Telegram Bot 메시지가 i18n(en/ko) 지원으로 config.toml locale 설정에 따라 출력된다
- [ ] **TGBOT-14**: telegram_users DB 테이블(chat_id PK, username, role, registered_at, approved_at)이 마이그레이션으로 생성된다

### Balance Monitoring

- [ ] **BMON-01**: BalanceMonitorService가 주기적(기본 5분)으로 모든 활성 월렛의 네이티브 토큰 잔액을 체크한다
- [ ] **BMON-02**: 잔액이 임계값(SOL 0.01, ETH 0.005) 이하이면 LOW_BALANCE 알림이 발송된다
- [ ] **BMON-03**: 동일 월렛에 대해 24시간 내 중복 LOW_BALANCE 알림이 방지된다
- [ ] **BMON-04**: 잔액 회복 후 다시 하락하면 새 LOW_BALANCE 알림이 발송된다
- [ ] **BMON-05**: 잔액 모니터링 임계값이 config.toml flat key + Admin Settings 런타임 오버라이드로 관리된다
- [ ] **BMON-06**: NotificationEventType에 LOW_BALANCE(23번째 이벤트)가 추가되고 en/ko 메시지 템플릿이 제공된다

### Docker

- [ ] **DOCK-01**: Multi-stage Dockerfile이 builder(node:22-slim + pnpm + turbo build)와 runner(node:22-slim + non-root UID 1001)로 구성된다
- [ ] **DOCK-02**: docker-compose.yml이 daemon 서비스, named volume(~/.waiaas 영속), 포트 매핑(127.0.0.1:3100:3100), HEALTHCHECK를 정의한다
- [ ] **DOCK-03**: Docker Secrets + _FILE 패턴으로 MASTER_PASSWORD_FILE→WAIAAS_SECURITY_MASTER_PASSWORD 등 시크릿이 주입된다
- [ ] **DOCK-04**: docker compose up 후 HEALTHCHECK가 통과하고 SDK로 거래가 가능하다
- [ ] **DOCK-05**: named volume 덕분에 docker compose down → up 후에도 데이터가 유지된다
- [ ] **DOCK-06**: 컨테이너 프로세스가 non-root(UID 1001, waiaas)로 실행된다

### Admin UI Integration

- [ ] **ADUI-01**: Admin UI에서 Kill Switch 상태를 조회하고 발동/복구할 수 있다 (기존 토글 → 3-state 리팩토링)
- [ ] **ADUI-02**: Admin UI에서 telegram_users 목록을 조회하고 role을 PENDING→ADMIN/READONLY로 승인할 수 있다
- [ ] **ADUI-03**: Admin UI에서 AutoStop 규칙 임계값을 조회/수정할 수 있다 (Admin Settings 카테고리)
- [ ] **ADUI-04**: Admin UI에서 잔액 모니터링 임계값을 조회/수정할 수 있다 (Admin Settings 카테고리)

## v2 Requirements

### WalletConnect Owner 승인

- **WCON-01**: WalletConnect @reown/appkit으로 QR 코드 페어링하여 Owner 지갑을 연결할 수 있다
- **WCON-02**: WalletConnect를 통해 SIWS/SIWE 서명 요청을 Owner 지갑으로 전달할 수 있다
- **WCON-03**: WalletConnect 실패 시 Telegram Bot approve/reject으로 fallback할 수 있다

## Out of Scope

| Feature | Reason |
|---------|--------|
| Desktop App (Tauri) | v2.6/v2.6.1에서 구현 (v2.0 이후 이연) |
| ML 기반 이상 탐지 | UNUSUAL_ACTIVITY는 규칙 기반으로 시작, ML은 향후 |
| 크로스체인 브릿지 | 별도 마일스톤으로 분리 |
| NFT 민팅/마켓 통합 | Action Provider로 향후 추가 |
| SaaS 버전 | Self-Hosted 우선 |
| Telegram Bot 외부 프레임워크 | native fetch 전용, telegraf/grammy 미사용 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| (Roadmap 생성 시 채워짐) | | |

**Coverage:**
- v1 requirements: 46 total
- Mapped to phases: 0
- Unmapped: 46

---
*Requirements defined: 2026-02-16*
*Last updated: 2026-02-16 after initial definition*
