# 231 — 구독 토큰 기반 ntfy 토픽 라우팅

- **유형:** ENHANCEMENT
- **심각도:** HIGH
- **발견:** v29.10
- **상태:** OPEN
- **의존:** #230 (wallet_type / name 분리)

## 증상

ntfy 토픽이 `waiaas-sign-{walletName}` 패턴으로 예측 가능하여 제3자가 구독으로 서명 요청/알림을 열람할 수 있음. 또한 동일 walletName의 모든 디바이스에 브로드캐스트되어 다른 사용자의 알림이 내 디바이스에 도달.

## 현재 구조 (문제)

```
토픽: "waiaas-sign-dcent"          ← 예측 가능, 보안 경계 없음
데몬 A → ntfy "waiaas-sign-dcent" ─┐
                                    ├→ [푸시 릴레이] → 모든 디센트 디바이스에 발송
데몬 B → ntfy "waiaas-sign-dcent" ─┘
```

## 수정 방안

텔레그램 봇 토큰 패턴 적용 — 푸시 릴레이가 디바이스 등록 시 구독 토큰을 생성하여 반환. 토큰이 ntfy 토픽명에 포함되어 비밀값 역할.

### 전체 플로우

```
① 지갑 앱에서 디바이스 등록
   D'CENT 앱 → POST /devices { walletName, pushToken, platform }
            ← { subscriptionToken: "dk7xp2m9" }
   → 릴레이가 ntfy "waiaas-sign-dcent-dk7xp2m9" 구독 시작
   → 앱 화면에 토큰 표시

② 사용자가 토큰 복사 → 데몬 Admin UI에 입력
   Human Wallet Apps > "내 폰" > Subscription Token: dk7xp2m9
   → sign_topic = "waiaas-sign-dcent-dk7xp2m9" 자동 구성
   → notify_topic = "waiaas-notify-dcent-dk7xp2m9" 자동 구성

③ 서명 요청/알림 발생 시
   데몬 → ntfy "sign-dcent-dk7xp2m9" → 릴레이 → FCM/APNs → 해당 디바이스만
```

### 1. 푸시 릴레이: 토큰 생성 + 동적 토픽 구독

```
POST /devices { walletName, pushToken, platform }
→ 201 { subscriptionToken: "dk7xp2m9" }

GET /devices/:pushToken/subscription-token
→ 200 { subscriptionToken: "dk7xp2m9" }
```

```sql
ALTER TABLE devices ADD COLUMN subscription_token TEXT UNIQUE;
```

토픽 형식: `waiaas-{sign|notify}-{walletName}-{token}`

### 2. 데몬: 토큰 저장 + 토픽 자동 구성

```sql
ALTER TABLE wallet_apps ADD COLUMN subscription_token TEXT;
```

```typescript
// 토큰 입력 시 토픽 자동 구성
const signTopic = `waiaas-sign-${walletType}-${token}`;
const notifyTopic = `waiaas-notify-${walletType}-${token}`;
```

### 3. Admin UI: 토큰 입력 필드

Human Wallet Apps 페이지에서 앱별 Subscription Token 입력 + 토픽 자동 표시.

## 보안 모델

| 계층 | 보안 메커니즘 |
|------|-------------|
| ntfy 토픽 | 토큰이 토픽명에 포함 → 토큰을 모르면 구독 불가 |
| 푸시 릴레이 | 1 토큰 = 1 디바이스 → 정확한 대상에만 발송 |
| 디바이스 등록/재조회 | X-API-Key 인증 (기존) |

## 영향 범위

- `packages/push-relay/src/registry/device-registry.ts` — subscription_token 컬럼 + 토큰 생성
- `packages/push-relay/src/registry/device-routes.ts` — POST 응답에 토큰 반환 + GET 재조회
- `packages/push-relay/src/subscriber/` — 토큰 기반 동적 토픽 구독
- `packages/daemon/src/infrastructure/database/schema.ts` — wallet_apps.subscription_token
- `packages/daemon/src/services/signing-sdk/wallet-app-service.ts` — 토큰→토픽 자동 구성
- `packages/daemon/src/services/signing-sdk/sign-request-builder.ts` — 토큰 기반 토픽 publish
- `packages/daemon/src/services/signing-sdk/channels/wallet-notification-channel.ts` — 토큰 기반 토픽 publish
- `packages/admin/src/pages/wallet-apps.tsx` — Subscription Token 입력 필드

## 테스트 항목

- [ ] POST /devices → subscriptionToken 반환
- [ ] GET /devices/:pushToken/subscription-token → 토큰 재조회
- [ ] 토큰 저장 시 sign_topic/notify_topic 자동 구성 (`waiaas-{sign|notify}-{walletType}-{token}`)
- [ ] 토큰 기반 토픽으로 서명 요청 publish → 해당 디바이스만 수신
- [ ] 토큰 기반 토픽으로 알림 publish → 해당 디바이스만 수신
- [ ] 토큰 미입력 시 기존 prefix-walletType 폴백 (하위 호환)
- [ ] 토큰이 다른 디바이스에 알림 미수신
- [ ] Admin UI에서 토큰 입력 + 토픽 자동 표시
