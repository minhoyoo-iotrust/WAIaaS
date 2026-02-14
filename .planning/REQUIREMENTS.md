# Requirements: WAIaaS v1.4.8

**Defined:** 2026-02-15
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다

## v1 Requirements

이슈 12건(020~031) 일괄 해소. DB 마이그레이션 안정성, MCP 안정성, 도구 확장, Admin UI UX, 알림 시스템 개선.

### DB 마이그레이션

- [x] **MIGR-01**: pushSchema에서 인덱스 생성이 마이그레이션 완료 후 실행되어 기존 DB에서 데몬이 정상 시작된다 — Phase 120
- [x] **MIGR-02**: 마이그레이션 체인 테스트가 과거 스키마 버전(v1, v5)에서 최신까지 전체 경로를 검증한다 — Phase 120
- [x] **MIGR-03**: 데이터 변환 정확성 테스트가 environment 매핑, network 백필, 이름 변환을 검증한다 — Phase 120

### MCP 안정성

- [ ] **MCPS-01**: MCP 서버가 stdin 종료를 감지하여 5초 내 자동 종료된다
- [ ] **MCPS-02**: SIGTERM 수신 시 3초 타임아웃으로 graceful shutdown 후 강제 종료된다
- [ ] **MCPS-03**: shutdown 중복 호출이 안전하게 처리된다

### MCP 도구 + 멀티체인 DX

- [ ] **MCDX-01**: set_default_network MCP 도구 + CLI 명령어 + SDK 메서드로 기본 네트워크를 변경할 수 있다
- [ ] **MCDX-02**: waiaas wallet info CLI 명령어가 체인, 환경, 주소, 기본 네트워크, 사용 가능 네트워크를 표시한다
- [ ] **MCDX-03**: SDK getWalletInfo() 메서드가 TS/Python에서 월렛 상세 정보를 반환한다
- [ ] **MCDX-04**: GET /v1/wallet/balance?network=all이 환경 내 모든 네트워크 잔액을 배열로 반환한다
- [ ] **MCDX-05**: GET /v1/wallet/assets?network=all이 환경 내 모든 네트워크 토큰 자산을 배열로 반환한다
- [ ] **MCDX-06**: MCP get_balance/get_assets 도구가 network=all 옵션을 지원한다
- [ ] **MCDX-07**: 부분 실패 시 성공한 네트워크 잔액만 반환하고 실패 네트워크는 에러 표시한다

### Admin UI 개선

- [ ] **ADUI-01**: 대시보드 StatCard에서 해당 페이지로 링크 이동이 가능하다
- [ ] **ADUI-02**: 대시보드에 Policies, Recent Txns (24h), Failed Txns (24h) 추가 StatCard가 표시된다
- [ ] **ADUI-03**: 대시보드에 최근 트랜잭션 5건의 활동 섹션이 표시된다
- [ ] **ADUI-04**: 월렛 상세 페이지에 네이티브 + 토큰 잔액 섹션이 표시된다
- [ ] **ADUI-05**: 월렛 상세 페이지에 최근 트랜잭션 내역 테이블이 표시된다
- [ ] **ADUI-06**: 세션 페이지 진입 시 전체 세션 목록이 즉시 표시된다 (walletId 선택 불필요)
- [ ] **ADUI-07**: 세션 목록에 walletName 컬럼이 표시된다

### 알림 시스템

- [ ] **NOTF-01**: 알림 테스트 발송이 SYSTEM_LOCKED 에러 없이 정상 동작한다
- [ ] **NOTF-02**: 알림 패널에서 채널별 개별 [Test] 버튼으로 특정 채널만 테스트할 수 있다
- [ ] **NOTF-03**: 알림 로그에 실제 발송된 메시지 내용이 저장되고 Admin UI에서 조회할 수 있다
- [ ] **NOTF-04**: DB 마이그레이션 v10으로 notification_logs에 message 컬럼이 추가된다
- [ ] **NOTF-05**: Slack Incoming Webhook 알림 채널이 지원된다
- [ ] **NOTF-06**: config.toml slack_webhook_url 설정 시 Channel Status에 Slack이 표시된다

### Skill 파일 동기화

- [ ] **SKIL-01**: wallet.skill.md에 network=all 잔액, set_default_network, wallet info가 반영된다
- [ ] **SKIL-02**: admin.skill.md에 Slack 알림 채널 정보가 반영된다

## v2 Requirements

(없음 — 이번 마일스톤은 이슈 해소 전용)

## Out of Scope

| Feature | Reason |
|---------|--------|
| 백엔드 error handler 근본 수정 (SYSTEM_LOCKED catch-all) | 프론트엔드 즉시 수정으로 해소, 근본 수정은 별도 이슈 |
| Admin UI 월렛 상세 전체 네트워크 잔액 표시 | 기본 네트워크 잔액으로 시작, 확장은 후속 마일스톤 |
| 웹소켓 기반 실시간 알림 | Polling 방식 유지, 실시간은 별도 마일스톤 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| MIGR-01 | Phase 120 | ✅ Done |
| MIGR-02 | Phase 120 | ✅ Done |
| MIGR-03 | Phase 120 | ✅ Done |
| MCPS-01 | Phase 121 | Pending |
| MCPS-02 | Phase 121 | Pending |
| MCPS-03 | Phase 121 | Pending |
| MCDX-01 | Phase 122 | Pending |
| MCDX-02 | Phase 122 | Pending |
| MCDX-03 | Phase 122 | Pending |
| MCDX-04 | Phase 122 | Pending |
| MCDX-05 | Phase 122 | Pending |
| MCDX-06 | Phase 122 | Pending |
| MCDX-07 | Phase 122 | Pending |
| ADUI-01 | Phase 123 | Pending |
| ADUI-02 | Phase 123 | Pending |
| ADUI-03 | Phase 123 | Pending |
| ADUI-04 | Phase 123 | Pending |
| ADUI-05 | Phase 123 | Pending |
| ADUI-06 | Phase 123 | Pending |
| ADUI-07 | Phase 123 | Pending |
| NOTF-01 | Phase 124 | Pending |
| NOTF-02 | Phase 124 | Pending |
| NOTF-03 | Phase 124 | Pending |
| NOTF-04 | Phase 124 | Pending |
| NOTF-05 | Phase 124 | Pending |
| NOTF-06 | Phase 124 | Pending |
| SKIL-01 | Phase 122 | Pending |
| SKIL-02 | Phase 124 | Pending |

**Coverage:**
- v1 requirements: 28 total
- Mapped to phases: 28
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-15*
*Last updated: 2026-02-15 after initial definition*
