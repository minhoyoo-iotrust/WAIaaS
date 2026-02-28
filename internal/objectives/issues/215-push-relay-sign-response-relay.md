# #215 — Push Relay 서명 응답 릴레이 엔드포인트 추가

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **상태:** FIXED
- **수정일:** 2026-02-28
- **마일스톤:** v29.5
- **등록일:** 2026-02-28

## 현상

현재 서명 플로우가 이원화되어 있다:

- **일반 알림**: Daemon → ntfy → Push Relay → FCM/Pushwoosh → 지갑 앱 (정상)
- **서명 요청**: Daemon → ntfy → Push Relay → FCM/Pushwoosh → 지갑 앱 (전달은 됨)
- **서명 응답**: 지갑 앱 → ntfy 직접 POST (Push Relay 우회)

서명 요청은 Push Relay를 통해 FCM 푸시로 전달되지만, 지갑 앱이 서명 후 응답을 보낼 때는 ntfy 서버 주소를 직접 알아야 한다. 이로 인해 지갑 앱(D'CENT 등)이 Push Relay 주소와 ntfy 주소를 모두 알아야 하는 불필요한 복잡성이 존재한다.

현재 `docs/wallet-sdk-integration.md` Scenario 3에도 이 제약이 명시되어 있다:
> "Push Relay is one-directional (daemon → wallet). Responses always go back directly via ntfy."

## 기대 동작

지갑 앱은 **Push Relay 주소만** 알면 되도록 서명 응답 릴레이를 추가한다:

```
지갑 앱 → POST /v1/sign-response → Push Relay → ntfy response topic → Daemon
```

## 영향 범위

- `packages/push-relay/src/` — 서명 응답 릴레이 엔드포인트 추가
- `packages/wallet-sdk/src/` — `sendViaRelay()` 함수 추가
- `docs/wallet-sdk-integration.md` — Scenario 3 코드 예제 및 Note 수정, Signing Flow 다이어그램 업데이트

## 변경 사항

### 1. Push Relay: `POST /v1/sign-response` 엔드포인트

- 지갑 앱에서 서명 응답(SignResponse)을 수신
- ntfy response topic(`waiaas-sign-resp-{requestId}`)으로 전달
- 요청 바디에 `requestId`, `action`, `signature`, `signerAddress` 포함

### 2. Wallet SDK: `sendViaRelay()` 함수

- `sendViaRelay(response: SignResponse, pushRelayUrl: string)` 추가
- Push Relay의 `/v1/sign-response` 엔드포인트로 POST
- 기존 `sendViaNtfy()`는 테스트/디버깅/서버사이드 용도로 유지

### 3. Wallet SDK Integration Guide 수정

- Scenario 3 코드 예제: `sendViaNtfy()` → `sendViaRelay()` 로 변경
- "Push Relay is one-directional" Note 삭제
- Signing Flow 다이어그램에서 응답 경로를 Push Relay 경유로 업데이트
- FAQ "What is Push Relay" 답변에 양방향 지원 반영

## 테스트 항목

- [ ] Push Relay `/v1/sign-response` 엔드포인트가 SignResponse를 받아 ntfy로 전달하는지 확인
- [ ] 잘못된 SignResponse 형식에 대해 400 에러 반환하는지 확인
- [ ] Wallet SDK `sendViaRelay()`가 Push Relay로 정상 POST하는지 확인
- [ ] 기존 `sendViaNtfy()` 동작이 유지되는지 확인
- [ ] Scenario 3 가이드대로 통합했을 때 E2E 서명 플로우가 정상 동작하는지 확인
