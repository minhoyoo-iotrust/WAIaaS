# #240 Push Relay 기본 토픽 브로드캐스트 제거 — 디바이스 토픽 유니캐스트만 허용

- **유형:** BUG
- **심각도:** HIGH
- **발견일:** 2026-03-03
- **마일스톤:** —
- **상태:** FIXED
- **수정일:** 2026-03-03
- **선행 이슈:** #231, #237

## 증상

Push Relay에서 ntfy 메시지 수신 시 `walletName` 기준으로 해당 지갑에 등록된 **모든 디바이스에 브로드캐스트** 발송. 디바이스별 subscription token 토픽(`waiaas-notify-dcent-a1b2c3d4`)으로 들어온 메시지도 `dcent` 지갑의 전체 디바이스에 푸시됨.

## 근본 원인

`onMessage` 콜백이 `walletName`만 전달받고 수신 토픽 정보가 없어서 기본 토픽/디바이스 토픽 구분 불가:

```typescript
// bin.ts — 현재 코드
onMessage: async (walletName, payload) => {
  const tokens = registry.getTokensByWalletName(walletName); // 전체 디바이스
  provider.send(tokens, payload); // 브로드캐스트
}
```

기본 토픽(`waiaas-notify-dcent`)은 단순 테스트용이며, 실 운영에서 푸시 발송 대상이 아님. Push Relay는 디바이스 토픽에서 수신한 메시지만 해당 디바이스 1대에 푸시해야 함.

## 요구 사항

1. **기본 토픽 수신 시 푸시 발송하지 않음** — `waiaas-sign-{walletName}`, `waiaas-notify-{walletName}` 토픽의 메시지는 무시 (또는 기본 토픽 구독 자체 제거)
2. **디바이스 토픽 수신 시 해당 디바이스 1대에만 유니캐스트** — `waiaas-notify-{walletName}-{subscriptionToken}` 토픽의 메시지는 해당 `subscriptionToken`을 가진 디바이스의 `pushToken`으로만 발송
3. **`onMessage` 콜백에 토픽 정보 전달** — `walletName` 외에 수신 토픽 또는 `subscriptionToken`을 함께 전달하여 라우팅 판단 가능하도록 변경

## 수정 방안

### 1. `NtfySubscriber` onMessage 시그니처 변경

```typescript
// 변경 전
onMessage: (walletName: string, payload: PushPayload) => Promise<void>;

// 변경 후
onMessage: (walletName: string, payload: PushPayload, topic: string) => Promise<void>;
```

### 2. `bin.ts` onMessage 콜백에서 토픽 기반 라우팅

```typescript
onMessage: async (walletName, payload, topic) => {
  // 기본 토픽이면 푸시 발송하지 않음
  const signBase = `${config.relay.sign_topic_prefix}-${walletName}`;
  const notifyBase = `${config.relay.notify_topic_prefix}-${walletName}`;
  if (topic === signBase || topic === notifyBase) return;

  // 디바이스 토픽에서 subscriptionToken 추출
  const suffix = topic.replace(`${signBase}-`, '').replace(`${notifyBase}-`, '');
  const device = registry.getBySubscriptionToken(suffix);
  if (!device) return;

  const result = await provider.send([device.pushToken], payload);
  // ...
}
```

### 3. `DeviceRegistry`에 subscriptionToken 조회 메서드 추가

```typescript
getBySubscriptionToken(token: string): DeviceRecord | null {
  // SELECT ... FROM devices WHERE subscription_token = ?
}
```

## 테스트 항목

- [ ] 기본 토픽(`waiaas-notify-{walletName}`) 수신 시 푸시 미발송 확인
- [ ] 디바이스 토픽(`waiaas-notify-{walletName}-{token}`) 수신 시 해당 디바이스 1대에만 발송
- [ ] 동일 walletName에 디바이스 2대 등록 → 디바이스 A 토픽 메시지가 디바이스 B에 미발송
- [ ] 존재하지 않는 subscriptionToken 토픽 메시지 수신 시 무시
- [ ] 기존 디바이스 등록/삭제/health API 정상 동작 유지
