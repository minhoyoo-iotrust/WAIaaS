# 228 — Admin UI ntfy Channel Status가 항상 "Not Configured"로 표시

- **유형:** BUG
- **심각도:** MEDIUM
- **발견:** v29.10
- **상태:** FIXED

## 증상

Admin UI Notifications 페이지의 Channel Status에서 ntfy가 항상 "Not Configured"로 표시된다. 디센트 지갑으로 오너를 설정한 에이전트 지갑이 있고, `wallet_apps` 테이블에 `sign_topic`/`notify_topic`이 설정되어 있음에도 불구하고 비활성으로 표시됨.

## 원인

v29.10에서 ntfy를 글로벌 채널에서 지갑별 토픽으로 마이그레이션했으나, `/v1/admin/notifications/status` 엔드포인트의 ntfy 상태 판단 로직이 업데이트되지 않음.

**현재 코드** (`packages/daemon/src/api/routes/admin.ts`):
```typescript
{
  name: 'ntfy',
  enabled: !!(
    deps.notificationConfig?.ntfy_topic &&   // ← v29.10에서 제거된 글로벌 설정
    channelNames.includes('ntfy')            // ← 글로벌 채널 목록에 없음
  ),
}
```

v29.10에서 글로벌 `ntfy_topic` 설정을 제거하고 `wallet_apps` 테이블의 `sign_topic`/`notify_topic` 컬럼으로 이전했기 때문에, 두 조건 모두 항상 `false`가 됨.

## 실제 상태

ntfy는 정상 작동 중:
- `NtfySigningChannel` → `wallet_apps.sign_topic`으로 서명 요청 전송
- `WalletNotificationChannel` → `wallet_apps.notify_topic`으로 알림 전송

Admin UI의 글로벌 Channel Status만 새 구조를 반영하지 못하는 상태.

## 수정 방안

`wallet_apps` 테이블을 조회해서 ntfy 토픽 설정 여부를 집계하여 표시.

### 백엔드
1. `/v1/admin/notifications/status` 엔드포인트에서 `wallet_apps` 테이블의 `sign_topic`/`notify_topic` 설정된 지갑 수 조회
2. ntfy 채널 상태에 설정된 지갑 수 포함하여 응답 (`configuredWallets: N` 등)

### 프론트엔드
1. ntfy 카드에 "N개 지갑에 설정됨" 형태로 상태 표시
2. 0개인 경우 "Not Configured" 유지

### 테스트
1. `admin-notification-api.test.ts`의 ntfy 관련 assertion 업데이트
2. wallet_apps에 토픽이 설정된 경우 `enabled: true` + `configuredWallets` 수 검증

## 테스트 항목

- [ ] wallet_apps에 sign_topic/notify_topic이 설정된 지갑이 있을 때 ntfy 상태가 "Configured" 계열로 표시되는지 확인
- [ ] wallet_apps에 토픽이 설정된 지갑이 없을 때 "Not Configured"로 표시되는지 확인
- [ ] 상태 응답에 설정된 지갑 수가 정확히 포함되는지 확인
- [ ] Admin UI에서 ntfy 카드가 올바른 상태 텍스트를 표시하는지 확인

## 영향 범위

- `packages/daemon/src/api/routes/admin.ts` — 상태 엔드포인트 수정
- `packages/admin/src/pages/notifications.tsx` — ntfy 카드 표시 로직
- `packages/daemon/src/__tests__/admin-notification-api.test.ts` — 테스트 갱신
