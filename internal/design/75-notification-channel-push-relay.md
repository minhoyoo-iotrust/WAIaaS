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

## 4. SDK 알림 API

### 4.1 subscribeToNotifications()

지갑 앱이 알림 토픽(`waiaas-notify-{walletId}`)을 SSE로 구독하여 실시간 알림을 수신한다.

#### 시그니처

```typescript
/**
 * 알림 토픽을 SSE로 구독하여 실시간 알림을 수신한다.
 *
 * - ntfy SSE GET {serverUrl}/{notify_topic_prefix}-{walletId}/sse
 * - JSON 파싱 → NotificationMessageSchema.parse() → callback 호출
 * - SSE 연결 끊김 시 자동 재연결 (EventSource 내장 기능)
 * - 파싱 실패 시 skip + console.warn (연결 유지)
 *
 * @param walletId - 구독할 지갑 ID (UUID v7)
 * @param callback - 검증된 NotificationMessage를 전달받는 콜백 함수
 * @param options - 선택적 설정 (ntfy 서버 URL)
 * @returns unsubscribe 함수 (EventSource.close() 호출)
 */
function subscribeToNotifications(
  walletId: string,
  callback: (notification: NotificationMessage) => void,
  options?: { serverUrl?: string }
): () => void;  // unsubscribe 함수 반환
```

#### 매개변수 상세

| 매개변수 | 타입 | 필수 | 설명 | 기본값 |
|---------|------|------|------|--------|
| `walletId` | `string` | O | 구독 대상 지갑 ID | - |
| `callback` | `(notification: NotificationMessage) => void` | O | 파싱+검증된 NotificationMessage를 전달받는 콜백 | - |
| `options.serverUrl` | `string` | X | self-hosted ntfy 서버 URL | `"https://ntfy.sh"` |

#### 반환값

```typescript
() => void  // unsubscribe 함수
```

- `unsubscribe()`를 호출하면 내부 `EventSource.close()`가 실행되어 SSE 연결이 종료된다
- 지갑 앱이 백그라운드로 전환되거나 알림 구독을 중단할 때 호출

#### 내부 구현 개요

```typescript
function subscribeToNotifications(
  walletId: string,
  callback: (notification: NotificationMessage) => void,
  options?: { serverUrl?: string }
): () => void {
  const serverUrl = options?.serverUrl ?? 'https://ntfy.sh';
  const topicPrefix = 'waiaas-notify';  // SDK 측에서는 기본값 사용
  const sseUrl = `${serverUrl}/${topicPrefix}-${walletId}/sse`;

  const eventSource = new EventSource(sseUrl);

  eventSource.onmessage = (event: MessageEvent) => {
    try {
      const ntfyMessage = JSON.parse(event.data);
      // ntfy JSON 메시지의 message 필드에서 NotificationMessage 추출
      const notification = parseNotification(ntfyMessage.message);
      callback(notification);
    } catch (error) {
      // 파싱 실패 시 skip (연결 유지)
      console.warn('[WAIaaS SDK] Failed to parse notification:', error);
    }
  };

  eventSource.onerror = () => {
    // EventSource는 자동 재연결 내장 (브라우저/런타임 구현)
    console.warn('[WAIaaS SDK] Notification SSE connection error, reconnecting...');
  };

  // unsubscribe 함수 반환
  return () => {
    eventSource.close();
  };
}
```

#### 에러 처리

| 상황 | 동작 | 근거 |
|------|------|------|
| SSE 연결 실패 | `console.warn` + 자동 재연결 (EventSource 내장) | 네트워크 불안정 시에도 복원 가능 |
| JSON 파싱 실패 | `console.warn` + skip (다음 메시지 대기) | 하나의 잘못된 메시지가 전체 구독을 중단시키지 않음 |
| Zod 검증 실패 | `console.warn` + skip | 호환되지 않는 버전의 메시지 무시 |
| 서버 URL 잘못됨 | EventSource 연결 실패 → onerror | 사용자가 serverUrl 확인 필요 |

### 4.2 parseNotification()

ntfy SSE 이벤트의 data 문자열에서 NotificationMessage를 추출하고 Zod 검증을 수행한다.

#### 시그니처

```typescript
/**
 * ntfy SSE 이벤트 데이터에서 NotificationMessage를 추출한다.
 *
 * @param data - ntfy 메시지의 message 필드 (JSON 문자열)
 * @returns 검증된 NotificationMessage 객체
 * @throws NotificationParseError - JSON 파싱 실패 또는 Zod 검증 실패
 */
function parseNotification(data: string): NotificationMessage;
```

#### 매개변수 상세

| 매개변수 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `data` | `string` | O | ntfy 메시지의 message 필드 (NotificationMessage JSON 문자열) |

#### 반환값

```typescript
NotificationMessage  // Zod 검증 완료된 타입
```

#### 내부 구현

```typescript
class NotificationParseError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'NotificationParseError';
  }
}

function parseNotification(data: string): NotificationMessage {
  try {
    const parsed = JSON.parse(data);
    return NotificationMessageSchema.parse(parsed);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new NotificationParseError(
        `Invalid notification format: ${error.errors.map(e => e.message).join(', ')}`,
        error
      );
    }
    throw new NotificationParseError(
      'Failed to parse notification JSON',
      error
    );
  }
}
```

### 4.3 @waiaas/wallet-sdk export 목록 업데이트

기존 6개 함수(doc 74 Section 2)에 알림 관련 2개 함수를 추가하여 총 8개 공개 API를 제공한다:

| # | 함수 | 카테고리 | 원본 |
|---|------|---------|------|
| 1 | `parseSignRequest` | 서명 요청 | doc 74 Section 2.1 |
| 2 | `buildSignResponse` | 서명 응답 | doc 74 Section 2.2 |
| 3 | `formatDisplayMessage` | 표시 메시지 | doc 74 Section 2.3 |
| 4 | `sendViaNtfy` | ntfy 응답 전송 | doc 74 Section 2.4 |
| 5 | `sendViaTelegram` | Telegram 응답 전송 | doc 74 Section 2.5 |
| 6 | `subscribeToRequests` | 서명 요청 구독 | doc 74 Section 2.6 |
| **7** | **`subscribeToNotifications`** | **알림 구독** | **doc 75 Section 4.1 (신규)** |
| **8** | **`parseNotification`** | **알림 파싱** | **doc 75 Section 4.2 (신규)** |

#### packages/wallet-sdk/src/index.ts 업데이트

```typescript
// 서명 프로토콜 (doc 74 Section 2)
export { parseSignRequest } from './sign-request.js';
export { buildSignResponse } from './sign-response.js';
export { formatDisplayMessage } from './display-message.js';
export { sendViaNtfy } from './ntfy.js';
export { sendViaTelegram } from './telegram.js';
export { subscribeToRequests } from './subscribe.js';

// 알림 API (doc 75 Section 4) -- 신규
export { subscribeToNotifications, parseNotification } from './notifications.js';

// 스키마 + 타입
export { SignRequestSchema, SignResponseSchema } from './schemas.js';
export { NotificationMessageSchema, NotificationCategoryEnum } from './schemas.js';
export type { SignRequest, SignResponse } from './schemas.js';
export type { NotificationMessage, NotificationCategory } from './schemas.js';

// 에러 클래스
export { SignRequestExpiredError, SignRequestValidationError, InvalidSignRequestUrlError } from './errors.js';
export { NotificationParseError } from './errors.js';
```

---

## 5. WalletNotificationChannel + NotificationService 통합

### 5.1 WalletNotificationChannel 클래스

기존 INotificationChannel 인터페이스(core/interfaces/INotificationChannel.ts)를 구현하여 지갑 앱 ntfy 채널을 추가한다.

#### 인터페이스 기반

기존 `INotificationChannel` 인터페이스:

```typescript
// packages/core/src/interfaces/INotificationChannel.ts (기존)
interface INotificationChannel {
  initialize(config: Record<string, unknown>): Promise<void>;
  send(payload: NotificationPayload): Promise<void>;
  readonly name: string;
}

interface NotificationPayload {
  eventType: NotificationEventType;
  walletId: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: number;
}
```

#### WalletNotificationChannel 구현

```typescript
// packages/daemon/src/services/notification/channels/wallet-notification-channel.ts (신규)

import type { INotificationChannel, NotificationPayload } from '@waiaas/core';
import type { SettingsService } from '../../../infrastructure/settings/settings-service.js';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { generateId } from '../../../infrastructure/database/id.js';

class WalletNotificationChannel implements INotificationChannel {
  readonly name = 'wallet_ntfy';

  constructor(
    private readonly settingsService: SettingsService,
    private readonly db: BetterSQLite3Database<any>,
  ) {}

  async initialize(config: Record<string, unknown>): Promise<void> {
    // 초기화 시 특별한 설정 불필요
    // SettingsService에서 런타임 설정을 동적으로 읽음
  }

  async send(payload: NotificationPayload): Promise<void> {
    // 5단계 필터링 후 ntfy publish
    // Section 5.3 send() 구현 로직 참조
  }
}
```

### 5.2 타입 식별

| 속성 | 값 | 설명 |
|------|-----|------|
| `name` | `"wallet_ntfy"` | 기존 채널 이름(`telegram`, `discord`, `ntfy`, `slack`)과 구분되는 고유 이름 |
| 대상 토픽 | `waiaas-notify-{walletId}` | 서명 토픽(`waiaas-sign-*`)과 완전 분리 |
| 조건부 전송 | `owner_approval_method === 'sdk_ntfy'` | SDK 지갑만 대상 |

### 5.3 send() 구현 로직

`send()` 메서드는 5단계 필터링을 거쳐 ntfy 알림 토픽에 NotificationMessage를 publish한다:

```typescript
async send(payload: NotificationPayload): Promise<void> {
  // Step 1: 해당 walletId 확인
  const walletId = payload.walletId;
  if (!walletId) return;  // walletId 없는 시스템 이벤트는 skip

  // Step 2: wallet의 owner_approval_method가 'sdk_ntfy'인지 확인
  const wallet = await this.findWallet(walletId);
  if (!wallet || wallet.ownerApprovalMethod !== 'sdk_ntfy') return;

  // Step 3: SettingsService signing_sdk.notifications_enabled 확인
  const enabled = await this.settingsService.get('signing_sdk.notifications_enabled');
  if (enabled === 'false') return;

  // Step 4: SettingsService signing_sdk.notify_categories 필터 확인
  const categoriesJson = await this.settingsService.get('signing_sdk.notify_categories');
  const categories: string[] = categoriesJson ? JSON.parse(categoriesJson) : [];
  const category = this.mapEventToCategory(payload.eventType);
  if (categories.length > 0 && !categories.includes(category)) return;

  // Step 5: NotificationEvent → NotificationMessage 변환 + ntfy publish
  const notificationMessage = this.buildNotificationMessage(payload, category, walletId);
  await this.publishToNtfy(notificationMessage, walletId);
}
```

#### Step 별 상세

| Step | 조건 | 실패 시 동작 | 설명 |
|------|------|-------------|------|
| 1 | `walletId` 존재 | skip (return) | walletId 없는 시스템 전역 이벤트는 대상 외 |
| 2 | `owner_approval_method === 'sdk_ntfy'` | skip (return) | SDK 지갑이 아닌 경우 기존 채널만 사용 |
| 3 | `notifications_enabled === true` | skip (return) | Admin이 알림을 비활성화한 경우 |
| 4 | 카테고리 필터 통과 | skip (return) | 빈 배열 `[]`이면 전체 통과, 배열에 포함된 카테고리만 전송 |
| 5 | 변환 + publish 성공 | 에러 로그 (throw하지 않음) | 기존 채널과 동일한 에러 처리 패턴 |

### 5.4 NotificationEvent → NotificationMessage 변환 매핑

기존 `NotificationEventType` (25개, core/enums/notification.ts)을 NotificationMessage의 6개 카테고리로 매핑한다:

| NotificationEventType | 카테고리 | title 예시 |
|----------------------|---------|-----------|
| `TX_CONFIRMED` | `transaction_completed` | "Transaction Confirmed" |
| `TX_FAILED` | `transaction_completed` | "Transaction Failed" |
| `TX_CANCELLED` | `transaction_completed` | "Transaction Cancelled" |
| `TX_REQUESTED` | `transaction_pending` | "Transaction Requested" |
| `TX_QUEUED` | `transaction_pending` | "Transaction Queued" |
| `TX_SUBMITTED` | `transaction_pending` | "Transaction Submitted" |
| `TX_DOWNGRADED_DELAY` | `transaction_pending` | "Transaction Delayed" |
| `TX_APPROVAL_REQUIRED` | `transaction_pending` | "Approval Required" |
| `TX_APPROVAL_EXPIRED` | `transaction_pending` | "Approval Expired" |
| `POLICY_VIOLATION` | `policy_violation` | "Policy Violation" |
| `WALLET_SUSPENDED` | `security_alert` | "Wallet Suspended" |
| `KILL_SWITCH_ACTIVATED` | `security_alert` | "Kill Switch Activated" |
| `KILL_SWITCH_RECOVERED` | `security_alert` | "Kill Switch Recovered" |
| `KILL_SWITCH_ESCALATED` | `security_alert` | "Kill Switch Escalated" |
| `AUTO_STOP_TRIGGERED` | `security_alert` | "Auto Stop Triggered" |
| `SESSION_EXPIRING_SOON` | `session_event` | "Session Expiring Soon" |
| `SESSION_EXPIRED` | `session_event` | "Session Expired" |
| `SESSION_CREATED` | `session_event` | "Session Created" |
| `OWNER_SET` | `system` | "Owner Registered" |
| `OWNER_REMOVED` | `system` | "Owner Removed" |
| `OWNER_VERIFIED` | `system` | "Owner Verified" |
| `DAILY_SUMMARY` | `system` | "Daily Summary" |
| `CUMULATIVE_LIMIT_WARNING` | `policy_violation` | "Spending Limit Warning" |
| `LOW_BALANCE` | `system` | "Low Balance Alert" |
| `APPROVAL_CHANNEL_SWITCHED` | `system` | "Approval Channel Changed" |

#### 변환 구현 (의사코드)

```typescript
private mapEventToCategory(eventType: NotificationEventType): NotificationCategory {
  switch (eventType) {
    // transaction_completed
    case 'TX_CONFIRMED':
    case 'TX_FAILED':
    case 'TX_CANCELLED':
      return 'transaction_completed';

    // transaction_pending
    case 'TX_REQUESTED':
    case 'TX_QUEUED':
    case 'TX_SUBMITTED':
    case 'TX_DOWNGRADED_DELAY':
    case 'TX_APPROVAL_REQUIRED':
    case 'TX_APPROVAL_EXPIRED':
      return 'transaction_pending';

    // policy_violation
    case 'POLICY_VIOLATION':
    case 'CUMULATIVE_LIMIT_WARNING':
      return 'policy_violation';

    // security_alert
    case 'WALLET_SUSPENDED':
    case 'KILL_SWITCH_ACTIVATED':
    case 'KILL_SWITCH_RECOVERED':
    case 'KILL_SWITCH_ESCALATED':
    case 'AUTO_STOP_TRIGGERED':
      return 'security_alert';

    // session_event
    case 'SESSION_EXPIRING_SOON':
    case 'SESSION_EXPIRED':
    case 'SESSION_CREATED':
      return 'session_event';

    // system (기본)
    default:
      return 'system';
  }
}
```

#### NotificationMessage 생성

```typescript
private buildNotificationMessage(
  payload: NotificationPayload,
  category: NotificationCategory,
  walletId: string,
): NotificationMessage {
  return {
    version: '1',
    type: 'notification',
    notificationId: generateId(),  // UUID v7
    category,
    title: this.buildTitle(payload.eventType),
    body: payload.message,
    metadata: payload.details
      ? Object.fromEntries(
          Object.entries(payload.details).map(([k, v]) => [k, String(v)])
        )
      : undefined,
    walletId,
    timestamp: new Date(payload.timestamp * 1000).toISOString(),
  };
}
```

### 5.5 ntfy publish 구현

```typescript
private async publishToNtfy(notification: NotificationMessage, walletId: string): Promise<void> {
  const ntfyServer = await this.settingsService.get('notifications.ntfy_server') ?? 'https://ntfy.sh';
  const topicPrefix = await this.settingsService.get('signing_sdk.notify_topic_prefix') ?? 'waiaas-notify';
  const topic = `${topicPrefix}-${walletId}`;

  const priority = this.getPriority(notification.category);

  const body = JSON.stringify({
    topic,
    message: JSON.stringify(notification),
    title: notification.title,
    priority,
    tags: ['waiaas', 'notify', notification.category],
  });

  const response = await fetch(`${ntfyServer}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  if (!response.ok) {
    // 에러 로그만 남기고 throw하지 않음 (기존 채널 패턴과 동일)
    console.error(`[WalletNotificationChannel] Failed to publish to ${topic}: ${response.status}`);
  }
}

private getPriority(category: NotificationCategory): number {
  switch (category) {
    case 'security_alert': return 5;
    case 'policy_violation': return 4;
    default: return 3;
  }
}
```

### 5.6 NotificationService 확장 방식

기존 NotificationService(packages/daemon/src/notifications/notification-service.ts)에 WalletNotificationChannel을 추가하는 방식:

#### 채널 등록

```typescript
// 데몬 초기화 시 (packages/daemon/src/bootstrap.ts 등)

// 기존 채널 등록 (변경 없음)
notificationService.addChannel(telegramChannel);
notificationService.addChannel(discordChannel);
notificationService.addChannel(ntfyChannel);
notificationService.addChannel(slackChannel);

// 지갑 알림 채널 추가 (신규)
const signingEnabled = await settingsService.get('signing_sdk.enabled');
if (signingEnabled === 'true') {
  const walletChannel = new WalletNotificationChannel(settingsService, db);
  await walletChannel.initialize({});
  notificationService.addChannel(walletChannel);
}
```

#### 기존 동작 유지

| 항목 | 기존 동작 | 변경 사항 |
|------|----------|----------|
| 채널 배열 순회 | priority 기반 fallback 또는 broadcast | **변경 없음** -- WalletNotificationChannel이 배열에 추가될 뿐 |
| broadcast 이벤트 | KILL_SWITCH 등 모든 채널 동시 전송 | WalletNotificationChannel도 포함 (security_alert priority 5) |
| 일반 이벤트 | priority 순서 fallback | WalletNotificationChannel은 독립적으로 전송 (send() 내부에서 조건 확인) |
| hot-reload | `replaceChannels()` 호출 시 채널 교체 | WalletNotificationChannel도 재생성 + 재등록 |

### 5.7 SettingsService 알림 관련 키

m26-02에서 추가하는 3개 SettingsService 키 (m26-02 목표 파일과 일치):

| 키 | 타입 | 기본값 | 검증 | 설명 |
|----|------|--------|------|------|
| `signing_sdk.notifications_enabled` | boolean | `true` | - | 지갑 앱 알림 채널 활성/비활성. `false`면 WalletNotificationChannel.send() skip |
| `signing_sdk.notify_topic_prefix` | string | `"waiaas-notify"` | regex: `^[a-z0-9-]+$` | 알림 토픽 접두어. 토픽 이름: `{prefix}-{walletId}` |
| `signing_sdk.notify_categories` | JSON array | `"[]"` (전체) | JSON 배열, 각 요소는 NotificationCategory enum | 전송할 알림 카테고리 필터. 빈 배열 = 전체 통과 |

> **doc 74 Section 9.1의 6개 키 + 본 문서의 3개 키 = 총 9개 signing_sdk SettingsService 키**

#### Admin UI 표시 위치

기존 System > Settings > Signing SDK 섹션(doc 74 Section 9.4)에 알림 설정을 추가:

```
┌─────────────────────────────────────────────────────┐
│  Signing SDK                                         │
│                                                      │
│  Enabled           [Toggle: Off]                     │
│  Request Expiry    [30] min  (1-1440)               │
│  Preferred Channel [ntfy ▼]                          │
│  Preferred Wallet  [Select wallet... ▼]              │
│                                                      │
│  ntfy Topics                                         │
│  Request Prefix    [waiaas-sign]                     │
│  Response Prefix   [waiaas-response]                 │
│  Notify Prefix     [waiaas-notify]         ← 신규   │
│                                                      │
│  Wallet Notifications                      ← 신규   │
│  Notifications     [Toggle: On]                      │
│  Categories        [All ▼] / [Select categories...] │
│                                                      │
│  Registered Wallets                                  │
│  ┌──────────────────────────────────────────────┐   │
│  │ D'CENT Wallet                   [Edit] [Del] │   │
│  │ dcent | solana, evm              │   │
│  │ https://link.dcentwallet.com/waiaas/sign     │   │
│  └──────────────────────────────────────────────┘   │
│  [+ Add Wallet]                                     │
│                                                      │
│  [Save]                                             │
└─────────────────────────────────────────────────────┘
```

### 5.8 파일/모듈 구조

m26-02 구현 시 생성/수정되는 파일:

| 패키지 | 경로 | 내용 | 상태 |
|--------|------|------|------|
| daemon | `src/services/notification/channels/wallet-notification-channel.ts` | WalletNotificationChannel 구현 | **신규** |
| wallet-sdk | `src/schemas.ts` | NotificationMessageSchema, NotificationCategoryEnum 추가 | 수정 |
| wallet-sdk | `src/notifications.ts` | subscribeToNotifications(), parseNotification() | **신규** |
| wallet-sdk | `src/errors.ts` | NotificationParseError 추가 | 수정 |
| wallet-sdk | `src/index.ts` | 알림 함수 + 스키마 + 에러 export 추가 | 수정 |
| daemon | `src/bootstrap.ts` (또는 초기화 코드) | WalletNotificationChannel 등록 | 수정 |
| daemon | `src/infrastructure/settings/` | 3개 키 등록 (notifications_enabled, notify_topic_prefix, notify_categories) | 수정 |

---

*문서 번호: 75*
*생성일: 2026-02-20*
*최종 수정: 2026-02-20*
*선행 문서: 73(Signing Protocol v1), 74(Wallet SDK + Daemon Components)*
*관련 마일스톤: m26-02(알림 채널), m26-03(Push Relay Server)*
*범위: 알림 채널 설계 (Sections 1-5) + Push Relay Server 설계 (Sections 6-10, placeholder)*
