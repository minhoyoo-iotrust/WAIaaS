# 458 — Push Relay 디버그 모드에서 푸시 payload 및 서명 응답 내용이 로그에 출력되지 않음

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **상태:** FIXED
- **발견일:** 2026-03-25
- **관련 패키지:** @waiaas/push-relay

## 증상

Push Relay를 `--debug` 또는 `DEBUG=1`로 실행해도, 실제 푸시 알림 payload와 서명 응답 내용을 확인할 수 없어 D'CENT 등 외부 지갑 앱 연동 시 디버깅이 어려움.

## 현재 상태

디버그 모드에서 로그되는 항목:

| 항목 | 현재 로그 | 누락 |
|------|-----------|------|
| POST /v1/push | `subscriptionToken`, `category` | payload 전체 (title, body, data 필드) |
| POST /v1/sign-response | `requestId`, `action` | signature, signerAddress, signedAt |
| GET /v1/sign-response/:id | `requestId`, `timeout` | 조회된 응답 내용 |
| Push Provider 호출 | 로그 없음 | FCM/Pushwoosh 전달 payload, 응답 상태 |

## 수정 내용

디버그 모드(`--debug` / `DEBUG=1`) 활성화 시 아래 내용을 추가 로그:

### 1. POST /v1/push — 푸시 payload 전체 출력
- `sign-response-routes.ts`: payload 객체를 `JSON.stringify`로 로그
- 민감 정보 고려: 디버그 모드에서만 출력되므로 운영 환경에 영향 없음

### 2. POST /v1/sign-response — 서명 응답 상세 출력
- `sign-response-routes.ts`: `signature` (앞 20자 마스킹), `signerAddress`, `signedAt` 로그

### 3. GET /v1/sign-response/:requestId — 조회 응답 출력
- `sign-response-routes.ts`: 응답 발견 시 `action`, `signerAddress` 로그

### 4. Push Provider 호출 결과
- `fcm-provider.ts`: FCM 전달 payload 요약 + HTTP 응답 상태 로그
- `pushwoosh-provider.ts`: Pushwoosh 전달 payload 요약 + HTTP 응답 상태 로그

## 테스트 항목

1. **단위 테스트**: `--debug` 모드에서 POST /v1/push 호출 시 payload가 콘솔에 출력되는지 검증
2. **단위 테스트**: POST /v1/sign-response 호출 시 서명 상세가 마스킹되어 출력되는지 검증
3. **단위 테스트**: `--debug` 미활성화 시 상세 로그가 출력되지 않는지 검증
4. **단위 테스트**: Push Provider(FCM/Pushwoosh) 호출 결과가 디버그 로그에 포함되는지 검증
