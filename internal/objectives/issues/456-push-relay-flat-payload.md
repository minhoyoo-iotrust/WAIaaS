# 456 — Push Relay 서명 요청 payload가 D'CENT 기대 포맷과 불일치

- **유형:** BUG
- **심각도:** HIGH
- **상태:** FIXED
- **발견일:** 2026-03-25
- **관련 마일스톤:** v32.9 (Push Relay 직접 연동)

## 증상

D'CENT 지갑 앱이 서명 요청 푸시 알림을 수신하지만, SignRequest 필드를 파싱할 수 없음.

## 원인

v32.9에서 ntfy.sh를 제거하고 Push Relay 직접 연동으로 전환하면서, `push-relay-signing-channel.ts`의 payload 포맷이 변경됨.

**기존 (ntfy.sh 시대 — D'CENT 정상 파싱):**
SignRequest 필드가 플랫하게 전달됨:
```json
{
  "caip2ChainId": "eip155:11155111",
  "displayMessage": "TRANSFER 50000000000000000 from 0x74451a... to 0x74451a...",
  "expiresAt": "2026-03-17T11:35:40.987Z",
  "message": "WAIaaS Transaction Approval\n...",
  "metadata": "{\"txId\":\"...\",\"type\":\"TRANSFER\",...}",
  "networkName": "ethereum-sepolia",
  "requestId": "019cfb79-0f7b-7892-aced-1132fd4d17d3",
  "responseChannel": "{\"type\":\"ntfy\",...}",
  "signerAddress": "0x8Fe4...",
  "tag_group_name": "subscription_items",
  "tag_value": "tag_waiaas",
  "version": "1"
}
```

**현재 (v32.9 이후 — D'CENT 파싱 불가):**
SignRequest가 base64로 인코딩되어 `request` 필드에 래핑됨:
```json
{
  "body": "Test sign request for D'CENT Wallet",
  "request": "eyJ2ZXJza...",
  "title": "WAIaaS Sign Request"
}
```

## 수정 위치

`packages/daemon/src/services/signing-sdk/channels/push-relay-signing-channel.ts` (line 100-118)

### 변경 내용

payload를 base64 래핑 대신 SignRequest 필드를 플랫하게 전달:
- `version`, `requestId`, `caip2ChainId`, `networkName`, `signerAddress`, `message`, `displayMessage`, `expiresAt` → 그대로 전달
- `metadata`, `responseChannel` → `JSON.stringify()`로 직렬화하여 문자열로 전달
- `universalLinkUrl` → 추가 전달
- `title`, `body` → 기존 유지 (Pushwoosh push notification 표시용)
- base64 `encoded` 변수 및 `request` 필드 제거

### Push Relay config (별도 — 운영자 수정)

`tag_group_name`/`tag_value` Pushwoosh 태그는 Push Relay config.toml의 `static_fields`로 설정:
```toml
[relay.push.payload.static_fields]
tag_group_name = "subscription_items"
tag_value = "tag_waiaas"
```

## 테스트 항목

1. **단위 테스트**: `push-relay-signing-channel.test.ts` — POST `/v1/push` payload에 플랫 SignRequest 필드가 포함되는지 검증
2. **단위 테스트**: payload에 `metadata`/`responseChannel`이 JSON 문자열로 직렬화되는지 검증
3. **단위 테스트**: base64 인코딩된 `request` 필드가 더 이상 포함되지 않는지 검증
4. **통합 테스트**: Admin UI 테스트 서명 요청 → Push Relay → Pushwoosh 전달 흐름에서 D'CENT 기대 포맷 일치 확인
