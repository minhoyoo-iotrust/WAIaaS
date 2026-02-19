# 75. 알림 채널 + Push Relay Server

## 목차

1. [개요](#1-개요)
2. [서명/알림 토픽 분리 구조](#2-서명알림-토픽-분리-구조)
3. [NotificationMessage 스키마](#3-notificationmessage-스키마)
4. [SDK 알림 API](#4-sdk-알림-api)
5. [WalletNotificationChannel + NotificationService 통합](#5-walletnotificationchannel--notificationservice-통합)
6. Push Relay Server 개요 (placeholder -- Plan 200-02)
7. IPushProvider + PushPayload/PushResult (placeholder -- Plan 200-02)
8. PushwooshProvider + FcmProvider (placeholder -- Plan 200-02)
9. ntfy SSE Subscriber + 메시지 변환 (placeholder -- Plan 200-02)
10. Device Token Registry + config + Docker 배포 (placeholder -- Plan 200-02)

---

## 1. 개요

### 1.1 문서 목적

이 문서는 m26-02(지갑 앱 알림 채널)와 m26-03(Push Relay Server) 구현의 입력 사양을 제공한다. 지갑 앱이 서명 요청뿐 아니라 모든 종류의 알림(트랜잭션 완료, 정책 위반, 세션 이벤트, 보안 알림, 시스템 상태)을 수신할 수 있도록 하는 설계를 확정한다.

### 1.2 적용 범위

| 범위 | 내용 | 대상 마일스톤 |
|------|------|-------------|
| 알림 토픽 분리 구조 | 서명/알림 토픽 네이밍 + ntfy priority 차등 | m26-02 |
| NotificationMessage 스키마 | Zod 스키마 + 6개 카테고리 + metadata 규격 | m26-02 |
| SDK 알림 API | subscribeToNotifications() + parseNotification() | m26-02 |
| WalletNotificationChannel | INotificationChannel 구현 + NotificationService 확장 | m26-02 |
| Push Relay Server | IPushProvider + Pushwoosh/FCM + Device Registry | m26-03 |

### 1.3 doc 73/74와의 관계

| 참조 대상 | 원본 문서 | 본 문서 사용 위치 |
|-----------|----------|-----------------|
| ntfy 토픽 네이밍 규칙 (sign/response) | doc 73 Section 7.1 | Section 2 — 알림 토픽을 동일 패턴으로 추가 |
| ntfy publish 포맷 (JSON body + Priority + Tags) | doc 73 Section 7.2 | Section 2 — 알림 publish 시 동일 패턴 적용 |
| NtfySigningChannel 구현 | doc 74 Section 7.2 | Section 5 — 동일 ntfy 서버 공유, 토픽 접두어 분리 |
| SDK 공개 API 목록 (6개) | doc 74 Section 2 | Section 4 — subscribeToNotifications + parseNotification 2개 추가 (총 8개) |
| SettingsService signing_sdk 키 | doc 74 Section 9 | Section 5 — 알림 관련 키 3개 추가 |
| INotificationChannel 인터페이스 | core/interfaces/INotificationChannel.ts | Section 5 — WalletNotificationChannel 구현 기반 |

### 1.4 문서 구조 미리보기

**Sections 1-5** (Plan 200-01): 알림 채널 설계 (m26-02 입력 사양)
- Section 1: 개요 (본 섹션)
- Section 2: 서명/알림 토픽 분리 구조 (NOTIF-01)
- Section 3: NotificationMessage 스키마 (NOTIF-02 스키마 부분)
- Section 4: SDK 알림 API (NOTIF-02 SDK 부분)
- Section 5: WalletNotificationChannel + NotificationService 통합 (NOTIF-03)

**Sections 6-10** (Plan 200-02): Push Relay Server 설계 (m26-03 입력 사양)
- Section 6: Push Relay Server 개요
- Section 7: IPushProvider + PushPayload/PushResult
- Section 8: PushwooshProvider + FcmProvider
- Section 9: ntfy SSE Subscriber + 메시지 변환
- Section 10: Device Token Registry + config + Docker 배포

---

## 2. 서명/알림 토픽 분리 구조

### 2.1 토픽 네이밍 규칙

WAIaaS는 ntfy 토픽을 3가지 용도로 사용한다. 기존 서명 프로토콜(doc 73 Section 7)의 2가지 토픽에 알림 토픽 1가지를 추가한다.

| 토픽 | 패턴 | 용도 | 생명주기 | 원본 |
|------|------|------|---------|------|
| 서명 요청 | `waiaas-sign-{walletId}` | 데몬 → 지갑 앱: 서명 요청 전달 | 지갑 존재 기간 (장기) | doc 73 Section 7.1 (기존) |
| 서명 응답 | `waiaas-response-{requestId}` | 지갑 앱 → 데몬: 서명 응답 반환 | 요청별 1회용 (단기) | doc 73 Section 7.1 (기존) |
| **일반 알림** | **`waiaas-notify-{walletId}`** | **데몬 → 지갑 앱: 알림 전달** | **지갑 존재 기간 (장기)** | **m26-02 (신규)** |

- **walletId**: 지갑 UUID v7 (122비트 엔트로피). 예: `01935a3b-7c8d-7e00-b123-456789abcdef`
- 서명 토픽과 알림 토픽은 **동일 ntfy 서버**를 공유한다 (doc 74 Section 9.3 결정)
- 토픽 접두어 변경: SettingsService `signing_sdk.notify_topic_prefix` (기본: `"waiaas-notify"`)

### 2.2 ntfy priority 차등 정책

서명 요청은 즉시 응답이 필요한 긴급 알림이고, 일반 알림은 정보성이다. ntfy의 priority 시스템을 활용하여 차등을 적용한다.

| priority | 수준 | 대상 | 설명 |
|----------|------|------|------|
| **5** (urgent) | 즉시 알림 | 서명 요청, 보안 알림 (Kill Switch, 비정상 활동) | 진동 + 소리 + 화면 깨움 |
| **4** (high) | 높은 알림 | 정책 위반 차단 | 진동 + 소리 |
| **3** (default) | 기본 알림 | 트랜잭션 완료/대기, 세션 이벤트, 시스템 상태 | 기본 알림 |

### 2.3 카테고리별 priority 매핑 표

NotificationMessage의 6개 카테고리(Section 3 참조)에 대한 ntfy priority 매핑:

| 카테고리 | priority | 수준 | 근거 |
|----------|----------|------|------|
| `security_alert` | **5** (urgent) | 즉시 | Kill Switch 발동, 비정상 활동 감지는 즉각 인지 필요 |
| `policy_violation` | **4** (high) | 높음 | 정책 위반으로 트랜잭션 차단됨을 Owner에게 신속 통보 |
| `transaction_completed` | **3** (default) | 기본 | 트랜잭션 완료(성공/실패) 정보성 알림 |
| `transaction_pending` | **3** (default) | 기본 | 트랜잭션 대기 상태 (승인 대기, 시간 지연) 정보성 알림 |
| `session_event` | **3** (default) | 기본 | 세션 생성/만료/갱신 정보성 알림 |
| `system` | **3** (default) | 기본 | 데몬 시작/중지/업데이트 정보성 알림 |

> **참고**: 서명 요청(`waiaas-sign-{walletId}` 토픽)은 항상 priority 5로 전송된다 (doc 73 Section 7.2). 위 표는 **알림 토픽**(`waiaas-notify-{walletId}`)에만 적용된다.

### 2.4 ntfy publish 포맷

알림 publish 시 doc 73 Section 7.2의 서명 요청 publish 패턴과 동일한 JSON body 형식을 따른다:

```http
POST https://{ntfy_server}/{notify_topic_prefix}-{walletId}
Content-Type: application/json
```

**Body (JSON):**

```json
{
  "topic": "waiaas-notify-{walletId}",
  "message": "{NotificationMessage JSON}",
  "title": "{notification.title}",
  "priority": 3,
  "tags": ["waiaas", "notify", "{category}"]
}
```

| 필드 | 값 | 설명 |
|------|-----|------|
| `topic` | `waiaas-notify-{walletId}` | 지갑별 알림 토픽 |
| `message` | NotificationMessage JSON 문자열 | 지갑 앱이 파싱하여 UI에 표시 |
| `title` | `notification.title` | ntfy 네이티브 푸시 알림의 제목 |
| `priority` | 3-5 (카테고리별) | Section 2.3 매핑 참조 |
| `tags` | `["waiaas", "notify", "{category}"]` | ntfy 태그 필터링용 |

### 2.5 self-hosted ntfy 재사용

알림 채널은 기존 서명 채널과 동일한 ntfy 서버를 공유한다 (doc 74 Section 9.3 결정):

- **ntfy 서버 URL**: 기존 `notifications.ntfy_server` SettingsService 키 재사용
- **토픽 분리**: 접두어(`waiaas-sign-*`, `waiaas-response-*`, `waiaas-notify-*`)로 구분
- **추가 서버 URL 설정 불필요**: 서명/알림이 동일 ntfy 서버를 사용하므로 설정 중복 방지

### 2.6 토픽 접두어 설정

| SettingsService 키 | 기본값 | 용도 | 원본 |
|----|--------|------|------|
| `signing_sdk.ntfy_request_topic_prefix` | `"waiaas-sign"` | 서명 요청 토픽 | doc 74 Section 9.1 (기존) |
| `signing_sdk.ntfy_response_topic_prefix` | `"waiaas-response"` | 서명 응답 토픽 | doc 74 Section 9.1 (기존) |
| `signing_sdk.notify_topic_prefix` | `"waiaas-notify"` | **일반 알림 토픽** | **m26-02 (신규)** |

---

## 3. NotificationMessage 스키마

### 3.1 Zod 스키마 정의

NotificationMessage는 `@waiaas/wallet-sdk`의 `schemas.ts`에 정의되며, 기존 SignRequest/SignResponse와 동일한 Zod SSoT 패턴을 따른다.

```typescript
import { z } from 'zod';

const NotificationCategoryEnum = z.enum([
  'transaction_completed',    // 트랜잭션 완료 (CONFIRMED/FAILED)
  'transaction_pending',      // 트랜잭션 대기 중 (PENDING_APPROVAL/DELAYED)
  'policy_violation',         // 정책 위반으로 차단
  'session_event',            // 세션 생성/만료/갱신
  'security_alert',           // Kill Switch, 비정상 활동 감지
  'system',                   // 데몬 상태, 업데이트 등
]);

const NotificationMessageSchema = z.object({
  /** 프로토콜 버전 (향후 호환성 분기에 사용) */
  version: z.literal('1'),

  /** 메시지 타입 -- SignRequest(type 없음/URL 기반 감지)와 구분 */
  type: z.literal('notification'),

  /** 알림 고유 ID (UUID v7) */
  notificationId: z.string().uuid(),

  /** 알림 카테고리 (6종) */
  category: NotificationCategoryEnum,

  /** 짧은 제목 -- 푸시 알림 헤더에 표시 */
  title: z.string(),

  /** 상세 내용 -- 푸시 알림 본문에 표시 */
  body: z.string(),

  /** 카테고리별 추가 정보 (Section 3.3 참조) */
  metadata: z.record(z.string()).optional(),

  /** 대상 지갑 ID (UUID v7) */
  walletId: z.string().uuid(),

  /** 알림 생성 시각 (ISO 8601 UTC) */
  timestamp: z.string().datetime(),
});

type NotificationMessage = z.infer<typeof NotificationMessageSchema>;
type NotificationCategory = z.infer<typeof NotificationCategoryEnum>;
```

### 3.2 필드 상세

| 필드 | 타입 | 필수 | 설명 | 제약 조건 |
|------|------|------|------|-----------|
| `version` | `z.literal('1')` | O | 프로토콜 버전 | 현재 `'1'`만 허용 |
| `type` | `z.literal('notification')` | O | 메시지 타입 식별자 | `'notification'` 고정. SignRequest와 구분 |
| `notificationId` | `z.string().uuid()` | O | 알림 고유 ID | UUID v7. 중복 수신 감지 + 로그 추적용 |
| `category` | `NotificationCategoryEnum` | O | 알림 카테고리 | 6개 enum 중 하나 |
| `title` | `z.string()` | O | 짧은 제목 | 푸시 알림 헤더. 예: "Transaction Confirmed" |
| `body` | `z.string()` | O | 상세 내용 | 푸시 알림 본문. 예: "1.5 ETH to 0x5678...abcd confirmed (tx: abc123)" |
| `metadata` | `z.record(z.string()).optional()` | X | 카테고리별 추가 정보 | string-to-string 레코드. Section 3.3 참조 |
| `walletId` | `z.string().uuid()` | O | 대상 지갑 ID | UUID v7. 지갑 앱이 구독 중인 지갑 식별 |
| `timestamp` | `z.string().datetime()` | O | 알림 생성 시각 | ISO 8601 UTC. 예: `"2026-02-20T14:30:00Z"` |

### 3.3 카테고리별 metadata 규격

각 카테고리는 metadata 필드에 해당 카테고리에 특화된 정보를 포함한다. metadata의 모든 값은 `string` 타입이다 (Zod: `z.record(z.string())`).

#### transaction_completed

트랜잭션이 최종 상태(CONFIRMED 또는 FAILED)에 도달했을 때 발행된다.

| metadata 키 | 설명 | 예시 |
|-------------|------|------|
| `txId` | WAIaaS 내부 트랜잭션 ID (UUID v7) | `"01935a3b-7c8d-7e00-b123-456789abcdef"` |
| `txHash` | 온체인 트랜잭션 해시 | `"0xabc123..."` 또는 `"5vGz..."` |
| `status` | 최종 상태 | `"CONFIRMED"` 또는 `"FAILED"` |
| `from` | 송신 주소 | `"0x1234..."` |
| `to` | 수신 주소 | `"0x5678..."` |
| `amount` | 전송 금액 (선택) | `"1.5"` |
| `symbol` | 토큰 심볼 (선택) | `"ETH"` |

#### transaction_pending

트랜잭션이 대기 상태(PENDING_APPROVAL, DELAYED)일 때 발행된다.

| metadata 키 | 설명 | 예시 |
|-------------|------|------|
| `txId` | WAIaaS 내부 트랜잭션 ID | `"01935a3b-7c8d-7e00-b123-456789abcdef"` |
| `status` | 대기 상태 | `"PENDING_APPROVAL"` 또는 `"DELAYED"` |
| `reason` | 대기 사유 | `"Exceeds daily limit"` |

#### policy_violation

정책 위반으로 트랜잭션이 차단되었을 때 발행된다.

| metadata 키 | 설명 | 예시 |
|-------------|------|------|
| `txId` | WAIaaS 내부 트랜잭션 ID | `"01935a3b-7c8d-7e00-b123-456789abcdef"` |
| `policyType` | 위반된 정책 타입 | `"DAILY_TX_LIMIT"` |
| `violatedRule` | 위반 규칙 상세 | `"Daily limit 10 SOL exceeded (requested 15 SOL)"` |

#### session_event

세션 생성/만료/갱신 시 발행된다.

| metadata 키 | 설명 | 예시 |
|-------------|------|------|
| `sessionId` | 세션 ID (UUID v7) | `"01935a3b-aaaa-7e00-b123-456789abcdef"` |
| `event` | 이벤트 종류 | `"created"`, `"expired"`, `"renewed"` |
| `walletName` | 세션이 속한 지갑 이름 | `"my-trading-wallet"` |

#### security_alert

보안 경고(Kill Switch, 비정상 활동 등) 시 발행된다.

| metadata 키 | 설명 | 예시 |
|-------------|------|------|
| `alertType` | 보안 경고 종류 | `"kill_switch"`, `"anomaly"` |
| `severity` | 심각도 | `"critical"`, `"high"`, `"medium"` |
| `description` | 경고 상세 설명 | `"Kill Switch activated: all transactions suspended"` |

#### system

데몬 시스템 이벤트(시작/중지/업데이트 등) 시 발행된다.

| metadata 키 | 설명 | 예시 |
|-------------|------|------|
| `eventType` | 시스템 이벤트 종류 | `"daemon_start"`, `"daemon_stop"`, `"update_available"` |
| `version` | 버전 정보 (선택) | `"2.6.0"` |

### 3.4 ntfy publish 시 인코딩

NotificationMessage는 ntfy 메시지의 `message` 필드에 JSON 문자열로 직접 포함된다.

| 조건 | 인코딩 방식 | 설명 |
|------|------------|------|
| JSON 크기 2KB 이내 | JSON 직접 포함 | `"message": JSON.stringify(NotificationMessage)` |
| JSON 크기 2KB 초과 | ntfy `attach` 필드 사용 | 극히 드문 경우. `message`에 요약, `attach`에 전체 JSON |

> **일반적인 NotificationMessage 크기**: 300-600바이트. 2KB를 초과하는 경우는 사실상 없다.

### 3.5 NotificationMessage와 SignRequest 구분

지갑 앱이 ntfy SSE로 메시지를 수신할 때, 서명 요청과 일반 알림을 구분해야 한다:

| 구분 기준 | SignRequest | NotificationMessage |
|-----------|------------|---------------------|
| **토픽** | `waiaas-sign-{walletId}` | `waiaas-notify-{walletId}` |
| **type 필드** | 없음 (URL 기반 감지) | `"notification"` |
| **파싱 함수** | SDK `parseSignRequest(url)` | SDK `parseNotification(data)` |
| **수신 방식** | 유니버셜 링크 또는 ntfy 토픽 | ntfy 알림 토픽 SSE |

지갑 앱은 서명 토픽과 알림 토픽을 별도로 구독하므로 토픽 수준에서 자연스럽게 구분된다. SDK의 `subscribeToNotifications()`는 알림 토픽만 구독한다.

---
