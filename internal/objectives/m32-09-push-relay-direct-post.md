# 마일스톤 m32-09: Push Relay 직접 연동 (ntfy.sh 제거)

- **Status:** PLANNED
- **Milestone:** v32.9

## 목표

WAIaaS 데몬이 ntfy.sh를 경유하지 않고 Push Relay 서버에 직접 메시지를 POST하도록 전환한다. 서명 응답도 ntfy.sh SSE 대신 Push Relay long-polling으로 수신한다. ntfy.sh 의존성을 완전히 제거하여 동시 연결 수 제한 문제를 근본적으로 해결하고, 대규모 디바이스 확장이 가능한 아키텍처로 전환한다.

---

## 배경

### 현재 문제

1. **ntfy.sh SSE 동시 연결 제한**: Push Relay가 디바이스별 토픽(sign + notify)을 개별 SSE로 구독하여 디바이스 6개 = 14개 SSE 연결 발생. ntfy.sh는 IP당 동시 구독 30개로 제한되어 디바이스 증가 시 `Error: aborted` 일괄 연결 해제 발생.
2. **확장성 한계**: 디바이스가 수천~수만으로 증가하면 ntfy.sh 유료 플랜으로도 대응 불가.
3. **불필요한 외부 의존성**: WAIaaS 데몬 → ntfy.sh → Push Relay → 디바이스 경로에서 ntfy.sh는 단순 메시지 중계 역할만 수행.

### 실제 장애 로그 (DCent 연동)

```
[push-relay] [DEBUG] SSE connected: waiaas-sign-dcent-d6389959 (HTTP 200)
[push-relay] Error: aborted
[push-relay] [DEBUG] SSE error for waiaas-sign-dcent-d6389959, reconnecting in 2000ms (next=4000ms)
... (14개 연결 모두 동시 aborted)
```

### 아키텍처 변경

**서명 요청 (데몬 → 디바이스)**:
```
현재:  WAIaaS 데몬 → ntfy.sh → Push Relay (SSE 구독) → 디바이스
변경:  WAIaaS 데몬 → Push Relay (HTTP POST) → 디바이스
```

**서명 응답 (디바이스 → 데몬)**:
```
현재:  디바이스 → Push Relay → ntfy.sh → WAIaaS 데몬 (SSE 구독)
변경:  디바이스 → Push Relay (DB 저장) → WAIaaS 데몬 (long-polling)
```

Push Relay → 디바이스 구간(FCM/APNs/Pushwoosh 등 IPushProvider)은 변경 없음.

---

## 변경 범위

### 1. DB 스키마: 데몬 `wallet_apps` 테이블 (v60 마이그레이션)

현재 스키마 v59 기준. v60 마이그레이션으로 처리.

`push_relay_url` 컬럼 추가. 프리셋 wallet type은 기본값 자동 설정.

| wallet_type | push_relay_url 기본값 |
|-------------|----------------------|
| `dcent` | `https://waiaas-push.dcentwallet.com` |
| 향후 추가 프리셋 | 해당 지갑사 Push Relay URL |

- `push_relay_url`은 Admin UI에서 수정 가능
- `sign_topic`, `notify_topic` 컬럼 제거 (ntfy.sh 토픽 불필요)

```sql
-- v60 migration
ALTER TABLE wallet_apps ADD COLUMN push_relay_url TEXT;
UPDATE wallet_apps SET push_relay_url = 'https://waiaas-push.dcentwallet.com' WHERE wallet_type = 'dcent';
-- sign_topic, notify_topic 컬럼은 SQLite 제약상 DROP 불가 → NULL로 비우고 코드에서 미참조
```

### 2. DB 스키마: Push Relay `sign_responses` 테이블

Push Relay DB에 서명 응답 저장용 테이블 추가.

```sql
CREATE TABLE sign_responses (
  request_id TEXT PRIMARY KEY,
  response    TEXT NOT NULL,      -- JSON (SignResponse)
  expires_at  INTEGER NOT NULL,   -- Unix timestamp (seconds)
  created_at  INTEGER NOT NULL
);
```

**TTL 기반 자동 정리**:
- 서명 요청에 포함된 `expiresAt`을 응답 저장 시 동일 적용
- 주기적 정리: `DELETE FROM sign_responses WHERE expires_at < unixepoch()`
- 데몬이 polling하지 않아도 만료된 응답은 자동 삭제 (서명 요청 자체가 만료된 것이므로 보관 불필요)

### 3. 데몬: 서명 요청 전송 경로 변경

**서명 요청 (`sign-request-builder.ts`, `ntfy-signing-channel.ts`)**:
- ntfy.sh에 publish하는 로직을 Push Relay HTTP POST로 교체
- `wallet_apps.push_relay_url` + `subscriptionToken`으로 라우팅

**알림 전송 (`wallet-notification-channel.ts`)**:
- ntfy.sh 토픽 publish → Push Relay HTTP POST로 교체

**NtfyChannel (`ntfy.ts`) 제거**:
- 독립 알림 채널로서의 NtfyChannel 제거 (Push Relay로 통합)

### 4. 데몬: 서명 응답 수신 경로 변경 (ntfy.sh SSE → long-polling)

현재 데몬은 서명 요청 후 ntfy.sh `responseTopic`을 SSE로 구독하여 응답을 대기한다 (`ntfy-signing-channel.ts` `subscribeToResponseTopic`). 데몬은 로컬 환경(localhost)에서 실행되므로 외부에서 콜백 수신이 불가능하다. 따라서 Pull 방식(long-polling)으로 전환한다.

**현재 흐름**:
1. 디바이스가 서명 후 Push Relay `POST /v1/sign-response` 호출
2. Push Relay가 ntfy.sh `responseTopic`에 relay (`sign-response-routes.ts`)
3. 데몬이 ntfy.sh SSE로 응답 수신 → `SignResponseHandler` 처리

**변경 후 흐름**:
1. 디바이스가 서명 후 Push Relay `POST /v1/sign-response` 호출 (기존 그대로)
2. Push Relay가 ntfy.sh relay 대신 **자체 DB에 응답 저장**
3. 데몬이 Push Relay `GET /v1/sign-response/:requestId?timeout=300` long-polling으로 응답 대기
4. 응답 도착 시 즉시 반환 → `SignResponseHandler` 처리
5. timeout 내 응답 없으면 204 반환

**데몬 코드 변경**:
- `NtfySigningChannel` → `PushRelaySigningChannel`로 리네이밍 및 로직 교체
- `subscribeToResponseTopic()`: ntfy SSE 연결 → Push Relay long-polling 호출로 교체
- SSE 파서(`parseSseStream`) 제거
- 재연결 로직 제거 (long-polling은 단순 HTTP 요청이므로 재시도만 필요)

### 5. Push Relay: ntfy.sh 의존성 제거 + API 변경

**제거**:
- `ntfy-subscriber.ts`: ntfy.sh SSE 연결/재연결/토픽 관리 전체 제거
- `sign-response-routes.ts`: ntfy.sh relay 로직 제거
- `config.ts`: `ntfy_server`, `sign_topic_prefix`, `notify_topic_prefix` 설정 제거
- `bin.ts`: NtfySubscriber 초기화 및 토픽 복원 로직 제거
- `server.ts`: ServerOpts에서 ntfy 관련 필드 제거

**추가 — 서명 요청 수신 API**:
- `POST /v1/push`: WAIaaS 데몬으로부터 서명 요청/알림 메시지 수신
- 요청 바디: `{ subscriptionToken, category, payload }`
- Push Relay 내부에서 subscriptionToken → device-registry → IPushProvider 기존 라우팅 로직 유지

**변경 — 서명 응답 저장 + long-polling API**:
- `POST /v1/sign-response`: 디바이스로부터 서명 응답 수신 → ntfy.sh relay 대신 **DB에 저장**
- `GET /v1/sign-response/:requestId?timeout=300`: 데몬의 long-polling 요청 처리
  - 응답이 이미 DB에 있으면 즉시 반환
  - 없으면 timeout까지 대기 후 204 반환

**에러 처리**:
- Push Relay 다운 시 데몬은 서명 요청 POST 실패 → 트랜잭션을 PENDING_APPROVAL 상태로 유지, 에러 로그 기록
- long-polling 연결 실패 시 지수 백오프 재시도 (최대 3회), 최종 실패 시 서명 요청 만료 처리

### 6. 데몬: ntfy 설정 전면 정리

**config/loader.ts**:
- `ntfy_server`, `ntfy_topic` 기본값 및 스키마 필드 제거

**settings/setting-keys.ts**:
- `notifications.ntfy_server` 설정 키 제거

**settings/hot-reload.ts**:
- `NOTIFICATION_KEYS`에서 `'notifications.ntfy_server'` 제거 (hot-reload 트리거 정리)

### 7. Core 타입 변경: `ResponseChannel` + `ApprovalMethod`

**`@waiaas/core` signing-protocol.ts**:

`ResponseChannelSchema`에서 `type: 'ntfy'` 제거, `type: 'push_relay'` 추가:

```typescript
// 제거
export const NtfyResponseChannelSchema = z.object({
  type: z.literal('ntfy'),
  responseTopic: z.string(),
  serverUrl: z.string().url().optional(),
});

// 추가
export const PushRelayResponseChannelSchema = z.object({
  type: z.literal('push_relay'),
  pushRelayUrl: z.string().url(),
  requestId: z.string().uuid(),
});
```

`APPROVAL_METHODS` 변경:
```typescript
// 현재
export const APPROVAL_METHODS = ['sdk_ntfy', 'sdk_telegram', 'walletconnect', 'telegram_bot', 'rest'] as const;

// 변경
export const APPROVAL_METHODS = ['sdk_push', 'sdk_telegram', 'walletconnect', 'telegram_bot', 'rest'] as const;
```

`sign-request-builder.ts`에서 SignRequest 생성 시 `responseChannel`을 `type: 'push_relay'`로 구성.

### 8. Wallet SDK: ntfy 함수 deprecated 처리

`@waiaas/wallet-sdk`에서 ntfy 전용 함수를 deprecated 처리:

| 함수 | 현재 위치 | 처리 |
|------|----------|------|
| `sendViaNtfy()` | `channels/ntfy.ts` | deprecated 표시, 다음 메이저 버전에서 제거 |
| `subscribeToRequests()` | `channels/ntfy.ts` | deprecated 표시 (SSE 구독 불필요) |
| `subscribeToNotifications()` | `channels/ntfy.ts` | deprecated 표시 |
| `parseNotification()` | `channels/ntfy.ts` | deprecated 표시 |
| `sendViaRelay()` | `channels/relay.ts` | 유지 (기존 그대로) |
| `registerDevice()` | `channels/relay.ts` | 유지 |
| `unregisterDevice()` | `channels/relay.ts` | 유지 |
| `getSubscriptionToken()` | `channels/relay.ts` | 유지 |

지갑 앱(DCent 등)은 Push 알림(FCM/APNs)으로 서명 요청을 수신하므로 ntfy SSE 구독이 불필요해진다. `sendViaRelay()`로 서명 응답을 Push Relay에 POST하는 기존 경로는 변경 없음.

### 9. Approval Method 변경

**DB 값 변경**: `sdk_ntfy` → `sdk_push`

**프리셋 wallet type (DCent 등) — 고정**:
- Approval Method 라디오 버튼 비활성화
- "D'CENT Wallet은 Push Relay를 통해 서명합니다" 안내 표시

**custom wallet type — 조건부 표시**:
- `push_relay_url` 존재 시: Wallet App (Push) 옵션 표시
- `push_relay_url` 없을 시: Wallet App (Push) 옵션 숨김
- 나머지 옵션(Wallet App (Telegram), WalletConnect, Telegram Bot, REST API)은 기존 그대로

### 10. Admin UI 변경

**Register Wallet App 다이얼로그**:
- `Push Relay URL` 필드 추가
- Wallet Type에 프리셋 입력 시 URL 자동 채움 (수정 가능)
- custom일 때는 빈 필드로 직접 입력

**Registered Apps 카드**:

| 현재 | 변경 후 |
|------|---------|
| ntfy Topics | Push Relay |
| Sign Topic: waiaas-sign-dcent-2dbf607e | URL: https://waiaas-push.dcentwallet.com |
| Notify Topic: waiaas-notify-dcent-2dbf607e | Subscription Token: 2dbf**** |

**페이지 헤더**:
- "Push event notifications ... via ntfy" → "Push event notifications ... via Push Relay"

**Approval Method 라디오 버튼 라벨**:
- "Wallet App (ntfy)" → "Wallet App (Push)"
- "Push sign request via ntfy server" → "Push sign request to wallet app via Push Relay"

### 11. Auto (Global Fallback) 우선순위 변경

| 현재 | 변경 후 |
|------|---------|
| Wallet App (ntfy) > Wallet App (Telegram) > WalletConnect > Telegram Bot > REST | Wallet App (Push) > Wallet App (Telegram) > WalletConnect > Telegram Bot > REST |

---

## 영향받는 파일 전체 목록

### 데몬 (`packages/daemon/src/`)
| 파일 | 변경 내용 |
|------|----------|
| `services/signing-sdk/channels/ntfy-signing-channel.ts` | `PushRelaySigningChannel`로 리네이밍 + 로직 전면 교체 |
| `services/signing-sdk/sign-request-builder.ts` | responseChannel을 `type: 'push_relay'`로 구성 |
| `services/signing-sdk/channels/wallet-notification-channel.ts` | ntfy publish → Push Relay POST |
| `services/signing-sdk/approval-channel-router.ts` | `sdk_ntfy` → `sdk_push` 라우팅 |
| `notifications/channels/ntfy.ts` | 제거 |
| `infrastructure/config/loader.ts` | `ntfy_server`, `ntfy_topic` 제거 |
| `infrastructure/settings/setting-keys.ts` | `notifications.ntfy_server` 제거 |
| `infrastructure/settings/hot-reload.ts` | ntfy hot-reload 트리거 제거 |
| `infrastructure/database/migrate.ts` | v60 마이그레이션 추가 |

### Push Relay (`packages/push-relay/src/`)
| 파일 | 변경 내용 |
|------|----------|
| `subscriber/ntfy-subscriber.ts` | 전체 제거 |
| `relay/sign-response-routes.ts` | ntfy relay → DB 저장 + long-polling 응답 |
| `server.ts` | ntfy 옵션 제거, `POST /v1/push` 추가 |
| `config.ts` | ntfy 설정 키 제거 |
| `bin.ts` | NtfySubscriber 초기화 제거 |

### Core (`packages/core/src/`)
| 파일 | 변경 내용 |
|------|----------|
| `schemas/signing-protocol.ts` | ResponseChannel `ntfy` → `push_relay`, ApprovalMethod `sdk_ntfy` → `sdk_push` |

### Wallet SDK (`packages/wallet-sdk/src/`)
| 파일 | 변경 내용 |
|------|----------|
| `channels/ntfy.ts` | 전체 deprecated 표시 |

### Admin UI (`packages/admin/src/`)
| 파일 | 변경 내용 |
|------|----------|
| `pages/human-wallet-apps.tsx` | Push Relay URL 필드, ntfy 라벨 교체 |
| 지갑 상세 Approval Method UI | 프리셋 고정 + 조건부 표시 |

---

## 비목표 (Non-Goals)

- ntfy.sh 하위 호환 유지 (DCent Push Relay가 아직 라이브 전이므로 불필요)
- Push Relay → 디바이스 구간 변경 (기존 IPushProvider 유지)
- Wallet SDK의 `registerDevice`/`unregisterDevice` API 변경 (Push Relay 측 디바이스 등록 API는 그대로)
- Wallet SDK ntfy 함수 즉시 제거 (deprecated 처리 후 다음 메이저 버전에서 제거)

---

## 성공 기준

1. WAIaaS 데몬이 ntfy.sh에 대한 의존성 0건 (코드, 설정, 타입 모두)
2. Push Relay가 ntfy.sh SSE 연결 없이 동작
3. 디바이스 수 증가에 따른 SSE 연결 수 증가 없음
4. 서명 응답이 Push Relay long-polling을 통해 데몬에 정상 전달
5. Push Relay에 저장된 만료 서명 응답이 TTL 기반으로 자동 정리
6. Push Relay 다운 시 데몬이 graceful하게 에러 처리 (PENDING_APPROVAL 유지, 재시도)
7. DCent wallet type 등록 시 `push_relay_url` 기본값 `https://waiaas-push.dcentwallet.com` 자동 설정
8. Admin UI에서 Push Relay URL 확인 및 수정 가능
9. 프리셋 wallet type의 Approval Method 변경 불가 (UI 고정)
10. custom wallet type에서 `push_relay_url` 유무에 따른 Wallet App (Push) 옵션 조건부 표시
11. `@waiaas/core` ResponseChannel 및 ApprovalMethod 타입이 push_relay/sdk_push로 갱신
12. Wallet SDK ntfy 함수에 deprecated 표시
