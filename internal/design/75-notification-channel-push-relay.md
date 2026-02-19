# 75. 알림 채널 + Push Relay Server

## 목차

1. [개요](#1-개요)
2. [서명/알림 토픽 분리 구조](#2-서명알림-토픽-분리-구조)
3. [NotificationMessage 스키마](#3-notificationmessage-스키마)
4. [SDK 알림 API](#4-sdk-알림-api)
5. [WalletNotificationChannel + NotificationService 통합](#5-walletnotificationchannel--notificationservice-통합)
6. [Push Relay Server 개요](#6-push-relay-server-개요)
7. [IPushProvider + PushPayload/PushResult](#7-ipushprovider--pushpayloadpushresult)
8. [PushwooshProvider + FcmProvider](#8-pushwooshprovider--fcmprovider)
9. [ntfy SSE Subscriber + 메시지 변환](#9-ntfy-sse-subscriber--메시지-변환)
10. [디바이스 토큰 등록 API](#10-디바이스-토큰-등록-api)
11. [config.toml 스키마](#11-configtoml-스키마)
12. [Docker 배포 설계](#12-docker-배포-설계)
13. [기술 결정 요약](#13-기술-결정-요약)

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

**Sections 6-13** (Plan 200-02): Push Relay Server 설계 (m26-03 입력 사양)
- Section 6: Push Relay Server 개요
- Section 7: IPushProvider + PushPayload/PushResult (RELAY-01)
- Section 8: PushwooshProvider + FcmProvider (RELAY-02)
- Section 9: ntfy SSE Subscriber + 메시지 변환 (RELAY-03)
- Section 10: 디바이스 토큰 등록 API (RELAY-04)
- Section 11: config.toml 스키마 (RELAY-04)
- Section 12: Docker 배포 설계 (RELAY-04)
- Section 13: 기술 결정 요약

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

## 6. Push Relay Server 개요

### 6.1 아키텍처 다이어그램

Push Relay Server는 ntfy 토픽을 SSE로 구독하여 수신한 서명 요청/알림을 지갑 개발사의 기존 푸시 인프라(Pushwoosh, FCM 등)로 변환하여 전달하는 경량 중계 서버다.

```
WAIaaS 데몬
  │
  ├── ntfy publish (서명 요청)
  │     토픽: waiaas-sign-{walletId}
  │     priority: 5 (urgent)
  │
  └── ntfy publish (알림)
        토픽: waiaas-notify-{walletId}
        priority: 3-5 (카테고리별)
            │
            ▼
  ┌──────────────────────────────────────────────┐
  │         Push Relay Server                     │
  │         (@waiaas/push-relay)                  │
  │                                               │
  │   ┌───────────────┐                          │
  │   │ NtfySubscriber │ ← SSE 다중 토픽 구독    │
  │   │ (EventSource)  │                          │
  │   └───────┬───────┘                          │
  │           │ NtfyMessage                      │
  │           ▼                                  │
  │   ┌───────────────┐                          │
  │   │ MessageParser  │ ntfy → PushPayload 변환  │
  │   │                │ (토픽 기반 분기)          │
  │   └───────┬───────┘                          │
  │           │ PushPayload                      │
  │           ▼                                  │
  │   ┌───────────────┐    ┌──────────────────┐ │
  │   │ IPushProvider  │◄───│ DeviceRegistry   │ │
  │   │  ├─ Pushwoosh  │    │ (SQLite relay.db)│ │
  │   │  └─ FCM        │    │ POST/DELETE      │ │
  │   └───────┬───────┘    │ /devices         │ │
  │           │             └──────────────────┘ │
  │   ┌───────────────┐                          │
  │   │  HTTP Server   │ ← Hono (포트 3100)      │
  │   │  /devices API  │                          │
  │   └───────────────┘                          │
  └──────────────────────────────────────────────┘
            │
            ▼
  Pushwoosh API / FCM API
            │
            ▼
  APNs / Google Push
            │
            ▼
      지갑 앱 (네이티브 푸시 수신)
```

### 6.2 컴포넌트 목록

| # | 컴포넌트 | 역할 | 주요 의존 |
|---|---------|------|----------|
| 1 | **NtfySubscriber** | ntfy 토픽 SSE 구독 + 재연결 관리 | EventSource (Node.js 22 내장) |
| 2 | **MessageParser** | ntfy JSON → PushPayload 변환 (토픽 패턴 기반 분기) | PushPayloadSchema (Zod) |
| 3 | **IPushProvider** | 푸시 전송 추상화 인터페이스 + 구현체(Pushwoosh/FCM) | 프로바이더별 HTTP API |
| 4 | **DeviceRegistry** | 디바이스 푸시 토큰 CRUD + invalidTokens 자동 정리 | SQLite (relay.db) |
| 5 | **HTTP Server** | 디바이스 토큰 등록 API (POST/DELETE /devices) | Hono (OpenAPIHono) |

### 6.3 패키지 위치 및 운영 모델

| 항목 | 내용 |
|------|------|
| 패키지 경로 | `packages/push-relay/` (모노레포 내 @waiaas/push-relay) |
| WAIaaS 데몬과의 관계 | **독립 프로세스**. ntfy 토픽으로만 연결 (직접 API 호출 없음) |
| 운영 주체 | **지갑 개발사**. 자사 푸시 인증 정보(Pushwoosh API Token, FCM Service Account Key) 사용 |
| 통신 프로토콜 | WAIaaS → ntfy (publish) → Push Relay (SSE subscribe) → Pushwoosh/FCM (HTTP API) |
| 배포 형태 | Docker 컨테이너 (docker-compose) 또는 Node.js 직접 실행 |

### 6.4 데이터 흐름 시퀀스

```
1. WAIaaS 데몬이 ntfy 토픽에 메시지 publish (서명 요청 또는 알림)
2. NtfySubscriber가 SSE로 메시지 수신
3. MessageParser가 토픽 패턴 분석:
   - waiaas-sign-{walletId} → category: 'sign_request', priority: 'high'
   - waiaas-notify-{walletId} → category: 'notification', priority: metadata 기반
4. DeviceRegistry에서 walletId에 등록된 디바이스 토큰 조회
5. IPushProvider.send()로 디바이스 토큰 배열 + PushPayload 전송
6. PushResult에서 invalidTokens가 있으면 DeviceRegistry에서 자동 삭제
7. 지갑 앱이 네이티브 푸시로 메시지 수신
```

---

## 7. IPushProvider + PushPayload/PushResult

### 7.1 IPushProvider 인터페이스

Push Relay Server의 핵심 추상화. 신규 푸시 서비스 지원은 IPushProvider 구현 클래스 추가만으로 가능하다.

```typescript
// packages/push-relay/src/providers/push-provider.ts

/**
 * 푸시 알림 전송 프로바이더 인터페이스.
 *
 * 프로바이더 확장 패턴:
 * 1. IPushProvider 구현 클래스 생성 (예: ApnsProvider)
 * 2. config.toml에 프로바이더 설정 섹션 추가
 * 3. createProvider() 팩토리에 분기 추가
 */
interface IPushProvider {
  /** 프로바이더 식별자 (로그, 에러 메시지에 사용) */
  readonly name: string;

  /**
   * 디바이스 토큰 배열에 푸시 메시지를 전송한다.
   *
   * @param tokens - 대상 디바이스 푸시 토큰 배열
   * @param payload - 전송할 푸시 페이로드
   * @returns 전송 결과 (성공/실패 수 + 무효 토큰 목록)
   */
  send(tokens: string[], payload: PushPayload): Promise<PushResult>;

  /**
   * 프로바이더 설정이 유효한지 검증한다.
   * 서버 시작 시 호출하여 인증 정보 유효성을 사전 확인한다.
   *
   * @returns true면 정상, false면 설정 오류
   */
  validateConfig(): Promise<boolean>;
}
```

### 7.2 PushPayload 스키마

```typescript
// packages/push-relay/src/schemas.ts

import { z } from 'zod';

/**
 * IPushProvider.send()에 전달되는 푸시 페이로드.
 * ntfy 메시지를 파싱하여 생성한다 (MessageParser 담당).
 */
const PushPayloadSchema = z.object({
  /** 푸시 알림 제목 (네이티브 알림 헤더) */
  title: z.string(),

  /** 푸시 알림 본문 (네이티브 알림 내용) */
  body: z.string(),

  /**
   * 커스텀 데이터 (string key-value).
   * - sign_request: 전체 SignRequest JSON (지갑 앱이 서명 UI 직접 표시)
   * - notification: 전체 NotificationMessage JSON
   */
  data: z.record(z.string()),

  /** 메시지 종류: 서명 요청 또는 일반 알림 */
  category: z.enum(['sign_request', 'notification']),

  /**
   * 푸시 우선순위.
   * - high: 서명 요청, 보안 알림 (즉시 표시, 배터리 최적화 무시)
   * - normal: 일반 알림 (배터리 최적화 적용 가능)
   */
  priority: z.enum(['high', 'normal']),
});

type PushPayload = z.infer<typeof PushPayloadSchema>;
```

### 7.3 PushResult 스키마

```typescript
/**
 * IPushProvider.send()의 반환 결과.
 * invalidTokens는 DeviceRegistry에서 자동 정리에 사용된다.
 */
const PushResultSchema = z.object({
  /** 성공적으로 전송된 메시지 수 */
  sent: z.number(),

  /** 전송 실패한 메시지 수 */
  failed: z.number(),

  /**
   * 무효한 디바이스 토큰 목록.
   * 앱 삭제, 토큰 갱신 등으로 더 이상 유효하지 않은 토큰.
   * DeviceRegistry에서 자동 삭제 대상.
   */
  invalidTokens: z.array(z.string()),
});

type PushResult = z.infer<typeof PushResultSchema>;
```

### 7.4 프로바이더 확장 패턴

```typescript
// packages/push-relay/src/providers/create-provider.ts

import type { IPushProvider } from './push-provider.js';
import { PushwooshProvider } from './pushwoosh-provider.js';
import { FcmProvider } from './fcm-provider.js';
import type { RelayConfig } from '../config.js';

/**
 * config.toml의 relay_push.provider 값에 따라 IPushProvider 구현체를 생성한다.
 * 신규 프로바이더 추가 시 이 팩토리에 분기를 추가한다.
 */
function createProvider(config: RelayConfig): IPushProvider {
  switch (config.relay_push.provider) {
    case 'pushwoosh':
      if (!config.relay_push_pushwoosh) {
        throw new Error('[push-relay] relay_push_pushwoosh section required when provider is "pushwoosh"');
      }
      return new PushwooshProvider(config.relay_push_pushwoosh);

    case 'fcm':
      if (!config.relay_push_fcm) {
        throw new Error('[push-relay] relay_push_fcm section required when provider is "fcm"');
      }
      return new FcmProvider(config.relay_push_fcm);

    default:
      throw new Error(`[push-relay] Unknown provider: ${config.relay_push.provider}`);
  }
}
```

---

## 8. PushwooshProvider + FcmProvider

### 8.1 PushwooshProvider

#### API 사양

| 항목 | 내용 |
|------|------|
| 엔드포인트 | `POST https://cp.pushwoosh.com/json/1.3/createMessage` |
| 인증 | API Token + Application Code (config.toml `relay_push_pushwoosh` 섹션) |
| API 버전 | 1.3 (고정, Pushwoosh Remote API) |
| 문서 | https://docs.pushwoosh.com/platform-docs/api-reference/messages/create-message |

#### 구현

```typescript
// packages/push-relay/src/providers/pushwoosh-provider.ts

import type { IPushProvider } from './push-provider.js';
import type { PushPayload, PushResult } from '../schemas.js';

interface PushwooshConfig {
  api_token: string;
  application_code: string;
}

class PushwooshProvider implements IPushProvider {
  readonly name = 'pushwoosh';

  constructor(private readonly config: PushwooshConfig) {}

  async send(tokens: string[], payload: PushPayload): Promise<PushResult> {
    const body = this.buildRequestBody(tokens, payload);

    const response = await fetch('https://cp.pushwoosh.com/json/1.3/createMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    return this.parseResponse(response, tokens);
  }

  async validateConfig(): Promise<boolean> {
    // Pushwoosh는 사전 검증 API가 없으므로 설정 존재 여부만 확인
    return !!(this.config.api_token && this.config.application_code);
  }

  private buildRequestBody(tokens: string[], payload: PushPayload) {
    return {
      request: {
        auth: this.config.api_token,
        application: this.config.application_code,
        notifications: [
          {
            // 전송 대상: 디바이스 토큰 배열
            devices: tokens,

            // 다국어 콘텐츠 객체 (영문 고정, 지갑 앱이 로컬라이즈)
            content: { en: `${payload.title}\n${payload.body}` },

            // 커스텀 데이터 (SignRequest/NotificationMessage JSON 포함)
            data: payload.data,

            // iOS 설정
            ios_root_params: {
              aps: {
                // 카테고리 (iOS Notification Category → 액션 버튼 연결)
                category: payload.category,
                // content-available: high priority 시 1 (사일런트 푸시 + 포그라운드 깨움)
                'content-available': payload.priority === 'high' ? 1 : 0,
                // 사운드 설정
                sound: payload.priority === 'high' ? 'default' : undefined,
              },
            },

            // Android 설정
            android_root_params: {
              // FCM priority 매핑 (Pushwoosh → FCM 내부 변환)
              priority: payload.priority === 'high' ? 'high' : 'normal',
            },
          },
        ],
      },
    };
  }

  private async parseResponse(response: Response, tokens: string[]): Promise<PushResult> {
    if (!response.ok) {
      console.error(`[PushwooshProvider] HTTP ${response.status}: ${response.statusText}`);
      return { sent: 0, failed: tokens.length, invalidTokens: [] };
    }

    const json = await response.json() as {
      status_code: number;
      status_message: string;
      response?: { Messages?: string[] };
    };

    if (json.status_code !== 200) {
      console.error(`[PushwooshProvider] API error ${json.status_code}: ${json.status_message}`);
      return { sent: 0, failed: tokens.length, invalidTokens: [] };
    }

    // Pushwoosh 200 응답은 메시지 큐잉 성공을 의미 (개별 디바이스 전송 결과는 비동기)
    return { sent: tokens.length, failed: 0, invalidTokens: [] };
  }
}
```

#### PushPayload -> Pushwoosh 페이로드 매핑 표

| PushPayload 필드 | Pushwoosh 필드 | 변환 규칙 |
|------------------|---------------|----------|
| `title` + `body` | `content` | `{ en: "${title}\n${body}" }` (다국어 객체) |
| `data` | `data` | 그대로 전달 (커스텀 JSON) |
| `category` | `ios_root_params.aps.category` | `'sign_request'` 또는 `'notification'` |
| `priority` (`high`) | `ios_root_params.aps.content-available` | `1` (사일런트 푸시 활성) |
| `priority` (`high`) | `android_root_params.priority` | `"high"` |
| `priority` (`normal`) | `ios_root_params.aps.content-available` | `0` |
| `priority` (`normal`) | `android_root_params.priority` | `"normal"` |
| `tokens[]` | `devices` | 그대로 전달 (디바이스 토큰 배열) |

#### 에러 처리

| 상황 | HTTP 상태 | 동작 |
|------|----------|------|
| 네트워크 오류 | - | `PushResult { sent: 0, failed: tokens.length, invalidTokens: [] }` |
| HTTP 4xx/5xx | 4xx/5xx | 에러 로그 + `PushResult { failed: tokens.length }` |
| HTTP 200 + status_code !== 200 | 200 | Pushwoosh API 에러. 에러 로그 + `PushResult { failed: tokens.length }` |
| HTTP 200 + status_code === 200 | 200 | 성공. `PushResult { sent: tokens.length }` |

> **참고**: Pushwoosh createMessage API는 메시지 큐잉 결과만 동기 반환하며, 개별 디바이스 전송 성공/실패는 비동기 처리된다. 따라서 invalidTokens는 Pushwoosh의 Device API를 통한 별도 정리가 필요하며, 초기 구현에서는 비워둔다.

### 8.2 FcmProvider

#### API 사양

| 항목 | 내용 |
|------|------|
| 엔드포인트 | `POST https://fcm.googleapis.com/v1/projects/{project_id}/messages:send` |
| 인증 | Google Service Account Key JSON → OAuth2 access_token |
| API 버전 | FCM HTTP v1 API (Legacy API 미사용) |
| 문서 | https://firebase.google.com/docs/cloud-messaging/send-message |

#### 인증 흐름

```
Service Account Key JSON (파일)
      │
      ▼
  JWT 서명 (RS256)
  iss: client_email
  scope: https://www.googleapis.com/auth/firebase.messaging
  aud: https://oauth2.googleapis.com/token
      │
      ▼
  POST https://oauth2.googleapis.com/token
  grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer
  assertion={signed_jwt}
      │
      ▼
  access_token (1시간 유효)
  → 만료 5분 전 자동 갱신
```

#### 구현

```typescript
// packages/push-relay/src/providers/fcm-provider.ts

import type { IPushProvider } from './push-provider.js';
import type { PushPayload, PushResult } from '../schemas.js';
import { readFileSync } from 'node:fs';
import { SignJWT, importPKCS8 } from 'jose';

interface FcmConfig {
  project_id: string;
  service_account_key_path: string;
}

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  project_id: string;
}

class FcmProvider implements IPushProvider {
  readonly name = 'fcm';

  private serviceAccount: ServiceAccountKey | null = null;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(private readonly config: FcmConfig) {}

  async send(tokens: string[], payload: PushPayload): Promise<PushResult> {
    const accessToken = await this.getAccessToken();
    const result: PushResult = { sent: 0, failed: 0, invalidTokens: [] };

    // FCM HTTP v1 API는 단건 전송 (sendAll/sendMulticast deprecated 대비)
    // 병렬 전송으로 성능 확보
    const promises = tokens.map(async (token) => {
      try {
        await this.sendSingle(accessToken, token, payload, result);
      } catch (error) {
        result.failed++;
        console.error(`[FcmProvider] Failed to send to ${token.substring(0, 10)}...:`, error);
      }
    });

    await Promise.allSettled(promises);
    return result;
  }

  async validateConfig(): Promise<boolean> {
    try {
      this.loadServiceAccount();
      // access_token 획득까지 검증
      await this.getAccessToken();
      return true;
    } catch (error) {
      console.error('[FcmProvider] Config validation failed:', error);
      return false;
    }
  }

  private async sendSingle(
    accessToken: string,
    token: string,
    payload: PushPayload,
    result: PushResult,
  ): Promise<void> {
    const fcmBody = this.buildFcmMessage(token, payload);
    const url = `https://fcm.googleapis.com/v1/projects/${this.config.project_id}/messages:send`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(fcmBody),
    });

    if (response.ok) {
      result.sent++;
      return;
    }

    const errorBody = await response.json().catch(() => ({})) as { error?: { code?: number; status?: string } };
    const errorStatus = errorBody?.error?.status;

    switch (response.status) {
      case 404:  // NOT_FOUND: 토큰 무효
      case 410:  // UNREGISTERED: 앱 삭제됨
        result.invalidTokens.push(token);
        result.failed++;
        break;

      case 429:  // QUOTA_EXCEEDED: 재시도 1회 (백오프)
        await this.delay(1000);
        const retryResponse = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(fcmBody),
        });
        if (retryResponse.ok) {
          result.sent++;
        } else {
          result.failed++;
          console.warn(`[FcmProvider] Retry failed for ${token.substring(0, 10)}...: ${retryResponse.status}`);
        }
        break;

      default:  // 5xx 등: 재시도 1회
        if (response.status >= 500) {
          await this.delay(500);
          const retryResponse2 = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify(fcmBody),
          });
          if (retryResponse2.ok) {
            result.sent++;
          } else {
            result.failed++;
          }
        } else {
          result.failed++;
          console.error(`[FcmProvider] HTTP ${response.status} ${errorStatus}: ${token.substring(0, 10)}...`);
        }
        break;
    }
  }

  private buildFcmMessage(token: string, payload: PushPayload) {
    return {
      message: {
        token,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: payload.data,
        android: {
          priority: payload.priority === 'high' ? 'HIGH' : 'NORMAL',
          notification: {
            click_action: payload.category === 'sign_request'
              ? 'WAIAAS_SIGN_REQUEST'
              : 'WAIAAS_NOTIFICATION',
          },
        },
        apns: {
          headers: {
            'apns-priority': payload.priority === 'high' ? '10' : '5',
          },
          payload: {
            aps: {
              category: payload.category,
              'content-available': payload.priority === 'high' ? 1 : 0,
              sound: payload.priority === 'high' ? 'default' : undefined,
            },
          },
        },
      },
    };
  }

  private loadServiceAccount(): void {
    if (this.serviceAccount) return;
    const raw = readFileSync(this.config.service_account_key_path, 'utf-8');
    this.serviceAccount = JSON.parse(raw) as ServiceAccountKey;
  }

  /**
   * OAuth2 access_token을 획득/캐시한다.
   * 만료 5분 전에 자동 갱신한다.
   */
  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.accessToken && this.tokenExpiresAt > now + 5 * 60 * 1000) {
      return this.accessToken;
    }

    this.loadServiceAccount();
    const sa = this.serviceAccount!;

    // JWT 생성 (RS256)
    const privateKey = await importPKCS8(sa.private_key, 'RS256');
    const jwt = await new SignJWT({
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(sa.client_email)
      .setAudience('https://oauth2.googleapis.com/token')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);

    // OAuth2 토큰 교환
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error(`[FcmProvider] Token exchange failed: ${tokenResponse.status}`);
    }

    const tokenData = await tokenResponse.json() as { access_token: string; expires_in: number };
    this.accessToken = tokenData.access_token;
    this.tokenExpiresAt = now + tokenData.expires_in * 1000;

    return this.accessToken;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

#### PushPayload -> FCM 페이로드 매핑 표

| PushPayload 필드 | FCM 필드 | 변환 규칙 |
|------------------|---------|----------|
| `title` | `message.notification.title` | 그대로 전달 |
| `body` | `message.notification.body` | 그대로 전달 |
| `data` | `message.data` | 그대로 전달 (string key-value) |
| `category` (`sign_request`) | `message.android.notification.click_action` | `"WAIAAS_SIGN_REQUEST"` |
| `category` (`notification`) | `message.android.notification.click_action` | `"WAIAAS_NOTIFICATION"` |
| `category` | `message.apns.payload.aps.category` | 그대로 전달 |
| `priority` (`high`) | `message.android.priority` | `"HIGH"` |
| `priority` (`normal`) | `message.android.priority` | `"NORMAL"` |
| `priority` (`high`) | `message.apns.headers.apns-priority` | `"10"` |
| `priority` (`normal`) | `message.apns.headers.apns-priority` | `"5"` |
| `tokens[i]` | `message.token` | 1건씩 전송 (FCM HTTP v1 단건 API) |

#### 에러 처리

| HTTP 상태 | FCM 에러 | 동작 |
|----------|---------|------|
| 200 | - | 성공. `result.sent++` |
| 404 | `NOT_FOUND` | 토큰 무효. `invalidTokens.push(token)` + `result.failed++` |
| 410 | `UNREGISTERED` | 앱 삭제됨. `invalidTokens.push(token)` + `result.failed++` |
| 429 | `QUOTA_EXCEEDED` | 1초 대기 후 재시도 1회. 실패 시 `result.failed++` |
| 500/503 | `INTERNAL`/`UNAVAILABLE` | 0.5초 대기 후 재시도 1회. 실패 시 `result.failed++` |
| 기타 4xx | 다양 | `result.failed++` + 에러 로그 |

#### access_token 캐시 정책

| 항목 | 값 | 설명 |
|------|-----|------|
| 유효 시간 | 1시간 | Google OAuth2 기본 |
| 갱신 시점 | 만료 5분 전 | `tokenExpiresAt > now + 5 * 60 * 1000` |
| 갱신 방식 | JWT 재서명 → 토큰 교환 | 매번 새 JWT 생성 |
| 저장 위치 | 메모리 (프로세스 내) | 재시작 시 재발급 |

---

## 9. ntfy SSE Subscriber + 메시지 변환

### 9.1 NtfySubscriber 클래스

```typescript
// packages/push-relay/src/subscriber/ntfy-subscriber.ts

/**
 * ntfy 토픽을 SSE로 구독하여 메시지를 수신한다.
 *
 * ntfy의 다중 토픽 구독 기능을 활용하여 단일 SSE 연결로
 * 여러 walletId의 서명 + 알림 토픽을 동시에 구독한다.
 *
 * 구독 URL: GET {ntfy_server}/{topic1},{topic2},.../sse
 */
class NtfySubscriber {
  private eventSource: EventSource | null = null;
  private reconnectAttempts: number = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastHeartbeat: number = Date.now();
  private heartbeatChecker: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly ntfyServer: string,
    private readonly topics: string[],
  ) {}

  /**
   * SSE 구독을 시작한다.
   *
   * @param onMessage - ntfy 메시지 수신 콜백 (토픽 + 파싱된 메시지)
   */
  subscribe(onMessage: (topic: string, message: NtfyMessage) => void): void {
    const topicList = this.topics.join(',');
    const sseUrl = `${this.ntfyServer}/${topicList}/sse`;

    console.log(`[NtfySubscriber] Subscribing to ${this.topics.length} topics: ${sseUrl}`);

    this.eventSource = new EventSource(sseUrl);

    this.eventSource.onmessage = (event: MessageEvent) => {
      this.lastHeartbeat = Date.now();
      this.reconnectAttempts = 0;  // 성공 시 재연결 카운터 리셋

      try {
        const message = JSON.parse(event.data) as NtfyMessage;
        // ntfy keepalive 메시지 무시 (event: "keepalive")
        if (message.event === 'keepalive') return;
        if (message.event !== 'message') return;

        onMessage(message.topic, message);
      } catch (error) {
        console.warn('[NtfySubscriber] Failed to parse message:', error);
      }
    };

    this.eventSource.onerror = () => {
      console.warn('[NtfySubscriber] SSE connection error, scheduling reconnect...');
      this.scheduleReconnect(onMessage);
    };

    // heartbeat 감시: 60초 동안 메시지 없으면 재연결
    this.heartbeatChecker = setInterval(() => {
      if (Date.now() - this.lastHeartbeat > 60_000) {
        console.warn('[NtfySubscriber] Heartbeat timeout (60s), reconnecting...');
        this.close();
        this.subscribe(onMessage);
      }
    }, 15_000);
  }

  /**
   * SSE 연결을 종료한다.
   */
  close(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.heartbeatChecker) {
      clearInterval(this.heartbeatChecker);
      this.heartbeatChecker = null;
    }
  }

  /**
   * 지수 백오프 재연결.
   * 1s → 2s → 4s → 8s → 16s → 32s → 60s (최대)
   */
  private scheduleReconnect(onMessage: (topic: string, message: NtfyMessage) => void): void {
    this.close();
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 60_000);
    this.reconnectAttempts++;

    console.log(`[NtfySubscriber] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`);

    this.reconnectTimer = setTimeout(() => {
      this.subscribe(onMessage);
    }, delay);
  }
}

/**
 * ntfy SSE 메시지 구조 (ntfy JSON 이벤트).
 */
interface NtfyMessage {
  id: string;
  time: number;
  event: 'message' | 'keepalive' | 'open';
  topic: string;
  message?: string;
  title?: string;
  priority?: number;
  tags?: string[];
}
```

### 9.2 구독 대상 토픽 계산

NtfySubscriber가 구독하는 토픽은 config.toml의 `relay.wallet_ids` 배열과 `relay.topic_prefix`로 결정된다:

```typescript
// packages/push-relay/src/subscriber/build-topics.ts

/**
 * 구독 대상 ntfy 토픽 목록을 생성한다.
 *
 * 각 walletId에 대해 서명 + 알림 토픽 2개를 생성하므로,
 * N개 walletId → 2N개 토픽을 구독한다.
 *
 * @param topicPrefix - 토픽 접두어 (기본: "waiaas")
 * @param walletIds - 구독 대상 지갑 ID 배열
 * @returns ntfy 토픽 문자열 배열
 */
function buildTopics(topicPrefix: string, walletIds: string[]): string[] {
  const topics: string[] = [];
  for (const walletId of walletIds) {
    topics.push(`${topicPrefix}-sign-${walletId}`);      // 서명 요청 토픽
    topics.push(`${topicPrefix}-notify-${walletId}`);     // 일반 알림 토픽
  }
  return topics;
}
```

예시:

| wallet_ids | topic_prefix | 생성 토픽 |
|------------|-------------|----------|
| `["wallet-A"]` | `"waiaas"` | `waiaas-sign-wallet-A`, `waiaas-notify-wallet-A` (2개) |
| `["wallet-A", "wallet-B", "wallet-C"]` | `"waiaas"` | 6개 토픽 (3 x 2) |

### 9.3 MessageParser

```typescript
// packages/push-relay/src/subscriber/message-parser.ts

import type { PushPayload } from '../schemas.js';
import type { NtfyMessage } from './ntfy-subscriber.js';

/**
 * ntfy 메시지를 PushPayload로 변환한다.
 * 토픽 패턴으로 서명 요청과 일반 알림을 분기한다.
 */
class MessageParser {
  constructor(private readonly topicPrefix: string) {}

  /**
   * ntfy 메시지를 PushPayload로 변환한다.
   *
   * @param topic - ntfy 토픽 이름
   * @param message - ntfy 메시지 객체
   * @returns PushPayload 또는 null (파싱 불가 시)
   */
  parse(topic: string, message: NtfyMessage): PushPayload | null {
    // 토픽 패턴 분기
    if (topic.startsWith(`${this.topicPrefix}-sign-`)) {
      return this.parseSignRequest(message);
    }
    if (topic.startsWith(`${this.topicPrefix}-notify-`)) {
      return this.parseNotification(message);
    }

    console.warn(`[MessageParser] Unknown topic pattern: ${topic}`);
    return null;
  }

  /**
   * 서명 요청 메시지 변환.
   *
   * ntfy 서명 토픽의 message 필드에는 SignRequest JSON이 포함된다 (doc 73 Section 7.2).
   * 지갑 앱이 Push data에서 SignRequest를 추출하여 서명 UI를 직접 표시할 수 있도록
   * 전체 SignRequest JSON을 data.signRequest 필드에 포함한다.
   */
  private parseSignRequest(message: NtfyMessage): PushPayload {
    // ntfy message 필드에서 SignRequest JSON 추출
    const signRequestJson = message.message ?? '';

    let displayBody = 'New transaction requires your approval';
    try {
      const signRequest = JSON.parse(signRequestJson) as {
        displayMessage?: string;
        type?: string;
        amount?: string;
        to?: string;
      };
      // displayMessage가 있으면 사용 (doc 73 Section 5.2)
      if (signRequest.displayMessage) {
        displayBody = signRequest.displayMessage;
      }
    } catch {
      // JSON 파싱 실패 시 기본 메시지 사용
    }

    return {
      title: 'Transaction Approval',
      body: displayBody,
      data: {
        signRequest: signRequestJson,   // 전체 SignRequest JSON
        type: 'sign_request',
      },
      category: 'sign_request',
      priority: 'high',                 // 서명 요청은 항상 high priority
    };
  }

  /**
   * 일반 알림 메시지 변환.
   *
   * ntfy 알림 토픽의 message 필드에는 NotificationMessage JSON이 포함된다 (doc 75 Section 3).
   * priority는 NotificationMessage의 category에 따라 결정한다.
   */
  private parseNotification(message: NtfyMessage): PushPayload {
    const notificationJson = message.message ?? '';

    let title = message.title ?? 'WAIaaS Notification';
    let body = 'You have a new notification';
    let priority: 'high' | 'normal' = 'normal';

    try {
      const notification = JSON.parse(notificationJson) as {
        title?: string;
        body?: string;
        category?: string;
      };
      if (notification.title) title = notification.title;
      if (notification.body) body = notification.body;

      // category별 priority 매핑 (Section 2.3 기준)
      if (notification.category === 'security_alert') {
        priority = 'high';
      } else if (notification.category === 'policy_violation') {
        priority = 'high';
      }
    } catch {
      // JSON 파싱 실패 시 기본값 사용
    }

    return {
      title,
      body,
      data: {
        notification: notificationJson,   // 전체 NotificationMessage JSON
        type: 'notification',
      },
      category: 'notification',
      priority,
    };
  }
}
```

### 9.4 SSE 구독 상세

| 항목 | 내용 |
|------|------|
| 구독 URL | `GET {ntfy_server}/{topic1},{topic2},.../sse` |
| 프로토콜 | Server-Sent Events (text/event-stream) |
| 다중 토픽 | ntfy 네이티브 지원 (콤마 구분, 단일 연결) |
| keepalive | ntfy가 30초마다 전송 (`event: keepalive`) |
| 인코딩 | UTF-8 JSON |

### 9.5 재연결 정책

| 항목 | 값 | 설명 |
|------|-----|------|
| 초기 대기 | 1초 | 첫 번째 재연결 시도 |
| 증가 방식 | 지수 백오프 (x2) | 1s → 2s → 4s → 8s → 16s → 32s → 60s |
| 최대 대기 | 60초 | 60초 이상 대기하지 않음 |
| 카운터 리셋 | 메시지 수신 시 | 정상 수신되면 attempts=0으로 리셋 |
| heartbeat 타임아웃 | 60초 | ntfy keepalive(30s) 2회 미수신 시 재연결 |
| heartbeat 체크 주기 | 15초 | setInterval로 주기적 확인 |

### 9.6 변환 매핑 표

ntfy 메시지 유형별 PushPayload 필드 매핑:

| ntfy 토픽 패턴 | PushPayload.category | PushPayload.priority | PushPayload.title | PushPayload.body | PushPayload.data |
|---------------|---------------------|---------------------|-------------------|-----------------|-----------------|
| `{prefix}-sign-{walletId}` | `'sign_request'` | `'high'` (항상) | `"Transaction Approval"` | SignRequest.displayMessage 또는 기본 문구 | `{ signRequest: "{전체 JSON}", type: "sign_request" }` |
| `{prefix}-notify-{walletId}` (security_alert) | `'notification'` | `'high'` | NotificationMessage.title | NotificationMessage.body | `{ notification: "{전체 JSON}", type: "notification" }` |
| `{prefix}-notify-{walletId}` (policy_violation) | `'notification'` | `'high'` | NotificationMessage.title | NotificationMessage.body | `{ notification: "{전체 JSON}", type: "notification" }` |
| `{prefix}-notify-{walletId}` (기타) | `'notification'` | `'normal'` | NotificationMessage.title | NotificationMessage.body | `{ notification: "{전체 JSON}", type: "notification" }` |

---

## 10. 디바이스 토큰 등록 API

### 10.1 DeviceRegistration 스키마

```typescript
// packages/push-relay/src/registry/device-registry.ts

import { z } from 'zod';

/**
 * 디바이스 토큰 등록 요청 스키마.
 * 지갑 앱이 자신의 푸시 토큰을 Push Relay Server에 등록할 때 사용한다.
 */
const DeviceRegistrationSchema = z.object({
  /** 대상 지갑 ID (UUID v7). config.toml wallet_ids에 포함된 지갑만 유효 */
  walletId: z.string(),

  /** 디바이스 푸시 토큰 (APNs Device Token 또는 FCM Registration Token) */
  pushToken: z.string(),

  /** 디바이스 플랫폼 */
  platform: z.enum(['ios', 'android']),
});

type DeviceRegistration = z.infer<typeof DeviceRegistrationSchema>;
```

### 10.2 API 엔드포인트

#### POST /devices -- 디바이스 토큰 등록

| 항목 | 내용 |
|------|------|
| 메서드 | `POST` |
| 경로 | `/devices` |
| Content-Type | `application/json` |
| 인증 | 없음 (Push Relay Server는 내부 네트워크에서 운영) |

**요청 Body:**

```json
{
  "walletId": "01935a3b-7c8d-7e00-b123-456789abcdef",
  "pushToken": "dGhpcyBpcyBhIHB1c2ggdG9rZW4=",
  "platform": "ios"
}
```

**응답:**

| 상태 코드 | 조건 | Body |
|-----------|------|------|
| `201 Created` | 신규 토큰 등록 | `{ "status": "created" }` |
| `200 OK` | 기존 토큰 upsert (walletId/platform 업데이트) | `{ "status": "updated" }` |
| `400 Bad Request` | Zod 검증 실패 | `{ "error": "Invalid request", "details": [...] }` |

**Upsert 동작**: 동일한 `pushToken`이 이미 존재하면 `walletId`와 `platform`을 업데이트한다 (INSERT OR REPLACE). 에러를 발생시키지 않는다.

#### DELETE /devices/:token -- 디바이스 토큰 해제

| 항목 | 내용 |
|------|------|
| 메서드 | `DELETE` |
| 경로 | `/devices/:token` |
| URL 파라미터 | `token` -- pushToken (URL 인코딩) |
| 인증 | 없음 |

**응답:**

| 상태 코드 | 조건 | Body |
|-----------|------|------|
| `204 No Content` | 삭제 성공 | (없음) |
| `204 No Content` | 존재하지 않는 토큰 (멱등) | (없음) |

### 10.3 SQLite 스키마 (relay.db)

Push Relay Server는 WAIaaS 데몬과 별도의 SQLite 데이터베이스(`relay.db`)를 사용한다.

```sql
-- relay.db 초기 스키마

CREATE TABLE devices (
  push_token TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK(platform IN ('ios', 'android')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- walletId로 디바이스 조회 (Push 전송 시 사용)
CREATE INDEX idx_devices_wallet_id ON devices(wallet_id);
```

**스키마 설계 결정:**

| 결정 | 근거 |
|------|------|
| `push_token`을 PK로 사용 | 하나의 디바이스는 하나의 토큰만 가짐. 자연 키 사용으로 추가 ID 불필요 |
| `wallet_id` 인덱스 | Push 전송 시 walletId로 토큰 조회가 주요 쿼리 |
| ISO 8601 타임스탬프 | 로그/디버깅 가독성. WAIaaS 데몬과 달리 Unix seconds 미사용 (relay.db 독립) |
| CHECK 제약 | `platform` 값 범위 제한 |

### 10.4 DeviceRegistry 클래스

```typescript
// packages/push-relay/src/registry/device-registry.ts

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

class DeviceRegistry {
  constructor(private readonly db: BetterSQLite3Database) {}

  /**
   * 디바이스 토큰을 등록(또는 업데이트)한다.
   * @returns 'created' (신규) 또는 'updated' (기존 토큰 upsert)
   */
  upsert(registration: DeviceRegistration): 'created' | 'updated' {
    const existing = this.db
      .select()
      .from(devices)
      .where(eq(devices.pushToken, registration.pushToken))
      .get();

    if (existing) {
      this.db
        .update(devices)
        .set({
          walletId: registration.walletId,
          platform: registration.platform,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(devices.pushToken, registration.pushToken))
        .run();
      return 'updated';
    }

    this.db.insert(devices).values({
      pushToken: registration.pushToken,
      walletId: registration.walletId,
      platform: registration.platform,
    }).run();
    return 'created';
  }

  /**
   * 디바이스 토큰을 해제한다. 존재하지 않아도 에러 없음 (멱등).
   */
  remove(pushToken: string): void {
    this.db.delete(devices).where(eq(devices.pushToken, pushToken)).run();
  }

  /**
   * walletId에 등록된 모든 디바이스 토큰을 조회한다.
   * Push 전송 시 사용한다.
   */
  getTokensByWalletId(walletId: string): string[] {
    const rows = this.db
      .select({ pushToken: devices.pushToken })
      .from(devices)
      .where(eq(devices.walletId, walletId))
      .all();
    return rows.map(r => r.pushToken);
  }

  /**
   * 무효한 토큰을 일괄 삭제한다.
   * IPushProvider.send() 결과의 invalidTokens를 받아 DB에서 자동 정리한다.
   */
  removeInvalidTokens(tokens: string[]): number {
    if (tokens.length === 0) return 0;

    let removed = 0;
    for (const token of tokens) {
      const result = this.db.delete(devices).where(eq(devices.pushToken, token)).run();
      if (result.changes > 0) removed++;
    }

    if (removed > 0) {
      console.log(`[DeviceRegistry] Removed ${removed} invalid tokens`);
    }
    return removed;
  }
}
```

### 10.5 invalidTokens 자동 정리 흐름

```
1. NtfySubscriber가 메시지 수신
2. MessageParser가 PushPayload로 변환
3. DeviceRegistry.getTokensByWalletId()로 토큰 조회
4. IPushProvider.send(tokens, payload) 호출
5. PushResult.invalidTokens에 무효 토큰 포함 (FCM 404/410)
6. DeviceRegistry.removeInvalidTokens(result.invalidTokens) 자동 호출
7. 다음 Push 전송 시 무효 토큰이 제외됨
```

### 10.6 Hono HTTP 서버

```typescript
// packages/push-relay/src/registry/device-routes.ts

import { OpenAPIHono } from '@hono/zod-openapi';
import { DeviceRegistrationSchema } from '../schemas.js';
import type { DeviceRegistry } from './device-registry.js';

function createDeviceRoutes(registry: DeviceRegistry): OpenAPIHono {
  const app = new OpenAPIHono();

  // POST /devices -- 디바이스 토큰 등록
  app.post('/devices', async (c) => {
    const body = await c.req.json();
    const parsed = DeviceRegistrationSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.errors }, 400);
    }

    const result = registry.upsert(parsed.data);
    return c.json(
      { status: result },
      result === 'created' ? 201 : 200,
    );
  });

  // DELETE /devices/:token -- 디바이스 토큰 해제
  app.delete('/devices/:token', (c) => {
    const token = decodeURIComponent(c.req.param('token'));
    registry.remove(token);
    return c.body(null, 204);
  });

  return app;
}
```

---

## 11. config.toml 스키마

### 11.1 설계 원칙

Push Relay Server는 WAIaaS 데몬과 **별도 패키지**(@waiaas/push-relay)로, WAIaaS의 flat-key config 정책(`CLAUDE.md`의 "No nesting in config.toml")이 **적용되지 않는다**. 별도 config.toml에서 중첩 섹션을 사용한다.

단, TOML 최상위 키 네이밍은 일관성을 위해 `relay_` 접두어를 사용하여 WAIaaS 데몬 config와 혼동을 방지한다.

### 11.2 RelayConfigSchema Zod 정의

```typescript
// packages/push-relay/src/config.ts

import { z } from 'zod';

/**
 * Push Relay Server config.toml 스키마.
 * Zod SSoT 패턴 (WAIaaS 본체와 동일).
 */
const RelayConfigSchema = z.object({
  /** ntfy 구독 설정 */
  relay: z.object({
    /** ntfy 서버 URL (self-hosted 지원) */
    ntfy_server: z.string().url().default('https://ntfy.sh'),

    /** ntfy 토픽 접두어 (WAIaaS 데몬의 topic_prefix와 일치해야 함) */
    topic_prefix: z.string().default('waiaas'),

    /** 구독할 지갑 ID 목록. 각 ID에 대해 sign + notify 토픽 2개 구독 */
    wallet_ids: z.array(z.string()).min(1, 'At least one wallet_id required'),
  }),

  /** 푸시 프로바이더 선택 */
  relay_push: z.object({
    /** 사용할 푸시 프로바이더 */
    provider: z.enum(['pushwoosh', 'fcm']),
  }),

  /** Pushwoosh 프로바이더 설정 (provider가 "pushwoosh"일 때 필수) */
  relay_push_pushwoosh: z.object({
    /** Pushwoosh API Token */
    api_token: z.string(),

    /** Pushwoosh Application Code */
    application_code: z.string(),
  }).optional(),

  /** FCM 프로바이더 설정 (provider가 "fcm"일 때 필수) */
  relay_push_fcm: z.object({
    /** Google Cloud 프로젝트 ID */
    project_id: z.string(),

    /** Service Account Key JSON 파일 경로 */
    service_account_key_path: z.string(),
  }).optional(),

  /** HTTP 서버 설정 (Device Registry API) */
  relay_server: z.object({
    /** 서버 포트 */
    port: z.number().default(3100),

    /** 바인딩 호스트 */
    host: z.string().default('0.0.0.0'),
  }),
});

type RelayConfig = z.infer<typeof RelayConfigSchema>;
```

### 11.3 조건부 검증 규칙

`relay_push.provider` 값에 따라 해당 프로바이더 설정 섹션이 필수다:

| provider | 필수 섹션 | 검증 |
|----------|---------|------|
| `"pushwoosh"` | `relay_push_pushwoosh` | `api_token` + `application_code` 필수 |
| `"fcm"` | `relay_push_fcm` | `project_id` + `service_account_key_path` 필수 |

```typescript
/**
 * config 조건부 검증.
 * Zod superRefine으로 provider에 따른 섹션 존재 여부를 검증한다.
 */
const RelayConfigValidated = RelayConfigSchema.superRefine((config, ctx) => {
  if (config.relay_push.provider === 'pushwoosh' && !config.relay_push_pushwoosh) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'relay_push_pushwoosh section is required when provider is "pushwoosh"',
      path: ['relay_push_pushwoosh'],
    });
  }
  if (config.relay_push.provider === 'fcm' && !config.relay_push_fcm) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'relay_push_fcm section is required when provider is "fcm"',
      path: ['relay_push_fcm'],
    });
  }
});
```

### 11.4 TOML 구조 예시 (Pushwoosh)

```toml
# Push Relay Server config.toml -- Pushwoosh 프로바이더 사용

[relay]
ntfy_server = "https://ntfy.example.com"    # self-hosted ntfy
topic_prefix = "waiaas"                       # WAIaaS 데몬과 동일
wallet_ids = [
  "01935a3b-7c8d-7e00-b123-456789abcdef",
  "01935a3b-8d9e-7f00-c234-567890abcdef",
]

[relay_push]
provider = "pushwoosh"

[relay_push_pushwoosh]
api_token = "XXXXXX-XXXXXX"
application_code = "ABCDE-12345"

[relay_server]
port = 3100
host = "0.0.0.0"
```

### 11.5 TOML 구조 예시 (FCM)

```toml
# Push Relay Server config.toml -- FCM 프로바이더 사용

[relay]
ntfy_server = "https://ntfy.sh"
topic_prefix = "waiaas"
wallet_ids = ["01935a3b-7c8d-7e00-b123-456789abcdef"]

[relay_push]
provider = "fcm"

[relay_push_fcm]
project_id = "my-wallet-app"
service_account_key_path = "/etc/push-relay/service-account.json"

[relay_server]
port = 3100
host = "0.0.0.0"
```

### 11.6 환경변수 오버라이드

Docker 배포 시 config.toml 대신 환경변수로 설정을 주입할 수 있다:

| 환경변수 | config.toml 키 | 설명 |
|---------|---------------|------|
| `RELAY_NTFY_SERVER` | `relay.ntfy_server` | ntfy 서버 URL |
| `RELAY_TOPIC_PREFIX` | `relay.topic_prefix` | 토픽 접두어 |
| `RELAY_WALLET_IDS` | `relay.wallet_ids` | 콤마 구분 지갑 ID |
| `RELAY_PUSH_PROVIDER` | `relay_push.provider` | 프로바이더 (`pushwoosh`/`fcm`) |
| `RELAY_PUSHWOOSH_API_TOKEN` | `relay_push_pushwoosh.api_token` | Pushwoosh API Token |
| `RELAY_PUSHWOOSH_APP_CODE` | `relay_push_pushwoosh.application_code` | Pushwoosh App Code |
| `RELAY_FCM_PROJECT_ID` | `relay_push_fcm.project_id` | GCP 프로젝트 ID |
| `RELAY_FCM_KEY_PATH` | `relay_push_fcm.service_account_key_path` | SA Key 파일 경로 |
| `RELAY_SERVER_PORT` | `relay_server.port` | 서버 포트 |
| `RELAY_SERVER_HOST` | `relay_server.host` | 바인딩 호스트 |

우선순위: 환경변수 > config.toml > 기본값

### 11.7 config.example.toml

```toml
# Push Relay Server Configuration
# Copy to config.toml and edit values

# --- ntfy Subscription ---
[relay]
# ntfy server URL (use self-hosted for production)
ntfy_server = "https://ntfy.sh"

# Topic prefix (must match WAIaaS daemon's signing_sdk.ntfy_request_topic_prefix base)
topic_prefix = "waiaas"

# Wallet IDs to subscribe (sign + notify topics per wallet)
wallet_ids = ["your-wallet-uuid-here"]

# --- Push Provider ---
[relay_push]
# Push provider: "pushwoosh" or "fcm"
provider = "pushwoosh"

# --- Pushwoosh Settings (when provider = "pushwoosh") ---
[relay_push_pushwoosh]
api_token = "YOUR_PUSHWOOSH_API_TOKEN"
application_code = "YOUR_APP_CODE"

# --- FCM Settings (when provider = "fcm") ---
# [relay_push_fcm]
# project_id = "your-gcp-project-id"
# service_account_key_path = "/path/to/service-account.json"

# --- HTTP Server (Device Registry API) ---
[relay_server]
port = 3100
host = "0.0.0.0"
```

---

## 12. Docker 배포 설계

### 12.1 Dockerfile

```dockerfile
# packages/push-relay/Dockerfile
# Push Relay Server -- 멀티스테이지 빌드

# ---- Build Stage ----
FROM node:22-alpine AS build

WORKDIR /app

# 의존성 설치 (lockfile 캐시 활용)
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

# 소스 복사 + 빌드
COPY tsconfig.json ./
COPY src/ ./src/
RUN pnpm build

# ---- Production Stage ----
FROM node:22-alpine AS production

WORKDIR /app

# 프로덕션 의존성만 설치
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --prod

# 빌드 결과 복사
COPY --from=build /app/dist ./dist

# config.example.toml 포함 (참조용)
COPY config.example.toml ./

# 비루트 사용자
RUN addgroup -g 1001 -S relay && adduser -S relay -u 1001
USER relay

# 볼륨 마운트 포인트
VOLUME ["/data", "/config"]

# Device Registry API 포트
EXPOSE 3100

# 환경변수 기본값
ENV NODE_ENV=production

# 시작 명령
CMD ["node", "dist/index.js", "--config", "/config/config.toml", "--db", "/data/relay.db"]
```

### 12.2 docker-compose.yml

```yaml
# packages/push-relay/docker-compose.yml
# Push Relay Server 배포

services:
  push-relay:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: waiaas-push-relay
    restart: unless-stopped
    ports:
      - "3100:3100"           # Device Registry API
    volumes:
      - relay-data:/data       # relay.db (디바이스 토큰 DB)
      - ./config:/config       # config.toml
    environment:
      - NODE_ENV=production
    # 환경변수로 config 오버라이드 가능
    # environment:
    #   - RELAY_NTFY_SERVER=https://ntfy.example.com
    #   - RELAY_PUSH_PROVIDER=pushwoosh
    #   - RELAY_PUSHWOOSH_API_TOKEN=XXXXXX
    #   - RELAY_PUSHWOOSH_APP_CODE=ABCDE

  # (선택) self-hosted ntfy 서버 동시 배포
  # ntfy:
  #   image: binwiederhier/ntfy:latest
  #   container_name: waiaas-ntfy
  #   restart: unless-stopped
  #   ports:
  #     - "8080:80"
  #   volumes:
  #     - ntfy-cache:/var/cache/ntfy
  #     - ntfy-data:/var/lib/ntfy
  #   command: serve
  #   environment:
  #     - NTFY_BASE_URL=https://ntfy.example.com

volumes:
  relay-data:
    driver: local
  # ntfy-cache:
  #   driver: local
  # ntfy-data:
  #   driver: local
```

### 12.3 볼륨 구조

| 볼륨 | 컨테이너 경로 | 내용 | 백업 필요 |
|------|-------------|------|----------|
| `relay-data` | `/data` | `relay.db` (디바이스 토큰 SQLite) | O (토큰 유실 시 재등록 필요) |
| `./config` | `/config` | `config.toml` (바인드 마운트) | O (설정 파일) |

### 12.4 배포 가이드 개요

```
1. config.toml 작성
   $ cp config.example.toml config/config.toml
   $ vi config/config.toml
   → wallet_ids, provider, 인증 정보 설정

2. 컨테이너 시작
   $ docker-compose up -d

3. 로그 확인
   $ docker-compose logs -f push-relay
   → "[NtfySubscriber] Subscribing to 2 topics: ..."
   → "[push-relay] Server started on 0.0.0.0:3100"

4. 디바이스 토큰 등록 (지갑 앱에서 호출)
   $ curl -X POST http://localhost:3100/devices \
     -H "Content-Type: application/json" \
     -d '{"walletId":"wallet-uuid","pushToken":"device-token","platform":"ios"}'

5. 동작 확인
   → WAIaaS 데몬에서 서명 요청 또는 알림 발생
   → Push Relay가 ntfy 메시지 수신
   → Pushwoosh/FCM으로 푸시 전달
   → 지갑 앱에서 네이티브 푸시 수신
```

### 12.5 파일/모듈 구조 (최종)

```
packages/push-relay/                        # @waiaas/push-relay 패키지
  src/
    index.ts                                # 진입점 (config 로딩 → 서버 시작 → 구독 시작)
    config.ts                               # TOML config 로딩 + Zod 검증 + 환경변수 오버라이드
    schemas.ts                              # PushPayloadSchema, PushResultSchema, DeviceRegistrationSchema
    server.ts                               # Hono HTTP 서버 (Device Registry API)
    subscriber/
      ntfy-subscriber.ts                    # ntfy SSE 구독 + 재연결 관리
      message-parser.ts                     # ntfy 메시지 → PushPayload 변환 (토픽 패턴 분기)
      build-topics.ts                       # walletId → 토픽 목록 생성
    providers/
      push-provider.ts                      # IPushProvider 인터페이스
      pushwoosh-provider.ts                 # Pushwoosh createMessage API 연동
      fcm-provider.ts                       # FCM HTTP v1 API 연동 + OAuth2 인증
      create-provider.ts                    # 프로바이더 팩토리
    registry/
      device-registry.ts                    # SQLite 디바이스 토큰 CRUD + invalidTokens 정리
      device-routes.ts                      # POST/DELETE /devices Hono 라우트
  Dockerfile                                # 멀티스테이지 빌드 (node:22-alpine)
  docker-compose.yml                        # push-relay + (선택적) ntfy 서비스
  config.example.toml                       # 설정 예시 (전체 옵션 주석 포함)
  package.json                              # @waiaas/push-relay
  tsconfig.json                             # TypeScript 설정
```

---

## 13. 기술 결정 요약

### 13.1 알림 채널 설계 결정 (m26-02)

| # | 결정 항목 | 결정 | 근거 |
|---|----------|------|------|
| 1 | 토픽 분리 (sign vs notify) | `waiaas-sign-*` / `waiaas-notify-*` 접두어로 분리 | 서명 요청(긴급)과 일반 알림(정보성)의 priority 차등 적용. 지갑 앱이 토픽 수준에서 자연스럽게 구분 |
| 2 | 알림 대상 (sdk_ntfy 지갑만) | `owner_approval_method === 'sdk_ntfy'`인 지갑만 알림 전송 | SDK 미사용 지갑에 불필요한 ntfy 메시지 방지. 기존 채널(Telegram/Discord)과 병행 |
| 3 | 카테고리 필터링 (config 기반) | SettingsService `signing_sdk.notify_categories`로 필터 | Admin이 관심 없는 카테고리를 제외 가능. 빈 배열=전체 통과 (기본값) |
| 4 | 기존 알림 병행 (추가 채널) | WalletNotificationChannel을 NotificationService에 추가 (기존 채널 유지) | 기존 Telegram/Discord/Slack/ntfy 채널과 동시 동작. broadcast 이벤트도 지갑 앱에 전달 |

### 13.2 Push Relay Server 설계 결정 (m26-03)

| # | 결정 항목 | 결정 | 근거 |
|---|----------|------|------|
| 1 | 프레임워크 | Hono (OpenAPIHono) | WAIaaS 본체와 동일한 코드 패턴. 경량, Node.js/Bun/Deno 지원 |
| 2 | 디바이스 저장소 | SQLite 단일 파일 (relay.db) | 외부 DB 불필요, 배포 단순화, WAIaaS와 동일 패턴 (Drizzle ORM) |
| 3 | 기본 프로바이더 | Pushwoosh + FCM 2종 | D'CENT가 Pushwoosh 사용, FCM은 가장 범용적. IPushProvider 인터페이스로 추가 프로바이더 확장 가능 |
| 4 | ntfy 구독 방식 | SSE (EventSource) | WebSocket보다 단순, HTTP/2 호환, 재연결 로직 간단. ntfy의 다중 토픽 SSE 구독 네이티브 지원 |
| 5 | 배포 방식 | Docker + docker-compose | 지갑 개발사가 자체 인프라에 원클릭 배포 가능. Volume으로 DB + config 분리 |
| 6 | 운영 주체 | 지갑 개발사 | WAIaaS self-hosted 원칙 유지. Pushwoosh/FCM 인증 정보는 지갑사 소유이므로 지갑사가 운영 |

### 13.3 문서 메타데이터

| 항목 | 내용 |
|------|------|
| 문서 번호 | 75 |
| 생성일 | 2026-02-20 (Plan 200-01) |
| 최종 수정일 | 2026-02-20 (Plan 200-02) |
| 선행 문서 | doc 73 (Signing Protocol v1), doc 74 (Wallet SDK + Daemon Components), doc 35 (알림 시스템 설계) |
| 관련 마일스톤 | m26-02 (알림 채널), m26-03 (Push Relay Server) |
| Sections 1-5 범위 | 알림 채널 설계 (NOTIF-01/02/03) |
| Sections 6-13 범위 | Push Relay Server 설계 (RELAY-01/02/03/04) |
| 총 섹션 | 13개 |

---

*문서 번호: 75*
*생성일: 2026-02-20*
*최종 수정: 2026-02-20*
*선행 문서: 73(Signing Protocol v1), 74(Wallet SDK + Daemon Components), 35(알림 시스템 설계)*
*관련 마일스톤: m26-02(알림 채널), m26-03(Push Relay Server)*
*범위: 알림 채널 설계 (Sections 1-5) + Push Relay Server 설계 (Sections 6-13)*
