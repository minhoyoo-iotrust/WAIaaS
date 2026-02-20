# 마일스톤 m26-02: 지갑 앱 알림 채널

- **Status:** SHIPPED
- **Milestone:** v2.7
- **Package:** 2.4.0-rc.3
- **Completed:** 2026-02-20

## 목표

D'CENT 등 WAIaaS SDK 통합 지갑 앱에서 **모든 알림을 수신**할 수 있는 상태. Telegram 없이 지갑 앱 하나로 알림 수신 + 승인/거부까지 완결되는 UX를 제공한다.

---

## 배경

### m26-01 이후 남은 갭

m26-01에서 D'CENT 지갑은 **승인 요청(SignRequest)**만 수신할 수 있다. 트랜잭션 완료, 정책 위반, 세션 이벤트 등 일반 알림은 여전히 기존 알림 시스템(Telegram/Slack/ntfy 등)을 통해 별도로 수신해야 한다.

| 기능 | m26-01 | m26-02 |
|------|--------|--------|
| 승인/거부 요청 수신 | 지갑 앱 (ntfy) | 지갑 앱 (ntfy) |
| 일반 알림 수신 | Telegram/Slack 등 별도 채널 | **지갑 앱 (ntfy)** |
| Telegram 없이 운영 가능 | 승인만 가능 | **모든 기능 가능** |

### 목표 UX

```
D'CENT 지갑 앱 하나로:
  ✓ 트랜잭션 승인/거부 (m26-01)
  ✓ 트랜잭션 완료 알림
  ✓ 정책 위반 알림
  ✓ 세션 생성/만료 알림
  ✓ Kill Switch 발동 알림
  ✓ 시스템 상태 알림
```

---

## 구현 대상

### 알림 메시지 프로토콜

`@waiaas/core`에 `NotificationMessageSchema`를 추가한다 (Zod SSoT 원칙: 기존 `SignRequestSchema`/`SignResponseSchema`가 `packages/core/src/schemas/signing-protocol.ts`에 위치한 패턴을 따름). `@waiaas/wallet-sdk`에서 re-export:

```typescript
const NotificationMessageSchema = z.object({
  version: z.literal('1'),
  type: z.literal('notification'),
  notificationId: z.string().uuid(),
  category: z.enum([
    'transaction_completed',    // 트랜잭션 완료 (CONFIRMED/FAILED/CANCELLED)
    'transaction_pending',      // 트랜잭션 대기 중 (REQUESTED/QUEUED/SUBMITTED/APPROVAL_REQUIRED/DELAYED/APPROVAL_EXPIRED)
    'policy_violation',         // 정책 위반으로 차단 (POLICY_VIOLATION/CUMULATIVE_LIMIT_WARNING)
    'session_event',            // 세션 생성/만료/갱신 (SESSION_CREATED/SESSION_EXPIRING_SOON/SESSION_EXPIRED)
    'security_alert',           // Kill Switch, 비정상 활동 감지 (KILL_SWITCH_*/AUTO_STOP/WALLET_SUSPENDED)
    'system',                   // 데몬 상태, 업데이트, Owner 이벤트 등
  ]),
  title: z.string(),            // 짧은 제목 (푸시 알림 헤더)
  body: z.string(),             // 상세 내용
  metadata: z.record(z.string()).optional(),  // 카테고리별 추가 정보
  walletId: z.string().uuid(),
  timestamp: z.string().datetime(),
});
```

### NotificationEventType → category 매핑 (전수)

26개 `NotificationEventType` 전체를 6개 카테고리에 매핑한다:

| category | NotificationEventType |
|----------|----------------------|
| `transaction_completed` | TX_CONFIRMED, TX_FAILED, TX_CANCELLED |
| `transaction_pending` | TX_REQUESTED, TX_QUEUED, TX_SUBMITTED, TX_DOWNGRADED_DELAY, TX_APPROVAL_REQUIRED, TX_APPROVAL_EXPIRED |
| `policy_violation` | POLICY_VIOLATION, CUMULATIVE_LIMIT_WARNING |
| `session_event` | SESSION_CREATED, SESSION_EXPIRING_SOON, SESSION_EXPIRED |
| `security_alert` | KILL_SWITCH_ACTIVATED, KILL_SWITCH_RECOVERED, KILL_SWITCH_ESCALATED, AUTO_STOP_TRIGGERED, WALLET_SUSPENDED |
| `system` | OWNER_SET, OWNER_REMOVED, OWNER_VERIFIED, DAILY_SUMMARY, LOW_BALANCE, APPROVAL_CHANNEL_SWITCHED, UPDATE_AVAILABLE |

> **설계 근거**: `CUMULATIVE_LIMIT_WARNING`은 지출 한도 80% 도달 경고이므로 `policy_violation`에 포함. `LOW_BALANCE`는 잔액 부족 사전 알림이므로 정보성 `system`에 분류. Owner 이벤트(SET/REMOVED/VERIFIED)는 소유권 변경 알림이므로 `system`에 포함.

### ntfy 토픽 구조

```
{ntfy_request_topic_prefix}-{walletName}   → 서명 요청 (m26-01, 기존)
{ntfy_notify_topic_prefix}-{walletName}    → 일반 알림 (m26-02, 신규)
```

> **주의**: 서명 채널에서 사용하는 토픽 식별자는 wallet UUID가 아닌 `signing_sdk.wallets` JSON에 등록된 **walletName**이다. 알림 토픽도 동일한 `{walletName}` 패턴을 사용하여 일관성을 유지한다. 예: `waiaas-notify-dcent` (walletName이 "dcent"인 경우).

두 토픽을 분리하여 지갑 앱이 선택적으로 구독할 수 있도록 한다. 서명 요청은 높은 우선순위(ntfy priority 5), 일반 알림은 보통 우선순위(ntfy priority 3)로 전송. 단, `security_alert` 카테고리는 긴급 알림이므로 ntfy priority 5로 전송.

### 데몬 알림 시스템 확장 — 사이드 채널 아키텍처

기존 `NotificationService`의 알림 발행 흐름은 두 가지 모드로 동작한다:

1. **broadcast**: `BROADCAST_EVENTS`(KILL_SWITCH_ACTIVATED, KILL_SWITCH_RECOVERED, AUTO_STOP_TRIGGERED) → 모든 채널에 동시 전송
2. **sendWithFallback**: 그 외 이벤트 → 채널을 우선순위 순서로 시도, **첫 번째 성공 시 중단**

`WalletNotificationChannel`을 기존 `INotificationChannel` 배열에 추가하면, fallback 모드에서 지갑 채널이 성공할 경우 Telegram/Slack이 스킵되거나, 반대로 Telegram이 먼저 성공하면 지갑 채널이 스킵되는 문제가 발생한다.

**해결: 사이드 채널 패턴**

`WalletNotificationChannel`은 기존 `this.channels[]` 배열과 **별도로** 동작하는 사이드 채널로 구현한다:

```
알림 이벤트 발생
  → NotificationService.notify(eventType, walletId, vars)
    → [1] 기존 채널 (sendWithFallback 또는 broadcast)  ← 변경 없음
    → [2] WalletNotificationChannel (사이드 채널, 항상 병행)
      → signing_sdk.enabled === true 확인 (상위 토글)
      → signing_sdk.notifications_enabled === true 확인
      → 대상 지갑 결정:
        A) walletId가 실제 UUID → 해당 지갑의 owner_approval_method === 'sdk_ntfy' 확인 → 해당 토픽에 전송
        B) walletId가 'system' → owner_approval_method === 'sdk_ntfy'인 모든 지갑 조회 → 각 지갑 토픽에 전송
      → waiaas-notify-{walletName} 토픽에 NotificationMessage publish (base64url 인코딩)
```

> **walletId 라우팅 규칙**: 현재 코드에서 시스템 레벨 이벤트는 walletId로 비-UUID 값을 전달한다 (`KILL_SWITCH_RECOVERED` → `'system'`, `UPDATE_AVAILABLE` → `''` 등). 사이드 채널은 walletId가 유효한 UUID인지 확인하여, UUID이면 해당 지갑만, **UUID가 아닌 모든 값(`'system'`, `''` 등)**이면 `sdk_ntfy` 지갑 전체에 반복 전송한다. 각 메시지의 `NotificationMessage.walletId`에는 실제 지갑 UUID를 설정하여 스키마 `z.string().uuid()` 검증을 유지한다.

구현 방법: `NotificationService.notify()` 메서드에서 기존 디스패치(broadcast/sendWithFallback) **이후** `WalletNotificationChannel.send()`를 별도로 호출한다. 사이드 채널 실패는 기존 채널 결과에 영향을 주지 않는다.

### 컴포넌트

| 컴포넌트 | 위치 | 내용 |
|----------|------|------|
| WalletNotificationChannel | daemon | 사이드 채널. 알림 이벤트 발생 시 `waiaas-notify-{walletName}` 토픽에 `NotificationMessage` publish. ntfy 서버 URL은 `notifications.ntfy_server` 설정 재사용 |
| NotificationMessageSchema | core | `packages/core/src/schemas/signing-protocol.ts`에 Zod 스키마 추가 + TypeScript 타입 export |
| EVENT_CATEGORY_MAP | core | 26개 `NotificationEventType` → 6개 category 매핑 상수 |
| subscribeToNotifications() | wallet-sdk | ntfy 알림 토픽을 SSE로 구독. 새 알림 수신 시 콜백 호출 |
| parseNotification() | wallet-sdk | ntfy 메시지에서 `NotificationMessage` 추출 + Zod 검증 |

### ntfy 메시지 인코딩

기존 서명 요청 패턴과 동일하게 **base64url 인코딩**을 사용한다:

- **데몬 → ntfy**: JSON API `{ topic, message: base64url(JSON.stringify(NotificationMessage)), title, priority, tags }`
- **SDK ← ntfy**: SSE `event.message`를 base64url 디코딩 → JSON 파싱 → `NotificationMessageSchema` Zod 검증

> **설계 근거**: `NtfySigningChannel`이 `SignRequest`를 base64url로 인코딩하여 전송하고, `subscribeToRequests()`가 base64url 디코딩 후 Zod 검증하는 기존 패턴과 일관성을 유지한다.

### Wallet SDK 추가 API

```typescript
// 알림 구독 (지갑 앱 백그라운드)
subscribeToNotifications(
  topic: string,               // ntfy 토픽 (예: 'waiaas-notify-dcent')
  callback: (notification: NotificationMessage) => void,
  serverUrl?: string,          // self-hosted ntfy URL (기본: https://ntfy.sh)
): { unsubscribe: () => void };  // 기존 subscribeToRequests()와 동일한 반환 패턴

// 알림 파싱 (base64url 디코딩 → JSON → Zod 검증)
parseNotification(data: string): NotificationMessage;
```

> **설계 근거**: `subscribeToRequests(topic, callback, serverUrl?)`와 동일한 시그니처 패턴(topic 기반, `{ unsubscribe }` 반환)을 따라 SDK API 일관성을 유지한다.

### Admin Settings (SettingsService)

m26-01에서 등록한 signing_sdk SettingsService 키에 알림 관련 키를 추가한다:

| 키 | 타입 | 기본값 | 설명 |
|----|------|--------|------|
| `signing_sdk.notifications_enabled` | boolean | `true` | 지갑 앱 알림 채널 활성화. **`signing_sdk.enabled`가 false이면 이 설정과 무관하게 알림 미전송** |
| `signing_sdk.ntfy_notify_topic_prefix` | string | `"waiaas-notify"` | 알림 토픽 접두어. 서명 토픽(`ntfy_request_topic_prefix`)과 구분 |
| `signing_sdk.notify_categories` | JSON array | `[]` (전체) | 지갑에 전송할 알림 카테고리 필터 (빈 배열 = 전체 6개 카테고리). Admin UI에서 6개 카테고리 멀티셀렉트 체크박스로 렌더링 |

> **설정 의존 관계**: `signing_sdk.enabled` (false) → `signing_sdk.notifications_enabled` (true). 상위 토글이 비활성이면 하위 설정은 무시된다. WalletNotificationChannel은 발행 전 두 설정을 모두 확인한다.

> **Admin UI 렌더링**: `notify_categories`는 JSON string array이므로, Admin Settings의 기존 text/boolean 입력으로는 표현이 부족하다. 6개 카테고리(`transaction_completed`, `transaction_pending`, `policy_violation`, `session_event`, `security_alert`, `system`)를 **멀티셀렉트 체크박스**로 렌더링하는 커스텀 위젯을 Admin Settings 페이지에 추가한다. 빈 배열(전체 선택)과 부분 선택을 구분하여 표시한다.

> **설계 근거**: config.toml 중첩 금지 정책 준수. 알림 카테고리 필터는 운영 중 변경 가능해야 하므로 SettingsService(Admin UI)가 적합. ntfy 서버 URL은 기존 `notifications.ntfy_server` 설정을 재사용하여 중복 설정을 방지한다.

### 파일/모듈 구조

```
packages/core/src/schemas/
  signing-protocol.ts              # NotificationMessageSchema 추가 (Zod SSoT)

packages/core/src/enums/
  notification.ts                  # EVENT_CATEGORY_MAP 상수 추가

packages/daemon/src/notifications/
  notification-service.ts          # notify() 메서드에 사이드 채널 호출 추가
  channels/
    wallet-notification-channel.ts # 지갑 ntfy 알림 사이드 채널 (신규)

packages/wallet-sdk/src/
  channels/
    ntfy.ts                        # subscribeToNotifications(), parseNotification() 추가
  index.ts                         # 공개 API에 알림 함수 + NotificationMessage 타입 re-export

packages/admin/src/pages/
  Settings.tsx                     # notify_categories 멀티셀렉트 체크박스 위젯 추가

skills/
  *.skill.md                       # SDK 공개 API 변경 반영 (subscribeToNotifications, parseNotification, NotificationMessage)
```

---

## 기술 결정 사항

| # | 결정 항목 | 선택지 | 결정 근거 |
|---|----------|--------|----------|
| 1 | 토픽 분리 | sign 토픽과 notify 토픽 분리 | 서명 요청은 긴급(즉시 응답 필요), 알림은 정보성. ntfy priority 차등 적용. 지갑 앱이 선택적 구독 가능 |
| 2 | 토픽 식별자 | `{walletName}` 사용 (UUID 아님) | 서명 채널(`ntfy_request_topic_prefix-{walletName}`)과 동일한 식별자. `signing_sdk.wallets` JSON의 name 필드 |
| 3 | 알림 대상 | owner_approval_method가 sdk_ntfy인 지갑만 | 기존 알림 채널과 중복 방지. SDK 지갑을 사용하는 Owner만 지갑 알림 수신 |
| 4 | 카테고리 필터링 | SettingsService에서 전송 카테고리 설정 | 모든 알림을 지갑에 보내면 과다 알림. Owner가 중요 카테고리만 선택 |
| 5 | 기존 알림 병행 | 사이드 채널 패턴 (기존 fallback과 독립) | 기존 `sendWithFallback()`는 첫 성공 시 중단하므로, WalletNotificationChannel은 별도 병행 호출. 기존 Telegram/Slack 설정이 있으면 양쪽 모두 수신 |
| 6 | 스키마 위치 | `@waiaas/core` 정의 → wallet-sdk re-export | Zod SSoT 원칙. SignRequest/SignResponse와 동일한 패턴 |
| 7 | ntfy 서버 URL | `notifications.ntfy_server` 설정 재사용 | NtfySigningChannel과 동일한 설정 키. 중복 설정 방지 |
| 8 | SDK 반환 타입 | `{ unsubscribe: () => void }` 객체 | `subscribeToRequests()`와 동일한 패턴으로 API 일관성 유지 |
| 9 | security_alert 우선순위 | ntfy priority 5 (최고) | Kill Switch/AutoStop은 긴급 이벤트. 일반 알림(priority 3)과 차별화 |
| 10 | ntfy 메시지 인코딩 | base64url | `NtfySigningChannel`의 SignRequest 인코딩 패턴과 동일. SDK 측 디코딩 로직 재사용 가능 |
| 11 | system walletId 라우팅 | 비-UUID walletId → sdk_ntfy 전체 지갑 반복 전송 | 시스템 이벤트는 비-UUID walletId를 전달(`'system'`, `''` 등). UUID 검증 실패 시 모두 시스템 이벤트로 간주하여 sdk_ntfy 지갑 전체에 전송. 각 메시지의 walletId는 실제 UUID로 설정 |

---

## E2E 검증 시나리오

**자동화 비율: 100%**

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | 트랜잭션 완료 → 지갑 알림 | TX CONFIRMED + wallet(sdk_ntfy) → waiaas-notify-{walletName} publish assert, category='transaction_completed' | [L0] |
| 2 | 정책 위반 → 지갑 알림 | 정책 차단 + wallet(sdk_ntfy) → category='policy_violation' 알림 assert | [L0] |
| 3 | 세션 만료 → 지갑 알림 | 세션 TTL 만료 + wallet(sdk_ntfy) → category='session_event' 알림 assert | [L0] |
| 4 | Kill Switch → 지갑 알림 | Kill Switch 발동 → category='security_alert' 알림 assert (ntfy priority 5) | [L0] |
| 5 | SDK subscribeToNotifications → 콜백 | mock ntfy SSE → subscribeToNotifications(topic, cb) → 콜백에 NotificationMessage 전달 assert | [L0] |
| 6 | SDK parseNotification → 검증 | parseNotification(valid) → NotificationMessage 정상 파싱 assert | [L0] |
| 7 | 비SDK 지갑 → 알림 미전송 | wallet(walletconnect) → waiaas-notify 토픽 publish 없음 assert | [L0] |
| 8 | 카테고리 필터링 | categories=['security_alert'] 설정 → transaction_completed 미전송 assert | [L0] |
| 9 | 기존 알림 채널 병행 | Telegram + sdk_ntfy 동시 설정 → 사이드 채널 + sendWithFallback 양쪽 모두 수신 assert | [L0] |
| 10 | 알림 비활성화 | notifications_enabled=false → 지갑 알림 미전송 + 기존 채널 정상 assert | [L0] |
| 11 | signing_sdk.enabled=false → 전체 비활성 | signing_sdk.enabled=false + notifications_enabled=true → 지갑 알림 미전송 assert | [L0] |
| 12 | transaction_pending 카테고리 | TX_APPROVAL_REQUIRED + wallet(sdk_ntfy) → category='transaction_pending' 알림 assert | [L0] |
| 13 | security_alert ntfy priority | KILL_SWITCH_ACTIVATED → ntfy priority 5 전송 assert, TX_CONFIRMED → ntfy priority 3 전송 assert | [L0] |
| 14 | 26개 이벤트 전수 매핑 | EVENT_CATEGORY_MAP에 26개 NotificationEventType 전체 매핑 존재 assert (누락 검증) | [L0] |
| 15 | 비-UUID walletId → 전체 sdk_ntfy 지갑 전송 | KILL_SWITCH_ACTIVATED(walletId='system') + UPDATE_AVAILABLE(walletId='') → sdk_ntfy인 모든 지갑 토픽에 전송 assert, 각 메시지의 walletId가 실제 UUID assert | [L0] |
| 16 | notify_categories Admin UI | Settings 페이지에서 6개 카테고리 멀티셀렉트 체크박스 렌더링 assert, 선택 변경 → SettingsService 반영 assert | [L0] |

---

## 의존

| 의존 대상 | 이유 |
|----------|------|
| m26-01 (Wallet Signing SDK) | @waiaas/wallet-sdk 패키지, ntfy 토픽 구조(`{prefix}-{walletName}`), owner_approval_method 인프라, `notifications.ntfy_server` 설정 |
| v1.3.4 (알림 이벤트) | NotificationService 이벤트 발행 인프라 재사용 |

---

## 리스크

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| 1 | 알림 과다 | 지갑 앱에 너무 많은 푸시 알림 → UX 저하 | SettingsService 카테고리 필터링으로 Owner가 수신 범위 제어. 기본값은 전체(빈 배열)이나 Admin UI에서 조정 가능 |
| 2 | ntfy 토픽 증가 | 지갑 수 × 2 토픽 (sign + notify) | ntfy는 토픽 수 제한 없음. self-hosted 시 무제한 |
| 3 | 기존 채널과 중복 알림 | 같은 이벤트가 Telegram + 지갑 양쪽에 도착 | 의도된 동작(사이드 채널). 사용자가 기존 채널을 비활성화하면 지갑만 수신 |
| 4 | 사이드 채널 실패 무시 | WalletNotificationChannel 오류가 기존 채널에 영향 | 사이드 채널 실패는 try/catch로 격리. audit_log에 기록하되 기존 발행 결과를 변경하지 않음 |

---

## 예상 규모

| 항목 | 예상 |
|------|------|
| 페이즈 | 1개 |
| 신규 파일 | 2개 (데몬 사이드 채널 1 + SDK notifications 함수 1) |
| 수정 파일 | 7개 (core signing-protocol.ts, core notification.ts, NotificationService, SDK ntfy.ts, SDK index.ts, SettingsService 키 등록, Admin Settings.tsx notify_categories 위젯) + skill 파일 동기화 |
| 테스트 | 16개 |
| DB 마이그레이션 | 없음 |

---

*생성일: 2026-02-15*
*최종 수정: 2026-02-20 — 사전 검증 7건 보정 (마일스톤 버전 v2.7, system walletId 라우팅 규칙, base64url 인코딩 명시, Admin UI 멀티셀렉트 위젯, skill 파일 동기화, Status PLANNED, 비-UUID walletId 라우팅 일반화)*
*선행: m26-01 (WAIaaS Wallet Signing SDK)*
