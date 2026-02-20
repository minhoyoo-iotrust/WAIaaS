# 마일스톤 m26-03: Push Relay Server

- **Status:** PLANNED
- **Milestone:** TBD

## 목표

ntfy 토픽을 구독하여 지갑 개발사의 기존 푸시 인프라(Pushwoosh, FCM 등)로 변환·전달하는 경량 중계 서버를 구현하여, ntfy SDK를 앱에 직접 내장할 수 없는 지갑 개발사가 기존 푸시 파이프라인만으로 WAIaaS 서명 요청과 알림을 수신할 수 있는 상태.

---

## 배경

### 지갑 앱의 ntfy 직접 통합 한계

m26-01에서 WAIaaS는 ntfy 토픽을 통해 서명 요청을 전달한다. 지갑 앱이 ntfy SSE/WebSocket을 직접 구독하면 서버 없이 동작하지만, 실제 지갑 개발사 환경에서는 한계가 있다:

| 한계 | 설명 |
|------|------|
| iOS 백그라운드 제약 | SSE/WebSocket 연결이 백그라운드에서 끊김. 네이티브 푸시(APNs)만 안정적 |
| 기존 인프라 중복 | 대부분의 지갑 앱은 이미 푸시 서비스를 운영 중 (D'CENT → Pushwoosh) |
| 앱 아키텍처 변경 | ntfy SDK 내장은 앱 구조 변경 필요. 기존 푸시 파이프라인 활용이 효율적 |

### 3가지 통합 옵션

| 옵션 | 서버 필요 | 장점 | 대상 |
|------|----------|------|------|
| A. ntfy 직접 | 불필요 | 가장 단순 | ntfy SDK 내장 가능한 앱 |
| **B. Push Relay** | **지갑사 서버** | **기존 푸시 인프라 재사용** | **D'CENT 등 기존 앱** |
| C. 자체 구현 | 지갑사 서버 | 완전 커스텀 | 독자 프로토콜 원하는 앱 |

---

## 선행 변경: 데몬 SignRequest 인코딩 통일

### 현재 상태

데몬의 두 채널이 ntfy에 메시지를 publish할 때 **서로 다른 인코딩**을 사용한다:

| 채널 | ntfy `message` 필드 | 인코딩 | Relay 파싱 |
|------|---------------------|--------|-----------|
| NtfySigningChannel (서명 요청) | displayMessage 텍스트 | 없음 (plain text) | **전체 SignRequest 접근 불가** |
| WalletNotificationChannel (알림) | NotificationMessage JSON | base64url | 전체 데이터 접근 가능 |

Relay가 Push payload `data` 필드에 전체 SignRequest를 포함하려면, ntfy SSE 스트림에서 전체 데이터를 수신할 수 있어야 한다.

### 필요한 변경

NtfySigningChannel의 ntfy publish 형식을 알림 채널과 동일한 base64url 패턴으로 변경:

```
Before (현재):
  message: displayMessage (plain text)
  title: "WAIaaS Sign Request"

After (변경):
  message: base64url(JSON.stringify(SignRequest))
  title: displayMessage
```

**변경 범위:**
- `packages/daemon/src/services/signing-sdk/channels/ntfy-signing-channel.ts` — publish 형식 변경
- `packages/wallet-sdk/src/channels/ntfy.ts` — `subscribeToRequests()`가 base64url 디코딩 사용 (기존 `parseSignRequest` 패턴 재사용)
- 기존 테스트 업데이트

**장점:** 서명 요청과 알림 모두 동일한 base64url 인코딩 패턴 → Relay 파서가 단일 로직으로 처리 가능. ntfy 데스크톱 알림 UI에는 `title` (displayMessage)이 표시되어 사용자 경험 유지.

> 이 변경은 m26-03 Phase의 첫 번째 plan으로 포함하여 Relay 구현 전에 선행한다.

---

## 구현 대상

### 아키텍처

```
WAIaaS 데몬
  │
  ├── ntfy publish (서명 요청)
  │     토픽: {sign_topic_prefix}-{walletName}
  │     body: base64url(SignRequest JSON)
  │
  └── ntfy publish (알림)
        토픽: waiaas-notify-{walletName}
        body: base64url(NotificationMessage JSON)
            │
            ▼
    ┌─────────────────────────────┐
    │     Push Relay Server        │
    │     (@waiaas/push-relay)     │
    │                              │
    │  ntfy SSE Subscriber         │
    │       │                      │
    │       ▼                      │
    │  Message Parser              │
    │   (base64url → JSON)         │
    │       │                      │
    │       ▼                      │
    │  IPushProvider               │
    │   ├── PushwooshProvider      │
    │   └── FcmProvider            │
    │       │                      │
    │  Device Token Registry       │
    └──────│──────────────────────┘
           ▼
    Pushwoosh / FCM / APNs
           │
           ▼
       지갑 앱 (네이티브 푸시 수신)
```

### 컴포넌트

#### 1. ntfy SSE Subscriber

| 항목 | 내용 |
|------|------|
| 역할 | ntfy 토픽을 SSE로 구독하여 메시지 수신 |
| 구독 대상 | 등록된 모든 walletName의 서명 + 알림 토픽 |
| 재연결 | 연결 끊김 시 지수 백오프 재연결 (1s/2s/4s/8s, 최대 60s) |
| self-hosted ntfy | config.toml `ntfy_server` 설정으로 self-hosted ntfy 서버 지원 |

**토픽 구성:** walletName 기반 (walletId 아님). 데몬의 `sign-request-builder.ts`와 `wallet-notification-channel.ts`가 walletName으로 토픽을 구성한다.

```
서명 토픽: {sign_topic_prefix}-{walletName}    (예: waiaas-sign-dcent)
알림 토픽: waiaas-notify-{walletName}          (예: waiaas-notify-dcent)
```

#### 2. IPushProvider 인터페이스

```typescript
interface IPushProvider {
  readonly name: string;
  send(tokens: string[], payload: PushPayload): Promise<PushResult>;
  validateConfig(): Promise<boolean>;
}

interface PushPayload {
  title: string;
  body: string;
  data: Record<string, string>;   // base64url 디코딩된 SignRequest/NotificationMessage JSON
  category: 'sign_request' | 'notification';
  priority: 'high' | 'normal';
}

interface PushResult {
  sent: number;
  failed: number;
  invalidTokens: string[];        // 실패한 토큰 (자동 정리용)
}
```

#### 3. PushwooshProvider (D'CENT 기본)

| 항목 | 내용 |
|------|------|
| API | `POST https://cp.pushwoosh.com/json/1.3/createMessage` |
| 인증 | API Token + Application Code |
| 페이로드 매핑 | PushPayload → Pushwoosh `content`, `data`, `ios_root_params` |
| 디바이스 타겟 | `devices` 배열 (Hardware ID 또는 Push Token) |

```toml
[relay.push.pushwoosh]
api_token = "XXXXXX-XXXXXX"
application_code = "ABCDE-12345"
```

#### 4. FcmProvider (범용)

| 항목 | 내용 |
|------|------|
| API | `POST https://fcm.googleapis.com/v1/projects/{project_id}/messages:send` |
| 인증 | Google Service Account Key (JSON 파일) |
| 페이로드 매핑 | PushPayload → FCM `notification` + `data` |
| 디바이스 타겟 | FCM Registration Token |

```toml
[relay.push.fcm]
project_id = "my-wallet-app"
service_account_key_path = "/etc/push-relay/service-account.json"
```

#### 5. Device Token Registry

지갑 앱이 자신의 푸시 토큰을 Relay Server에 등록하는 API. **API 키 인증**으로 무단 등록을 방지한다.

| 메서드 | 경로 | 인증 | 설명 |
|--------|------|------|------|
| POST | /devices | API Key | 디바이스 토큰 등록 (walletName + pushToken + platform) |
| DELETE | /devices/:token | API Key | 디바이스 토큰 해제 |
| GET | /health | 없음 | 헬스체크 (ntfy 연결 상태 + Push 프로바이더 상태) |

```typescript
const DeviceRegistrationSchema = z.object({
  walletName: z.string(),           // ntfy 토픽 대응 (walletId 아닌 walletName)
  pushToken: z.string(),
  platform: z.enum(['ios', 'android']),
});
```

**인증**: `X-API-Key` 헤더로 API 키 검증. API 키는 config.toml `[relay.server] api_key`에 설정. 지갑 개발사가 자체 Relay를 운영하므로 단일 API 키로 충분.

저장소: SQLite 단일 파일 (relay.db) — 인메모리 캐시 + 디스크 지속.

#### 6. ntfy 메시지 파싱 규격

WAIaaS 데몬은 ntfy HTTP publish API로 메시지를 전송한다. Relay는 ntfy SSE 스트림에서 수신한 메시지를 다음 규칙으로 파싱한다:

| ntfy SSE 필드 | 서명 요청 (`*-sign-*`) | 알림 (`*-notify-*`) |
|---------------|----------------------|---------------------|
| `topic` | 토픽 이름으로 유형 판별 | 토픽 이름으로 유형 판별 |
| `message` | base64url(SignRequest JSON) | base64url(NotificationMessage JSON) |
| `title` | displayMessage (사람 읽기용) | NotificationMessage.title |
| `priority` | 5 (urgent) | 3 (default) 또는 5 (security_alert) |
| `tags` | `waiaas,sign` | `waiaas,{category}` |

**파싱 흐름 (양쪽 동일):**
1. `topic` 패턴으로 메시지 유형 판별 (`*-sign-*` vs `*-notify-*`)
2. `message` 필드를 base64url 디코딩 → JSON.parse
3. Zod 스키마 검증 (SignRequestSchema 또는 NotificationMessageSchema)
4. PushPayload 생성: `title` + `body` + `data`(디코딩된 JSON) + `category` + `priority`

**토픽 구성 규칙:**
- 서명: `{sign_topic_prefix}-{walletName}` (기본: `waiaas-sign-{walletName}`)
- 알림: `waiaas-notify-{walletName}` (하드코딩, 설정 키 없음)

> 서명 토픽 프리픽스는 데몬의 `signing_sdk.ntfy_request_topic_prefix`로 변경 가능하나, 알림 토픽 프리픽스는 현재 하드코딩이다. Relay config의 `sign_topic_prefix`는 데몬 설정과 반드시 일치해야 한다.

#### 7. 메시지 변환 매핑

| ntfy 메시지 유형 | Push 카테고리 | 제목 | 본문 | data 필드 |
|-----------------|-------------|------|------|-----------|
| 서명 요청 (`*-sign-*`) | `sign_request` | ntfy `title` (displayMessage) | SignRequest.metadata.type + amount 요약 | **전체 SignRequest JSON** |
| 일반 알림 (`*-notify-*`) | `notification` | NotificationMessage.title | NotificationMessage.body | **전체 NotificationMessage JSON** |

**ntfy → Push 우선순위 매핑:**

| ntfy priority | Push 우선순위 | 용도 |
|--------------|-------------|------|
| 5 (urgent) | Pushwoosh: `"priority": "high"` / FCM: `"priority": "high"` | 서명 요청 + security_alert |
| 3 (default) | Pushwoosh: `"priority": "normal"` / FCM: `"priority": "normal"` | 일반 알림 (정보성) |

서명 요청과 알림 모두 base64url 디코딩 후 전체 JSON을 Push `data` 필드에 포함한다. 지갑 앱은 `data`에서 SignRequest를 파싱하여 서명 UI를 바로 표시할 수 있다.

#### 8. Push 전송 실패 시 재시도 정책

| 실패 유형 | 동작 |
|----------|------|
| 일시적 네트워크 오류 (5xx, timeout) | 지수 백오프 재시도 (1s/2s/4s, 최대 3회) |
| 인증 실패 (401/403) | 재시도 없음 + 에러 로그 |
| 잘못된 토큰 (invalidTokens) | 재시도 없음 + DB에서 자동 삭제 |

### config.toml (push-relay 전용)

> **참고**: Push Relay Server는 WAIaaS 데몬과 별도 패키지(@waiaas/push-relay)로, WAIaaS의 flat-key config 정책(`detectNestedSections`)이 적용되지 않는다. 자체 config.toml에서 중첩 섹션을 사용한다.

```toml
[relay]
ntfy_server = "https://ntfy.sh"           # ntfy 서버 — WAIaaS 데몬과 동일 서버를 가리켜야 함
sign_topic_prefix = "waiaas-sign"          # 서명 토픽 접두어 — 데몬의 signing_sdk.ntfy_request_topic_prefix와 일치 필요
notify_topic_prefix = "waiaas-notify"      # 알림 토픽 접두어 — 현재 데몬에서 하드코딩된 값
wallet_names = ["dcent", "trading-bot"]    # 구독할 월렛 이름 목록 (ntfy 토픽은 walletName 기반)

[relay.push]
provider = "pushwoosh"                      # "pushwoosh" | "fcm"

[relay.push.pushwoosh]
api_token = "XXXXXX-XXXXXX"
application_code = "ABCDE-12345"

# 또는 FCM 사용 시:
# [relay.push.fcm]
# project_id = "my-wallet-app"
# service_account_key_path = "/etc/push-relay/service-account.json"

[relay.server]
port = 3200                                 # Device Registry API 포트 (WAIaaS 데몬 기본 3100과 충돌 방지)
host = "0.0.0.0"
api_key = "your-secret-api-key"             # Device Registry API 인증 키
```

> **wallet_names 정적 관리**: 초기 버전은 config.toml에 지갑 이름을 수동 나열한다. 지갑 추가/삭제/이름변경 시 config 수정 + Relay 재시작이 필요하다. 동적 디스커버리(WAIaaS API 폴링)는 후속 확장으로 분리.

> **walletName vs walletId**: 데몬의 ntfy 토픽은 walletName 기반으로 구성된다 (`sign-request-builder.ts`, `wallet-notification-channel.ts`). walletName은 사람이 읽기 쉬운 식별자이며, WalletLinkRegistry에서 owner_approval_method=sdk_ntfy 지갑의 이름으로 설정된다. Relay config에도 walletName을 사용한다.

### Graceful Shutdown

SIGTERM/SIGINT 수신 시:
1. ntfy SSE 연결 종료
2. 대기 중인 Push 전송 완료 (최대 10초)
3. SQLite 연결 종료
4. process.exit(0)

### 파일/모듈 구조

```
packages/push-relay/                        # @waiaas/push-relay 패키지
  src/
    index.ts                                # 진입점 (서버 시작 + graceful shutdown)
    config.ts                               # TOML config 로딩 + Zod 검증
    subscriber/
      ntfy-subscriber.ts                    # ntfy SSE 구독 + 재연결
      message-parser.ts                     # ntfy 메시지 파싱 (base64url 디코딩 + Zod 검증)
    providers/
      push-provider.ts                      # IPushProvider 인터페이스
      pushwoosh-provider.ts                 # Pushwoosh API 연동
      fcm-provider.ts                       # FCM API 연동 (OAuth2 토큰 자동 갱신)
    registry/
      device-registry.ts                    # SQLite 디바이스 토큰 관리
      device-routes.ts                      # POST/DELETE /devices + GET /health
    middleware/
      api-key-auth.ts                       # X-API-Key 헤더 검증
    server.ts                               # Hono HTTP 서버 (Device Registry API)
  Dockerfile
  docker-compose.yml
  config.example.toml
  package.json
  tsconfig.json
```

---

## 기술 결정 사항

| # | 결정 항목 | 선택지 | 결정 근거 |
|---|----------|--------|----------|
| 1 | 프레임워크 | Hono (WAIaaS와 동일) | 코드 패턴 일관성, 경량, Node.js/Bun/Deno 지원 |
| 2 | 디바이스 저장소 | SQLite (단일 파일) | 외부 DB 불필요, 배포 단순화, WAIaaS와 동일 패턴 |
| 3 | 기본 프로바이더 | Pushwoosh + FCM | D'CENT가 Pushwoosh 사용, FCM은 가장 범용적. 추가 프로바이더는 IPushProvider 구현으로 확장 |
| 4 | ntfy 구독 방식 | SSE (EventSource) | WebSocket보다 단순, HTTP/2 호환, 재연결 로직 간단 |
| 5 | 배포 방식 | Docker + docker-compose | 지갑 개발사가 자체 인프라에 원클릭 배포 가능 |
| 6 | 운영 주체 | 지갑 개발사 | WAIaaS self-hosted 원칙 유지. Relay Server는 지갑사의 푸시 인증 정보를 사용하므로 지갑사가 운영 |
| 7 | SignRequest 인코딩 통일 | base64url (알림과 동일) | Relay 파서 단일화, ntfy title에 displayMessage 표시로 UX 유지, wallet-sdk parseSignRequest 패턴 재사용 |
| 8 | 토픽 식별자 | walletName (walletId 아님) | 데몬 구현(sign-request-builder.ts:162, wallet-notification-channel.ts:125)이 walletName 기반 |

---

## E2E 검증 시나리오

**자동화 비율: 100%**

### 데몬 SignRequest 인코딩 변경

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | SignRequest base64url 인코딩 | NtfySigningChannel publish → message 필드 base64url 디코딩 시 유효한 SignRequest JSON assert | [L0] |
| 2 | displayMessage title 이동 | NtfySigningChannel publish → title 필드에 displayMessage 텍스트 assert | [L0] |
| 3 | wallet-sdk 호환성 | subscribeToRequests → base64url message 디코딩 → 유효한 SignRequest assert | [L0] |

### ntfy → Push 변환

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 4 | 서명 요청 ntfy → Pushwoosh 전달 | mock ntfy SSE + mock Pushwoosh API → createMessage 호출 assert | [L0] |
| 5 | 서명 요청 ntfy → FCM 전달 | mock ntfy SSE + mock FCM API → messages:send 호출 assert | [L0] |
| 6 | 일반 알림 ntfy → Push 전달 | waiaas-notify-* 토픽 메시지 → PushPayload category='notification' assert | [L0] |
| 7 | SignRequest data 포함 | Push data 필드에 전체 SignRequest JSON (base64url 디코딩 결과) 포함 assert | [L0] |
| 8 | NotificationMessage data 포함 | Push data 필드에 전체 NotificationMessage JSON 포함 assert | [L0] |

### Device Token Registry

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 9 | 디바이스 등록 | POST /devices { walletName, pushToken, platform } → 201 assert | [L0] |
| 10 | 디바이스 해제 | DELETE /devices/:token → 204 + 이후 Push 미전송 assert | [L0] |
| 11 | 중복 등록 | 동일 pushToken 재등록 → upsert (에러 아님) assert | [L0] |
| 12 | 잘못된 토큰 자동 정리 | Push 전송 실패 (invalidTokens) → DB에서 자동 삭제 assert | [L0] |

### 연결 관리

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 13 | ntfy SSE 재연결 | 연결 끊김 → 지수 백오프 → 재연결 성공 assert | [L0] |
| 14 | config 검증 | 잘못된 API Token → validateConfig() false + 시작 시 에러 메시지 assert | [L0] |
| 15 | 다중 월렛 구독 | wallet_names 3개 → 서명+알림 토픽 6개 구독 assert | [L0] |

### Pushwoosh 특화

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 16 | Pushwoosh 페이로드 포맷 | createMessage body → content, data, ios_root_params 올바른 구조 assert | [L0] |
| 17 | Pushwoosh 인증 실패 | 잘못된 api_token → 에러 로그 + 재시도 없음 assert | [L0] |

### 인증 + 헬스체크 + Graceful Shutdown

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 18 | Device API 인증 | X-API-Key 미포함 → 401 assert | [L0] |
| 19 | 헬스체크 | GET /health → ntfy 연결 상태 + Push 프로바이더 상태 반환 assert | [L0] |
| 20 | Graceful Shutdown | SIGTERM → 대기 중 Push 전송 완료 + SSE 연결 종료 + exit(0) assert | [L0] |
| 21 | ntfy 우선순위 매핑 | priority 5 → Push high, priority 3 → Push normal assert | [L0] |
| 22 | Push 재시도 | 5xx 응답 → 지수 백오프 3회 재시도 → 성공 assert | [L0] |

---

## 의존

| 의존 대상 | 상태 | 이유 |
|----------|------|------|
| m26-01 (Signing SDK) | ✅ SHIPPED (v2.6.1) | ntfy 서명 토픽 구조, SignRequest 스키마 |
| m26-02 (알림 채널) | ✅ SHIPPED (v2.7) | ntfy 알림 토픽 구조, NotificationMessage 스키마 |
| **동일 ntfy 서버** | 운영 요구 | WAIaaS 데몬과 Relay가 같은 ntfy 서버를 바라봐야 함. 데몬의 `signing_sdk.ntfy_server`와 Relay의 `relay.ntfy_server`가 일치해야 토픽 메시지 수신 가능 |

---

## 리스크

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| 1 | Pushwoosh API 변경 | Provider 호출 실패 | API 버전 고정 (1.3), 에러 응답 로깅으로 빠른 감지 |
| 2 | ntfy SSE 장시간 연결 불안정 | 서명 요청 수신 지연 | 자동 재연결 + heartbeat 감지 (ntfy keepalive 30초) |
| 3 | 디바이스 토큰 관리 부담 | 지갑사 추가 작업 | 토큰 등록 API 2개만 구현하면 완료. invalidTokens 자동 정리로 관리 최소화 |
| 4 | wallet_names 수동 관리 | 지갑 이름변경/추가 시 config 수정 + 재시작 필요 | 초기 버전은 수동 관리. 동적 디스커버리는 후속 확장 |
| 5 | SignRequest 인코딩 변경 | 기존 wallet-sdk subscribeToRequests 호환성 | wallet-sdk 동시 업데이트 + 테스트 검증 |

---

## 예상 규모

| 항목 | 예상 |
|------|------|
| 페이즈 | 2개 (데몬 인코딩 통일 + Relay 구현) |
| 신규 파일 | 12-15개 (데몬 변경 + push-relay 패키지 전체) |
| 테스트 | 22개 (데몬 3 + Relay 19) |
| DB | SQLite 1개 파일 (relay.db, 디바이스 토큰) |
| 신규 패키지 | @waiaas/push-relay (모노레포 packages/push-relay) |

---

## 문서 업데이트

m26-03 완료 시 다음 문서를 갱신한다:

| 문서 | 추가 내용 |
|------|----------|
| `packages/push-relay/README.md` | npm 패키지 README: 설치, config.toml 설정, Docker 배포, API 레퍼런스 |
| `README.md` (루트) | Documentation 테이블에 Push Relay 가이드 링크 추가 |
| `skills/wallet.skill.md` | Push Relay 통합 옵션 (옵션 B) 간략 안내 |

> `docs/wallet-sdk-integration.md`는 현재 미생성 상태. Push Relay 통합 가이드는 push-relay 패키지 README에 자체 포함하고, 향후 통합 문서 생성 시 링크를 추가한다.

---

## 배포 인프라

`@waiaas/push-relay`는 WAIaaS 모노레포 내 별도 패키지로 관리하며, 기존 배포 파이프라인(release-please + release.yml)에 통합한다.

> **wallet-sdk**: `@waiaas/wallet-sdk`는 daemon이 의존하는 공유 스키마를 포함하므로 다른 패키지와 동일하게 배포한다 (별도 Docker 이미지 없음).
> **push-relay**: 독립 실행 서버이므로 npm 패키지 + 전용 Docker 이미지로 배포한다.

### 모노레포 등록

| 항목 | 설정 |
|------|------|
| 패키지 경로 | `packages/push-relay` |
| 패키지명 | `@waiaas/push-relay` |
| `turbo.json` | `build`, `test`, `lint`, `typecheck` 파이프라인에 push-relay 자동 포함 (Turbo workspace 자동 해석) |
| `pnpm-workspace.yaml` | 기존 glob `packages/*`로 자동 포함 (별도 등록 불필요) |

### release-please 설정

`release-please-config.json`에 패키지 등록:

```json
{
  "packages": {
    "packages/push-relay": {
      "release-type": "node",
      "component": "push-relay",
      "changelog-path": "CHANGELOG.md"
    }
  }
}
```

- 기존 prerelease 모드 설정 (`versioning: "prerelease"`, `prerelease: true`, `prerelease-type: "rc"`) 동일 적용
- Conventional Commits로 독립 버전 관리

### CI 파이프라인 (release.yml)

| Job | 내용 |
|-----|------|
| quality-gate | 기존 job에 push-relay 빌드/테스트/lint/typecheck 포함 (turbo 자동) |
| npm-publish | `@waiaas/push-relay` npm OIDC Trusted Publishing (Sigstore provenance) |
| docker-push-relay | **신규 job** — `waiaas/push-relay` Docker 이미지 빌드 + Docker Hub/GHCR dual push |

> **release.yml 하드코딩 배열 업데이트**: 현재 npm publish/dry-run 배열이 4곳(L138, L163, L183, L323)에 하드코딩되어 있다. push-relay 추가 시 4곳 모두 업데이트 필요.

Docker 이미지 빌드:

```dockerfile
# packages/push-relay/Dockerfile
FROM node:22-alpine
WORKDIR /app
COPY packages/push-relay/dist ./dist
COPY packages/push-relay/package.json ./
RUN npm install --omit=dev
EXPOSE 3200
CMD ["node", "dist/index.js"]
```

### 테스트 커버리지 임계값

| 지표 | 임계값 |
|------|--------|
| Lines | 80% |
| Branches | 70% |
| Functions | 70% |

> daemon과 동일한 기준 적용. `vitest.config.ts`에 `coverage.thresholds` 설정.

### 배포 산출물 요약

| 산출물 | 대상 |
|--------|------|
| `@waiaas/push-relay` npm | npmjs.com (OIDC Trusted Publishing) |
| `waiaas/push-relay` Docker | Docker Hub + GHCR dual push |
| `@waiaas/wallet-sdk` npm | npmjs.com (기존 파이프라인과 동일, 인코딩 변경 반영) |

---

*생성일: 2026-02-15*
*수정일: 2026-02-20 — v2.7 코드베이스 대조 검증 (8건 이슈 수정)*
*선행: m26-01 (Signing SDK, ✅ SHIPPED v2.6.1), m26-02 (알림 채널, ✅ SHIPPED v2.7)*
*관련: Pushwoosh API (https://docs.pushwoosh.com), Firebase Cloud Messaging*
