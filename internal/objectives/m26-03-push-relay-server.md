# 마일스톤 m26-03: Push Relay Server

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

## 구현 대상

### 아키텍처

```
WAIaaS 데몬
  │
  ├── ntfy publish (서명 요청)
  │     토픽: waiaas-sign-{walletId}
  │
  └── ntfy publish (알림)
        토픽: waiaas-notify-{walletId}
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
| 구독 대상 | 등록된 모든 walletId의 서명 + 알림 토픽 |
| 재연결 | 연결 끊김 시 지수 백오프 재연결 (1s/2s/4s/8s, 최대 60s) |
| self-hosted ntfy | config.toml `ntfy_server` 설정으로 self-hosted ntfy 서버 지원 |

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
  data: Record<string, string>;   // SignRequest JSON 등 커스텀 데이터
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

지갑 앱이 자신의 푸시 토큰을 Relay Server에 등록하는 간단한 API.

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | /devices | 디바이스 토큰 등록 (walletId + pushToken + platform) |
| DELETE | /devices/:token | 디바이스 토큰 해제 |

```typescript
const DeviceRegistrationSchema = z.object({
  walletId: z.string(),
  pushToken: z.string(),
  platform: z.enum(['ios', 'android']),
});
```

저장소: SQLite 단일 파일 (relay.db) — 인메모리 캐시 + 디스크 지속.

#### 6. 메시지 변환 매핑

| ntfy 메시지 유형 | Push 카테고리 | 제목 | 본문 |
|-----------------|-------------|------|------|
| 서명 요청 (waiaas-sign-*) | `sign_request` | "Transaction Approval" | displayMessage (To/Amount/Type) |
| 일반 알림 (waiaas-notify-*) | `notification` | 이벤트 타입별 제목 | 이벤트 상세 |

서명 요청의 경우, Push 페이로드의 `data` 필드에 전체 SignRequest JSON을 포함하여 지갑 앱이 서명 UI를 바로 표시할 수 있게 한다.

### config.toml

```toml
[relay]
ntfy_server = "https://ntfy.sh"           # ntfy 서버 (self-hosted 가능)
topic_prefix = "waiaas"                     # 토픽 접두어
wallet_ids = ["wallet-uuid-1", "wallet-uuid-2"]  # 구독할 월렛 ID 목록

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
port = 3100                                 # Device Registry API 포트
host = "0.0.0.0"
```

### 파일/모듈 구조

```
packages/push-relay/                        # @waiaas/push-relay 패키지
  src/
    index.ts                                # 진입점 (서버 시작)
    config.ts                               # TOML config 로딩 + Zod 검증
    subscriber/
      ntfy-subscriber.ts                    # ntfy SSE 구독 + 재연결
      message-parser.ts                     # ntfy 메시지 → PushPayload 변환
    providers/
      push-provider.ts                      # IPushProvider 인터페이스
      pushwoosh-provider.ts                 # Pushwoosh API 연동
      fcm-provider.ts                       # FCM API 연동
    registry/
      device-registry.ts                    # SQLite 디바이스 토큰 관리
      device-routes.ts                      # POST/DELETE /devices
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

---

## E2E 검증 시나리오

**자동화 비율: 100%**

### ntfy → Push 변환

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | 서명 요청 ntfy → Pushwoosh 전달 | mock ntfy SSE + mock Pushwoosh API → createMessage 호출 assert | [L0] |
| 2 | 서명 요청 ntfy → FCM 전달 | mock ntfy SSE + mock FCM API → messages:send 호출 assert | [L0] |
| 3 | 일반 알림 ntfy → Push 전달 | waiaas-notify-* 토픽 메시지 → PushPayload category='notification' assert | [L0] |
| 4 | SignRequest data 포함 | Push data 필드에 전체 SignRequest JSON 포함 assert | [L0] |

### Device Token Registry

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 5 | 디바이스 등록 | POST /devices { walletId, pushToken, platform } → 201 assert | [L0] |
| 6 | 디바이스 해제 | DELETE /devices/:token → 204 + 이후 Push 미전송 assert | [L0] |
| 7 | 중복 등록 | 동일 pushToken 재등록 → upsert (에러 아님) assert | [L0] |
| 8 | 잘못된 토큰 자동 정리 | Push 전송 실패 (invalidTokens) → DB에서 자동 삭제 assert | [L0] |

### 연결 관리

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 9 | ntfy SSE 재연결 | 연결 끊김 → 지수 백오프 → 재연결 성공 assert | [L0] |
| 10 | config 검증 | 잘못된 API Token → validateConfig() false + 시작 시 에러 메시지 assert | [L0] |
| 11 | 다중 월렛 구독 | wallet_ids 3개 → 서명+알림 토픽 6개 구독 assert | [L0] |

### Pushwoosh 특화

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 12 | Pushwoosh 페이로드 포맷 | createMessage body → content, data, ios_root_params 올바른 구조 assert | [L0] |
| 13 | Pushwoosh 인증 실패 | 잘못된 api_token → 에러 로그 + 재시도 없음 assert | [L0] |

---

## 의존

| 의존 대상 | 이유 |
|----------|------|
| m26-01 (Signing SDK) | ntfy 서명 토픽 구조, SignRequest 스키마 |
| m26-02 (알림 채널) | ntfy 알림 토픽 구조, WalletNotification 스키마 |

---

## 리스크

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| 1 | Pushwoosh API 변경 | Provider 호출 실패 | API 버전 고정 (1.3), 에러 응답 로깅으로 빠른 감지 |
| 2 | ntfy SSE 장시간 연결 불안정 | 서명 요청 수신 지연 | 자동 재연결 + heartbeat 감지 (ntfy keepalive 30초) |
| 3 | 디바이스 토큰 관리 부담 | 지갑사 추가 작업 | 토큰 등록 API 2개만 구현하면 완료. invalidTokens 자동 정리로 관리 최소화 |

---

## 예상 규모

| 항목 | 예상 |
|------|------|
| 페이즈 | 1개 |
| 신규 파일 | 10-12개 (패키지 전체) |
| 테스트 | 13개 |
| DB | SQLite 1개 파일 (relay.db, 디바이스 토큰) |
| 신규 패키지 | @waiaas/push-relay (모노레포 packages/push-relay) |

---

*생성일: 2026-02-15*
*선행: m26-01 (Signing SDK), m26-02 (알림 채널)*
*관련: Pushwoosh API (https://docs.pushwoosh.com), Firebase Cloud Messaging*
