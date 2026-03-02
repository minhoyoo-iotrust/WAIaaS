# 마일스톤 m29-10: ntfy 토픽 지갑별 설정 전환

- **Status:** PLANNED
- **Milestone:** TBD

## 목표

글로벌 단일 `notifications.ntfy_topic` 설정을 제거하고, Human Wallet Apps(`wallet_apps` 테이블)에서 지갑별 `sign_topic`과 `notify_topic`을 관리하도록 전환하여, Push Relay 구독 토픽과 데몬 발송 토픽을 일치시키고 멀티 지갑 알림 구조를 정리한다.

---

## 배경

### 현재 문제

ntfy 알림이 세 개의 독립된 채널로 분산되어 있고, Admin UI 표시와 실제 동작이 불일치:

| 채널 | 토픽 소스 | Push Relay 구독 | Admin UI 표시 |
|------|-----------|----------------|---------------|
| NotificationService NtfyChannel | `notifications.ntfy_topic` (글로벌 1개) | X | "Ntfy: Not Configured" |
| WalletNotificationChannel | `signing_sdk.*_prefix` + 지갑명 조합 | O (`waiaas-notify-{name}`) | 표시 없음 |
| NtfySigningChannel | `signing_sdk.*_prefix` + 지갑명 조합 | O (`waiaas-sign-{name}`) | 표시 없음 |

**문제점:**

1. Admin UI에서 "Ntfy: Not Configured"인데 실제 Push Relay 경로(WalletNotificationChannel)는 정상 동작 가능 — 사용자 혼란
2. 글로벌 `ntfy_topic` 하나로는 멀티 지갑 시나리오에서 의미 없음 — Push Relay가 구독하지 않는 토픽에 발송
3. prefix 기반 토픽은 암묵적 조합으로만 결정 — 사용자가 실제 토픽명을 확인/수정할 수 없음
4. NotificationService NtfyChannel과 WalletNotificationChannel이 이중 경로 — 같은 이벤트가 다른 토픽에 중복 발송되거나, 한쪽만 발송

### 알림 발송 아키텍처 현행

`NotificationService.notify()`는 이중 경로로 독립 발송:

```
notify(eventType, walletId, ...)
  │
  ├── Path A: WalletNotificationChannel (fire-and-forget, 독립 실행)
  │   → waiaas-notify-{appName} 토픽별 발송 (Push Relay 구독)
  │   → channels.length === 0 이어도 항상 실행
  │
  └── Path B: Traditional Channels (broadcast 또는 fallback)
      → Telegram, Discord, Slack, NtfyChannel(글로벌)
      → broadcast 이벤트(5종): 모든 채널 동시 발송
      → 일반 이벤트: 우선순위 순서로 시도 (첫 성공에서 중단)
```

Path A와 Path B는 완전 독립이므로, 글로벌 NtfyChannel 제거 시 Telegram/Discord/Slack 및 WalletNotificationChannel에 영향 없음.

---

## 구현 대상

### 1. `wallet_apps` 테이블에 토픽 컬럼 추가

```sql
ALTER TABLE wallet_apps ADD COLUMN sign_topic TEXT;
ALTER TABLE wallet_apps ADD COLUMN notify_topic TEXT;
```

- 지갑 앱 등록 시 기본값 자동 세팅:
  - `sign_topic` = `waiaas-sign-{app_name}`
  - `notify_topic` = `waiaas-notify-{app_name}`
- 기존 `wallet_apps` 행에 대해 마이그레이션으로 기본값 채움
- prefix 설정은 기본값 생성 시 폴백으로만 사용

### 2. NtfySigningChannel 토픽 소스 변경

현재:
```typescript
// prefix + walletId 동적 조합
const topic = `${ntfyRequestTopicPrefix}-${walletId}`;
```

변경:
```typescript
// wallet_apps 테이블에서 직접 조회
const walletApp = db.select().from(walletApps).where(eq(walletApps.walletType, walletType));
const topic = walletApp.signTopic ?? `${fallbackPrefix}-${walletApp.appName}`;
```

### 3. WalletNotificationChannel 토픽 소스 변경

현재:
```typescript
// prefix + appName 동적 조합
const topic = `${notifyTopicPrefix}-${appName}`;
```

변경:
```typescript
// wallet_apps 테이블에서 직접 조회
const topic = walletApp.notifyTopic ?? `${fallbackPrefix}-${appName}`;
```

### 4. NotificationService 글로벌 NtfyChannel 제거

- `notifications.ntfy_topic` Admin Setting 제거
- NotificationService에서 글로벌 NtfyChannel 인스턴스 제거 (Path B에서 제외)
- 시스템 이벤트(UPDATE_AVAILABLE 등)는 WalletNotificationChannel(Path A)을 통해 모든 활성 지갑 앱 토픽에 발송 — 기존 동작과 동일

**영향 범위:**

| 채널 | 변경 후 |
|------|--------|
| Telegram | 변화 없음 — Path B에서 계속 발송 |
| Discord | 변화 없음 |
| Slack | 변화 없음 |
| WalletNotificationChannel (per-wallet ntfy) | 변화 없음 — Path A로 독립 실행 |
| **글로벌 NtfyChannel** | **제거됨** — Push Relay 미구독 토픽이므로 실질적 손실 없음 |

### 5. Admin UI 변경

#### Notifications 페이지
- 글로벌 "Ntfy" 채널 카드 제거
- ntfy 알림 상태는 Wallets → Human Wallet Apps 페이지에서 확인하도록 안내

#### Wallets → Human Wallet Apps 페이지
- 각 지갑 앱 카드/행에 `sign_topic`, `notify_topic` 필드 표시
- 기본값이 미리 채워져 있고, 편집 가능
- 토픽 값이 존재하면 연결 상태 표시

### 6. Admin Settings 정리

삭제:
- `notifications.ntfy_topic` (글로벌 단일 토픽)

유지:
- `notifications.ntfy_server` (ntfy 서버 URL — 글로벌 공유)
- `signing_sdk.ntfy_request_topic_prefix` (신규 지갑 앱 등록 시 기본값 생성용 폴백)
- `signing_sdk.ntfy_response_topic_prefix` (응답 토픽은 per-request UUID 기반이므로 현행 유지)

### 7. Wallet App 등록/수정 API 변경

`POST /v1/admin/wallet-apps` 요청 스키마에 optional 토픽 필드 추가:
```typescript
{
  appName: 'dcent',
  walletType: 'dcent',
  signingEnabled: true,
  alertsEnabled: true,
  signTopic: 'waiaas-sign-dcent',    // optional — 생략 시 prefix+appName 자동 생성
  notifyTopic: 'waiaas-notify-dcent', // optional — 생략 시 prefix+appName 자동 생성
}
```

`PUT /v1/admin/wallet-apps/{id}`에서도 토픽 수정 가능.

---

## 기술 결정 사항

| # | 결정 항목 | 선택지 | 결정 근거 |
|---|----------|--------|----------|
| 1 | 토픽 저장 위치 | `wallet_apps` 테이블 컬럼 | prefix 기반 동적 조합 대신 명시적 값 저장. 사용자가 Admin UI에서 확인/수정 가능 |
| 2 | 기본값 생성 | prefix + appName 조합 | 기존 호환성 유지. `waiaas-sign-dcent`, `waiaas-notify-dcent` 형태 |
| 3 | 글로벌 NtfyChannel | 제거 | Push Relay 미구독 토픽에 발송하는 것은 무의미. Telegram/Discord/Slack + WalletNotificationChannel에 영향 없음 (Path A/B 독립) |
| 4 | 시스템 이벤트 발송 | 기존 Path A 유지 | WalletNotificationChannel이 이미 모든 활성 지갑 앱에 브로드캐스트. UPDATE_AVAILABLE 등 지갑 무관 이벤트도 정상 도달 |
| 5 | prefix 설정 유지 여부 | 폴백용으로 유지 | 신규 지갑 앱 등록 시 기본 토픽명 생성에 사용. 삭제하면 하드코딩 필요 |
| 6 | 마이그레이션 전략 | 기존 행에 prefix 기반 기본값 채움 | 기존 환경에서 토픽 변경 없이 동작 유지. NULL이면 폴백 로직으로 호환 |
| 7 | NULL 토픽 처리 | prefix 폴백 | `walletApp.signTopic ?? ${prefix}-${appName}` — DB에 값이 없으면 기존 동작과 동일 |

---

## E2E 검증 시나리오

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | 지갑 앱 등록 시 토픽 기본값 | `POST /v1/admin/wallet-apps { appName: 'test' }` → signTopic=`waiaas-sign-test`, notifyTopic=`waiaas-notify-test` assert | [L0] |
| 2 | 지갑 앱 등록 시 커스텀 토픽 | `POST /v1/admin/wallet-apps { signTopic: 'custom-sign' }` → 커스텀 값 저장 assert | [L0] |
| 3 | 토픽 수정 | `PUT /v1/admin/wallet-apps/{id} { signTopic: 'new-topic' }` → 변경 반영 assert | [L0] |
| 4 | 서명 요청이 wallet_apps.signTopic으로 발송 | APPROVAL 트랜잭션 → ntfy POST 호출의 토픽이 wallet_apps.signTopic 값과 일치 assert | [L0] |
| 5 | 일반 알림이 wallet_apps.notifyTopic으로 발송 | TX_CONFIRMED 이벤트 → ntfy POST 호출의 토픽이 wallet_apps.notifyTopic 값과 일치 assert | [L0] |
| 6 | Telegram/Discord/Slack 영향 없음 | 글로벌 NtfyChannel 제거 후 Telegram 알림 정상 발송 assert | [L0] |
| 7 | 시스템 이벤트 브로드캐스트 | UPDATE_AVAILABLE → Path A로 모든 활성 지갑 앱의 notifyTopic에 발송 assert | [L0] |
| 8 | 글로벌 ntfy_topic 설정 제거 | `GET /v1/admin/settings` → `notifications.ntfy_topic` 키 없음 assert | [L0] |
| 9 | Admin UI 지갑 앱 토픽 표시 | Human Wallet Apps 페이지 → signTopic/notifyTopic 필드 표시 assert | [L0] |
| 10 | Admin UI 토픽 편집 | 토픽 수정 → 저장 → 변경된 토픽으로 알림 발송 확인 | [L0] |
| 11 | 마이그레이션 — 기존 행 기본값 | 업그레이드 후 기존 wallet_apps 행에 토픽 기본값 채워짐 assert | [L0] |
| 12 | Notifications 채널 상태 | Admin UI Notifications → 글로벌 Ntfy 카드 제거 확인 | [L0] |
| 13 | Push Relay 연동 | 데몬 → wallet_apps 토픽 → ntfy → Push Relay 수신 확인 | [L0] |
| 14 | NULL 토픽 폴백 | wallet_apps.signTopic=NULL → prefix 기반 폴백 토픽으로 발송 assert | [L0] |

---

## 의존

| 의존 대상 | 이유 |
|----------|------|
| #222 | ntfy SSE gzip 파싱 버그 수정 — Push Relay 수신이 전제 조건 |

---

## 리스크

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| 1 | 글로벌 NtfyChannel 제거 시 기존 사용자 | `notifications.ntfy_topic`으로 모니터링하던 사용자의 알림 중단 | Telegram/Discord/Slack은 유지됨. ntfy 모니터링이 필요하면 지갑 앱 등록 후 notifyTopic으로 대체 |
| 2 | DB 마이그레이션 | wallet_apps 스키마 변경 | ALTER TABLE ADD COLUMN — 기존 데이터 유지, NULL 허용 + 폴백 로직으로 안전 |
| 3 | prefix 설정과 저장된 토픽 불일치 | prefix 변경 시 기존 저장된 토픽과 괴리 | 저장된 토픽이 우선. prefix는 신규 생성 시에만 사용 |

---

## 수정 대상 파일

| 패키지 | 파일 | 변경 내용 |
|--------|------|----------|
| daemon | `infrastructure/database/schema.ts` | `wallet_apps` 테이블에 `sign_topic`, `notify_topic` 컬럼 추가 |
| daemon | `infrastructure/database/migrations/` | ALTER TABLE 마이그레이션 + 기존 행 기본값 채움 |
| daemon | `services/signing-sdk/channels/ntfy-signing-channel.ts` | 토픽 소스를 wallet_apps 테이블로 변경 |
| daemon | `services/signing-sdk/channels/wallet-notification-channel.ts` | 토픽 소스를 wallet_apps 테이블로 변경 |
| daemon | `lifecycle/daemon.ts` | NotificationService 글로벌 NtfyChannel 초기화 제거 |
| daemon | `infrastructure/settings/setting-keys.ts` | `notifications.ntfy_topic` 키 삭제 |
| daemon | `api/routes/admin.ts` | wallet-apps CRUD에 토픽 필드 추가, notifications status에서 글로벌 Ntfy 제거 |
| core | `schemas/wallet-app.schema.ts` | WalletApp 스키마에 signTopic/notifyTopic 추가 |
| admin | `pages/notifications.tsx` | 글로벌 Ntfy 채널 카드 제거 |
| admin | `pages/wallets.tsx` (Human Wallet Apps) | 토픽 필드 표시/편집 UI 추가 |
| skills | `admin.skill.md` | wallet-apps API 변경 반영 |

---

## 예상 규모

| 항목 | 예상 |
|------|------|
| 페이즈 | 2개 (DB+채널 로직 1 / Admin UI+테스트 1) |
| 신규/수정 파일 | 12-15개 |
| 테스트 | 14-18개 |
| DB 마이그레이션 | 필요 (wallet_apps ALTER TABLE) |

---

*생성일: 2026-03-02*
*관련: #222 Push Relay ntfy SSE gzip 파싱 버그, v29.7 D'CENT 직접 서명, v26.3 Push Relay Server*
