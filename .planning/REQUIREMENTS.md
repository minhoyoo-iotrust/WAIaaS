# Requirements: WAIaaS Push Relay Server

**Defined:** 2026-02-20
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v1 Requirements

Requirements for milestone v26.3. Each maps to roadmap phases.

### ENCODE — 데몬 SignRequest 인코딩 통일

- [ ] **ENCODE-01**: NtfySigningChannel이 SignRequest를 base64url 인코딩하여 ntfy message 필드에 publish한다
- [ ] **ENCODE-02**: NtfySigningChannel이 displayMessage를 ntfy title 필드에 설정한다
- [ ] **ENCODE-03**: wallet-sdk subscribeToRequests()가 변경된 인코딩으로 정상 파싱한다

### SUB — ntfy SSE 구독

- [ ] **SUB-01**: Relay가 설정된 wallet_names의 서명+알림 토픽을 SSE로 구독한다
- [ ] **SUB-02**: Relay가 SSE 연결 끊김 시 지수 백오프로 자동 재연결한다
- [ ] **SUB-03**: Relay가 ntfy message를 base64url 디코딩 + Zod 검증으로 파싱한다
- [ ] **SUB-04**: Relay가 토픽 패턴으로 서명 요청과 알림을 구분한다

### PUSH — Push Provider

- [ ] **PUSH-01**: PushwooshProvider가 createMessage API로 푸시를 전송한다
- [ ] **PUSH-02**: FcmProvider가 FCM v1 API로 푸시를 전송한다
- [ ] **PUSH-03**: Push data 필드에 전체 SignRequest/NotificationMessage JSON이 포함된다
- [ ] **PUSH-04**: ntfy priority 5 → Push high, priority 3 → Push normal로 매핑된다
- [ ] **PUSH-05**: 5xx 응답 시 지수 백오프 3회 재시도한다
- [ ] **PUSH-06**: 인증 실패(401/403) 시 재시도 없이 에러 로그한다
- [ ] **PUSH-07**: invalidTokens를 DB에서 자동 삭제한다

### REG — Device Token Registry

- [ ] **REG-01**: POST /devices로 walletName+pushToken+platform 디바이스를 등록한다
- [ ] **REG-02**: DELETE /devices/:token으로 디바이스를 해제한다
- [ ] **REG-03**: 동일 pushToken 재등록 시 upsert로 처리한다
- [ ] **REG-04**: X-API-Key 없는 요청은 401로 거부한다
- [ ] **REG-05**: GET /health로 ntfy 연결 상태와 Push 프로바이더 상태를 반환한다

### INFRA — 배포 인프라

- [ ] **INFRA-01**: @waiaas/push-relay npm 패키지로 빌드/발행한다
- [ ] **INFRA-02**: Docker 이미지(waiaas/push-relay)를 빌드한다
- [ ] **INFRA-03**: release-please-config.json에 push-relay 패키지를 등록한다
- [ ] **INFRA-04**: release.yml에 push-relay npm publish + Docker push job을 추가한다
- [ ] **INFRA-05**: config.toml 로딩 + Zod 검증으로 설정을 관리한다
- [ ] **INFRA-06**: SIGTERM/SIGINT 시 graceful shutdown을 수행한다

## v2 Requirements

다음 마일스톤으로 이연.

### 동적 디스커버리

- **DISC-01**: WAIaaS API 폴링으로 wallet_names 자동 갱신
- **DISC-02**: 지갑 추가/삭제 시 config 수정 없이 토픽 동적 구독

### 추가 프로바이더

- **PROV-01**: APNs 직접 연동 프로바이더
- **PROV-02**: OneSignal 프로바이더

## Out of Scope

| Feature | Reason |
|---------|--------|
| APNs 직접 연동 | Pushwoosh/FCM이 APNs로 전달. 직접 연동은 v2 |
| 동적 wallet_names 디스커버리 | 초기 버전은 config.toml 수동 관리. 후속 확장 |
| WAIaaS 데몬 내장 Push | Relay는 별도 서버로 분리 (지갑사 운영) |
| Relay 관리 Admin UI | 지갑사 자체 운영 서버, Admin UI 불필요 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ENCODE-01 | — | Pending |
| ENCODE-02 | — | Pending |
| ENCODE-03 | — | Pending |
| SUB-01 | — | Pending |
| SUB-02 | — | Pending |
| SUB-03 | — | Pending |
| SUB-04 | — | Pending |
| PUSH-01 | — | Pending |
| PUSH-02 | — | Pending |
| PUSH-03 | — | Pending |
| PUSH-04 | — | Pending |
| PUSH-05 | — | Pending |
| PUSH-06 | — | Pending |
| PUSH-07 | — | Pending |
| REG-01 | — | Pending |
| REG-02 | — | Pending |
| REG-03 | — | Pending |
| REG-04 | — | Pending |
| REG-05 | — | Pending |
| INFRA-01 | — | Pending |
| INFRA-02 | — | Pending |
| INFRA-03 | — | Pending |
| INFRA-04 | — | Pending |
| INFRA-05 | — | Pending |
| INFRA-06 | — | Pending |

**Coverage:**
- v1 requirements: 25 total
- Mapped to phases: 0
- Unmapped: 25 ⚠️

---
*Requirements defined: 2026-02-20*
*Last updated: 2026-02-20 after initial definition*
