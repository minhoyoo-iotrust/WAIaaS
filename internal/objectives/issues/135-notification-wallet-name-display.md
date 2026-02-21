# 135 — 알림 메시지에서 walletId 대신 walletName을 주 표시하고 부가 정보를 하단에 축약 표시

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **마일스톤:** v27.0
- **상태:** OPEN
- **등록일:** 2026-02-21

## 현상

텔레그램 등 알림 채널의 메시지에서 지갑을 `walletId`(UUID)로만 표시하여 어떤 지갑인지 인지하기 어렵다.

### 현재 메시지 예시 (Telegram)

```
*Low Balance Alert*

Wallet 019c6fb6-2b2d-72a8-8515-235255be884d balance low: 0.5 SOL.
Threshold: 1.0 SOL. Please top up.

Wallet: 019c6fb6-2b2d-72a8-8515-235255be884d
2026-02-21T15:30:45.000Z
```

UUID는 사람이 읽기 어렵고, 여러 지갑을 운영할 때 알림만으로 어떤 지갑인지 즉시 파악할 수 없다.

### 영향 범위

`walletId`가 표시되는 위치:

1. **메시지 템플릿** (`core/i18n/en.ts`, `ko.ts`) — `{walletId}` 변수를 사용하는 11개 이벤트
2. **Telegram 채널** (`telegram.ts`) — 하단에 `Wallet: {walletId}` 고정 출력
3. **Discord 채널** (`discord.ts`) — Embed `Wallet` 필드에 `walletId`
4. **ntfy 채널** (`ntfy.ts`) — 하단에 `Wallet: {walletId}` 출력

## 수정 범위

### 1. NotificationPayload에 지갑 부가 정보 추가

`core/interfaces/INotificationChannel.ts`의 `NotificationPayload`에 필드 추가:

```typescript
export interface NotificationPayload {
  eventType: NotificationEventType;
  walletId: string;
  walletName?: string;       // 추가
  walletAddress?: string;    // 추가
  network?: string;          // 추가
  message: string;
  details?: Record<string, unknown>;
  timestamp: number;
}
```

### 2. NotificationService에서 지갑 정보 조회

`notification-service.ts`의 `notify()` 호출 시 `walletId`로 DB에서 지갑 이름, 주소, 네트워크를 조회하여 payload에 포함. 시스템 이벤트(`walletId === 'system'`)는 조회 스킵.

### 3. 메시지 템플릿 변경

`{walletId}` → `{walletName}` 으로 주 메시지 변경:

현재:
```
Wallet {walletId} balance low: {balance} {currency}.
```

수정:
```
{walletName} balance low: {balance} {currency}.
```

### 4. 채널별 하단 부가 정보 포맷

**Telegram:**
```
*Low Balance Alert*

my-sol-wallet balance low: 0.5 SOL.
Threshold: 1.0 SOL. Please top up.

my-sol-wallet (019c6f…864d)
3HfE…v4nB · solana-devnet
2026-02-21T15:30:45.000Z
```

**Discord (Embed fields):**
```
Wallet: my-sol-wallet
ID: 019c6f…864d
Address: 3HfE…v4nB
Network: solana-devnet
```

**ntfy:**
```
my-sol-wallet (019c6f…864d)
3HfE…v4nB · solana-devnet
```

### 5. 축약 규칙

- **walletId**: 앞 6자 + `…` + 뒤 4자 (예: `019c6f…864d`)
- **walletAddress**: 앞 4자 + `…` + 뒤 4자 (예: `3HfE…v4nB`)
- **walletName**: 축약 없이 전체 표시

### 6. 영향 파일

| 파일 | 변경 내용 |
|------|----------|
| `packages/core/src/interfaces/INotificationChannel.ts` | NotificationPayload에 walletName/walletAddress/network 추가 |
| `packages/core/src/i18n/en.ts` | 11개 템플릿 `{walletId}` → `{walletName}` |
| `packages/core/src/i18n/ko.ts` | 11개 템플릿 `{walletId}` → `{walletName}` |
| `packages/daemon/src/notifications/notification-service.ts` | notify()에서 지갑 정보 조회 + payload 구성 |
| `packages/daemon/src/notifications/channels/telegram.ts` | 하단 포맷 변경 (이름 + 축약 ID/주소/네트워크) |
| `packages/daemon/src/notifications/channels/discord.ts` | Embed 필드 변경 |
| `packages/daemon/src/notifications/channels/ntfy.ts` | 하단 포맷 변경 |

## 테스트 항목

### 단위 테스트

1. 알림 메시지 본문에 `walletName`이 표시되는지 확인
2. Telegram 하단에 축약된 walletId, walletAddress, network가 표시되는지 확인
3. Discord Embed에 walletName, 축약 ID, 주소, 네트워크 필드가 포함되는지 확인
4. ntfy 메시지에 walletName과 축약 정보가 표시되는지 확인
5. walletId 축약이 앞 6자 + `…` + 뒤 4자 형식인지 확인
6. walletAddress 축약이 앞 4자 + `…` + 뒤 4자 형식인지 확인
7. 시스템 이벤트(`walletId === 'system'`)에서 지갑 조회가 스킵되는지 확인
8. 지갑이 삭제된 경우(조회 실패) walletId 폴백으로 표시되는지 확인

### 회귀 테스트

9. 기존 알림 로그(`notification_logs`)에 저장되는 메시지 형식이 유지되는지 확인
10. WalletNotificationChannel(사이드 채널)이 영향 받지 않는지 확인
11. Slack 채널이 있는 경우 동일한 포맷이 적용되는지 확인
