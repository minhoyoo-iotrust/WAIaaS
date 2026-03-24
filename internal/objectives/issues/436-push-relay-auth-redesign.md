# 436 — Push Relay API Key 인증 정책 재설계

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **상태:** OPEN
- **등록일:** 2026-03-24
- **파일:** `packages/push-relay/src/relay/sign-response-routes.ts`, `packages/push-relay/src/config.ts`, `packages/push-relay/src/server.ts`

## 설명

현재 Push Relay는 `POST /v1/push`에 API Key를 필수로 요구하지만, 데몬 측에서 `signing_sdk.push_relay_api_key`가 SETTING_DEFINITIONS에 정의되지 않아 설정할 수 없고, 결과적으로 테스트 알림이 401로 실패한다.

근본적으로 호출 주체별로 인증 요구사항이 다르므로, 엔드포인트별 인증 정책을 재설계한다.

## 호출 주체별 엔드포인트 분류

### 지갑 앱 → 릴레이 (API Key 필요)

| 엔드포인트 | 용도 | 이유 |
|---|---|---|
| `POST /devices` | 디바이스 등록 | 레지스트리 조작 보호 |
| `GET /devices/:token/subscription-token` | subscription token 조회 | 레지스트리 조회 보호 |
| `DELETE /devices/:token` | 디바이스 해제 | 레지스트리 조작 보호 |
| `POST /v1/sign-response` | 서명 응답 제출 | 서명 응답 위조 방지 |

지갑 앱은 빌드 시 API Key를 내장할 수 있다.

### WAIaaS 데몬 → 릴레이 (API Key 불필요)

| 엔드포인트 | 용도 | 이유 |
|---|---|---|
| `POST /v1/push` | 푸시 알림/서명요청 발송 | subscriptionToken이 credential 역할 |
| `GET /v1/sign-response/:requestId` | 서명 응답 long-polling | requestId(UUID)가 사실상 인증 |

### 공개

| 엔드포인트 | 용도 |
|---|---|
| `GET /health` | 헬스체크 |

## 구현 방안

1. `POST /v1/push`에서 API Key 검증 제거
2. `GET /v1/sign-response/:requestId`는 이미 공개 — 변경 없음
3. `POST /v1/sign-response`에 API Key 검증 추가 (현재 공개 → 보호로 전환)
4. `/devices/*` 엔드포인트는 기존 API Key 미들웨어 유지
5. `config.toml`의 `api_key`는 필수 유지 (지갑 앱 보호용)

## 테스트 항목

- [ ] `POST /v1/push` — API Key 없이 subscriptionToken만으로 정상 발송되는지 확인
- [ ] `POST /v1/push` — subscriptionToken이 유효하지 않으면 404 반환 확인
- [ ] `POST /v1/sign-response` — API Key 없으면 401 반환 확인
- [ ] `POST /v1/sign-response` — API Key 있으면 정상 저장 확인
- [ ] `/devices/*` — 기존 API Key 검증 동작 유지 확인
- [ ] `GET /v1/sign-response/:requestId` — API Key 없이 정상 폴링 확인
- [ ] `GET /health` — 공개 접근 유지 확인
