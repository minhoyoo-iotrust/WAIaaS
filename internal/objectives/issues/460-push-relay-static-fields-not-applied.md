# #460 — Push Relay config.toml static_fields가 푸시 payload에 반영되지 않음

- **유형:** BUG
- **심각도:** HIGH
- **상태:** OPEN
- **등록일:** 2026-03-25
- **발견 경위:** D'CENT 지갑 앱 푸시 알림 테스트 중 tag_group_name, tag_value가 푸시에 포함되지 않는 것을 확인

## 현상

`config.toml`에 `[relay.push.payload.static_fields]` 설정을 추가해도 실제 Pushwoosh API 요청의 `data` 필드에 해당 값이 포함되지 않는다.

```toml
[relay.push.payload.static_fields]
tag_group_name = "subscription_items"
tag_value = "tag_waiaas"
```

위 설정이 있어도 푸시 payload에 `tag_group_name`과 `tag_value`가 누락된다.

## 원인 분석

`ConfigurablePayloadTransformer`가 코드에 존재하지만 실제 파이프라인에 연결되어 있지 않다.

1. **`bin.ts`** — `config.relay.push.payload`를 읽지 않고 `createServer()`에 전달하지 않음
2. **`server.ts`** (`ServerOpts`) — `IPayloadTransformer` 의존성이 없음
3. **`sign-response-routes.ts`** (`SignResponseRoutesOpts`) — `IPayloadTransformer` 의존성이 없음
4. **`POST /v1/push` 핸들러** (sign-response-routes.ts:102-135) — transformer 호출 없이 raw payload를 그대로 `PushwooshProvider.send()`에 전달

### 영향받는 파일

| 파일 | 문제 |
|------|------|
| `packages/push-relay/src/bin.ts` | `config.relay.push.payload` 미사용 |
| `packages/push-relay/src/server.ts` | `ServerOpts`에 transformer 미포함 |
| `packages/push-relay/src/relay/sign-response-routes.ts` | `SignResponseRoutesOpts`에 transformer 미포함, push 핸들러에서 미호출 |

## 수정 방안

1. `SignResponseRoutesOpts`에 `transformer?: IPayloadTransformer` 추가
2. `POST /v1/push` 핸들러에서 pushPayload 빌드 후 `transformer.transform(pushPayload)` 적용
3. `ServerOpts`에 `transformer?: IPayloadTransformer` 추가하고 `createSignResponseRoutes()`에 전달
4. `bin.ts`에서 `config.relay.push.payload`가 있으면 `ConfigurablePayloadTransformer` 생성하여 `createServer()`에 전달

## 테스트 항목

- [ ] `static_fields` 설정 시 `POST /v1/push` 응답 payload.data에 static_fields가 머지되는지 확인
- [ ] `category_map` 설정 시 카테고리별 필드가 추가되는지 확인
- [ ] 원본 payload 키가 static_fields/category_map보다 우선하는지 확인 (머지 순서 보장)
- [ ] `payload` 설정이 없을 때 transformer 미적용으로 기존 동작 유지 확인
- [ ] 실제 Pushwoosh 푸시에서 tag_group_name, tag_value가 디바이스에 전달되는지 E2E 확인
