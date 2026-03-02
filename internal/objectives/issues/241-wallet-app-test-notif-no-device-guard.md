# #241 지갑 앱 테스트 알림이 subscriptionToken 미설정 상태에서도 발송 성공

- **유형:** BUG
- **심각도:** MEDIUM
- **발견일:** 2026-03-03
- **마일스톤:** —
- **상태:** FIXED
- **수정일:** 2026-03-03
- **관련 이슈:** #240

## 증상

Admin UI에서 지갑 앱 테스트 알림 발송 시, 해당 앱의 `subscriptionToken`이 null(디바이스 미등록)이어도 `{ success: true }` 반환. 받을 디바이스가 준비되지 않은 상태에서 발송 성공으로 표시.

## 근본 원인

테스트 알림 API(`POST /admin/wallet-apps/{id}/test-notification`)에 Gate 1~3(SDK 활성, 알림 활성, 앱 알림 활성) 체크는 있지만, `app.subscriptionToken` 존재 여부 체크가 없음:

```typescript
// wallet-apps.ts:234-241
// Gate 3: App alerts enabled ← 여기까지만 체크
if (!app.alertsEnabled) { ... }

// subscriptionToken 체크 없이 바로 발송
const notifyTopic = app.notifyTopic || `waiaas-notify-${app.name}`;
await fetch(url, { method: 'POST', body: encoded });
```

`subscriptionToken`이 null이면 기본 토픽(`waiaas-notify-{name}`)으로 발행되고, ntfy는 구독자 유무에 관계없이 200 반환.

## 수정 방안

테스트 알림 API에 Gate 4 추가 — `app.subscriptionToken`이 없으면 발송 차단:

```typescript
// Gate 4: subscriptionToken 존재 여부
if (!app.subscriptionToken) {
  return c.json({
    success: false,
    error: 'No device registered for this wallet app. Register a device first.',
  }, 200);
}
```

## 테스트 항목

- [ ] subscriptionToken이 null인 앱에 테스트 알림 시 실패 응답 + 안내 메시지 반환
- [ ] subscriptionToken이 설정된 앱에 테스트 알림 시 정상 성공 반환
- [ ] Admin UI에서 실패 시 적절한 에러 토스트 표시
- [ ] 기존 Gate 1~3 체크 동작 유지
