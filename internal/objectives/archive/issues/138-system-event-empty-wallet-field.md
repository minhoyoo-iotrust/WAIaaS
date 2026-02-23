# #138 시스템 이벤트 알림에 불필요한 Wallet/타임스탬프 표시

- **유형:** BUG
- **심각도:** LOW
- **마일스톤:** v27.1
- **상태:** FIXED

## 증상

UPDATE_AVAILABLE 등 지갑과 무관한 시스템 이벤트 알림에서 "Wallet: " (빈값)과 타임스탬프가 불필요하게 표시된다.

### 실제 텔레그램 메시지 예시

```
WAIaaS 업데이트 가능

WAIaaS 업데이트 가능
새 버전 2.5.0이(가) 출시되었습니다 (현재: 2.5.0-rc.1). `waiaas update`를 실행하여 업데이트하세요.

Wallet:
2026-02-21T14:59:28.000Z
```

## 원인

1. `VersionCheckService`가 `notify('UPDATE_AVAILABLE', '', ...)`로 빈 walletId를 전달 (version-check-service.ts:131)
2. 4개 채널 모두 `payload.walletId`와 타임스탬프를 무조건 출력하여 시스템 이벤트에서 불필요한 메타 정보가 표시됨

## 수정 방향

- 각 채널에서 `payload.walletId`가 빈 문자열일 때 Wallet 줄/필드와 타임스탬프를 생략
- 또는 `NotificationPayload`에 `walletId`를 optional(`string | null`)로 변경하고 각 채널에서 null/빈값 체크
- 시스템 이벤트(walletId 없음)에서는 메시지 본문만 표시하고 메타 정보(Wallet, 타임스탬프)를 제외

### 수정 대상 파일

- `packages/daemon/src/notifications/channels/telegram.ts` — walletId 빈값 시 Wallet 줄 생략
- `packages/daemon/src/notifications/channels/discord.ts` — walletId 빈값 시 Wallet 필드 생략
- `packages/daemon/src/notifications/channels/slack.ts` — walletId 빈값 시 Wallet 필드 생략
- `packages/daemon/src/notifications/channels/ntfy.ts` — walletId 빈값 시 Wallet 줄 생략
- `packages/core/src/types/notification.ts` — walletId optional 변경 검토
- 관련 테스트 파일 갱신

## 테스트 항목

- [ ] UPDATE_AVAILABLE 알림에서 Wallet 줄/필드와 타임스탬프가 표시되지 않는지 확인
- [ ] 지갑 관련 이벤트에서는 Wallet 필드와 타임스탬프가 정상 표시되는지 확인
- [ ] notification_logs 저장에 영향 없는지 확인
