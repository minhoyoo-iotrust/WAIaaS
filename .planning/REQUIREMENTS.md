# Requirements: WAIaaS v1.3.4

**Defined:** 2026-02-11
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v1 Requirements

v1.3.4 마일스톤 범위: 알림 이벤트 트리거 연결 + 어드민 알림 패널

### 이벤트 트리거 연결

- [ ] **TRIG-01**: 파이프라인 stage1에서 TX_REQUESTED 알림이 발송된다
- [ ] **TRIG-02**: 파이프라인 stage5에서 TX_SUBMITTED 알림이 발송된다
- [ ] **TRIG-03**: 파이프라인 stage6에서 TX_CONFIRMED 알림이 발송된다
- [ ] **TRIG-04**: 파이프라인 stage5에서 전송 실패 시 TX_FAILED 알림이 발송된다
- [ ] **TRIG-05**: 파이프라인 stage3에서 정책 위반 시 POLICY_VIOLATION 알림이 발송된다
- [ ] **TRIG-06**: POST /v1/auth/session 성공 시 SESSION_CREATED 알림이 발송된다
- [ ] **TRIG-07**: 세션 만료 처리 시 SESSION_EXPIRED 알림이 발송된다
- [ ] **TRIG-08**: PUT /v1/agents/:id/owner 성공 시 OWNER_SET 알림이 발송된다

### 알림 로그

- [ ] **LOG-01**: notification_logs 테이블이 증분 마이그레이션으로 생성된다 (schema_version 관리)
- [ ] **LOG-02**: 알림 발송 성공 시 notification_logs에 status='sent' 레코드가 저장된다
- [ ] **LOG-03**: 알림 발송 실패 시 notification_logs에 status='failed' + error 메시지가 저장된다

### 어드민 알림 API

- [ ] **API-01**: GET /admin/notifications/status가 채널별 활성화 상태를 반환한다 (credential 미포함)
- [ ] **API-02**: POST /admin/notifications/test가 활성 채널로 테스트 알림을 발송한다
- [ ] **API-03**: GET /admin/notifications/log가 최근 알림 발송 로그를 페이지네이션으로 반환한다

### 어드민 알림 UI

- [ ] **UI-01**: 어드민 UI에서 채널별 활성화 상태(연결됨/미설정)를 확인할 수 있다
- [ ] **UI-02**: 어드민 UI에서 활성 채널에 테스트 알림을 발송할 수 있다
- [ ] **UI-03**: 어드민 UI에서 최근 알림 발송 로그(이벤트, 채널, 상태, 시각)를 조회할 수 있다
- [ ] **UI-04**: 어드민 UI에서 config.toml 설정 변경 안내 문구가 표시된다

## Future Requirements

### 알림 확장 (v1.6)

- **NOTIF-F01**: Kill Switch 활성화/복구 시 알림 발송
- **NOTIF-F02**: AutoStop 트리거 시 알림 발송
- **NOTIF-F03**: 시간지연 큐 진입/취소 시 알림 발송
- **NOTIF-F04**: Owner 승인 요청/만료 시 알림 발송
- **NOTIF-F05**: 일일 요약 스케줄러 알림

### 알림 설정 UI (향후)

- **NOTIF-F06**: 어드민 UI에서 config.toml 알림 설정 직접 수정

## Out of Scope

| Feature | Reason |
|---------|--------|
| config.toml 설정을 어드민 UI에서 수정 | SSoT 위반 — config.toml이 설정의 유일한 출처 |
| bot token/webhook URL 등 credential API 노출 | 보안 리스크 |
| Telegram Bot 인터랙티브 기능 (명령 수신, 승인/거부) | v1.6 범위 |
| Kill Switch/AutoStop 연동 알림 | v1.6에서 해당 기능 구현 후 연결 |
| SESSION_EXPIRING_SOON 알림 | SessionManager 확장 필요, 별도 마일스톤 |
| DAILY_SUMMARY 알림 | cron 스케줄러 미구현, 별도 마일스톤 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TRIG-01 | Phase 74 | Pending |
| TRIG-02 | Phase 74 | Pending |
| TRIG-03 | Phase 74 | Pending |
| TRIG-04 | Phase 74 | Pending |
| TRIG-05 | Phase 74 | Pending |
| TRIG-06 | Phase 74 | Pending |
| TRIG-07 | Phase 74 | Pending |
| TRIG-08 | Phase 74 | Pending |
| LOG-01 | Phase 73 | Pending |
| LOG-02 | Phase 73 | Pending |
| LOG-03 | Phase 73 | Pending |
| API-01 | Phase 75 | Pending |
| API-02 | Phase 75 | Pending |
| API-03 | Phase 75 | Pending |
| UI-01 | Phase 75 | Pending |
| UI-02 | Phase 75 | Pending |
| UI-03 | Phase 75 | Pending |
| UI-04 | Phase 75 | Pending |

**Coverage:**
- v1 requirements: 18 total
- Mapped to phases: 18/18
- Unmapped: 0

---
*Requirements defined: 2026-02-11*
*Last updated: 2026-02-11 after roadmap creation (traceability updated)*
