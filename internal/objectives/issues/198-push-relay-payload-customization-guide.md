# #198 Wallet SDK 연동 가이드에 Push Relay 페이로드 커스텀 섹션 누락

- **유형:** MISSING
- **심각도:** LOW
- **상태:** FIXED
- **관련:** v28.8 (ConfigurablePayloadTransformer), #119 (Push Relay 시나리오 가이드 추가)

## 현상

v28.8에서 Push Relay 서버에 `ConfigurablePayloadTransformer`가 도입되어 지갑별 푸시 페이로드를 선언적으로 커스텀할 수 있게 되었으나, 관련 문서가 두 곳에서 누락되어 있다:

1. **`docs/wallet-sdk-integration.md`** — Scenario 3 (Push Relay) 섹션의 `config.toml` 예시에 `[relay.push.payload]` 설정이 없음
2. **`packages/push-relay/config.example.toml`** — payload 섹션 예시가 없어 운영자가 기능 존재를 발견하기 어려움

### 현재 docs/wallet-sdk-integration.md (Scenario 3, lines 154-179)

```toml
[relay]
ntfy_server = "https://ntfy.sh"
sign_topic_prefix = "waiaas-sign"
notify_topic_prefix = "waiaas-notify"
wallet_names = ["my-wallet"]

[relay.push]
provider = "pushwoosh"

[relay.push.pushwoosh]
api_token = "YOUR_API_TOKEN"
application_code = "YOUR_APP_CODE"

[relay.server]
port = 3200
host = "0.0.0.0"
api_key = "your-secret-api-key"
```

→ `[relay.push.payload]` 섹션 없음.

### 현재 config.example.toml (23줄)

`[relay.push]` 아래에 provider/pushwoosh/fcm만 있고, payload 설정 예시가 없음.

## 추가 필요 내용

### 1. config.example.toml에 payload 섹션 추가

```toml
# Optional: customize push notification payload per category
# [relay.push.payload.static_fields]
# app_id = "com.example.wallet"
# env = "production"
#
# [relay.push.payload.category_map.sign_request]
# sound = "alert.caf"
# badge = "1"
#
# [relay.push.payload.category_map.notification]
# sound = "default"
# channel = "info"
```

### 2. docs/wallet-sdk-integration.md Scenario 3에 페이로드 커스텀 서브섹션 추가

Scenario 3 config.toml 예시 뒤에 다음 내용 추가:

- **`[relay.push.payload]` 설정 설명**: static_fields + category_map 구조
- **머지 우선순위**: original data (최우선) > category_map > static_fields (최하위)
- **사용 예시**: D'CENT 같은 지갑 앱에 맞는 payload 커스텀 (sound, badge, app_id 등)
- **카테고리 종류**: `sign_request` / `notification`

### 3. 기능 동작 흐름 보충 설명

Push Relay 아키텍처 다이어그램 또는 설명에 transformer 위치를 명시:

```
ntfy SSE → buildPushPayload() → ConfigurablePayloadTransformer → Push Provider (FCM/Pushwoosh)
```

## 영향 범위

| 파일 | 변경 내용 |
|------|----------|
| `packages/push-relay/config.example.toml` | `[relay.push.payload]` 주석 처리된 예시 추가 |
| `docs/wallet-sdk-integration.md` | Scenario 3에 Payload Customization 서브섹션 추가 |

## 테스트 항목

- 문서 변경이므로 기능 테스트 불필요
- config.example.toml의 payload 예시가 Zod PayloadConfigSchema와 일치하는지 확인
- 가이드 문서의 카테고리명이 실제 코드 (`sign_request` / `notification`)와 일치하는지 확인
