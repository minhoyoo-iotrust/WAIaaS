# 마일스톤 m29-11: 푸시 릴레이 오너 주소 기반 디바이스 라우팅

- **Status:** PLANNED
- **Milestone:** TBD

## 목표

푸시 릴레이 서버의 디바이스 라우팅을 `walletName`(지갑 앱 종류) 단독에서 `walletName + ownerAddress + daemonId` 기반으로 전환하여, 중앙 운영 푸시 릴레이 모델에서 오너별 알림 격리를 보장한다.

---

## 배경

### 현재 문제

푸시 릴레이 서버는 지갑 회사(디센트 등)가 중앙에서 운영하는 것을 전제로 설계되었으나, 디바이스 라우팅이 `walletName` 하나로만 수행됨:

```
현재:
데몬 A → ntfy "waiaas-sign-dcent" ─┐
                                     ├→ [디센트 푸시 릴레이]
데몬 B → ntfy "waiaas-sign-dcent" ─┘     │
                                          │ getTokensByWalletName("dcent")
                                          ↓
                                      모든 디센트 사용자의 디바이스에 발송
```

**문제점:**

1. `walletName = "dcent"`로 등록된 모든 디바이스에 브로드캐스트 — 다른 사용자의 서명 요청/알림이 내 디바이스에 도달
2. 오너 지갑 주소로 필터링하는 메커니즘 없음
3. 메시지 페이로드에 오너 주소 필드 없음 (`SignRequest.metadata.from`은 에이전트 지갑 주소)

### 해결 방향

- ntfy 토픽 구독 레이어는 기존 `walletName` 기반 유지 (변경 없음)
- 디바이스 등록 시 모니터링할 오너 주소 + 데몬 ID를 함께 등록하고, 메시지 수신 시 매칭 필터링
- 하나의 디바이스가 여러 오너 주소를 한번에 구독 가능 (동일 오너가 여러 에이전트 지갑 소유, 여러 데몬 연결)

```
개선 후:
데몬 A (오너 0xAAA, daemonId=d1) → ntfy "waiaas-sign-dcent" ─┐
                                                                ├→ [디센트 푸시 릴레이]
데몬 B (오너 0xBBB, daemonId=d2) → ntfy "waiaas-sign-dcent" ─┘     │
                                                                     │ ownerAddress=0xAAA, daemonId=d1
                                                                     │ WHERE owner_address='0xAAA' AND daemon_id='d1'
                                                                     ↓
                                                                 해당 구독 디바이스만 발송
```

### 오너 주소와 네트워크

오너 주소 형식이 체인별로 고유하므로 네트워크 정보는 불필요:

- EVM: `0x1234...` (hex, 42자)
- Solana: `Abc123...` (base58, 32-44자)

푸시 릴레이는 단순 문자열 매칭만 수행. 같은 오너가 EVM + Solana 지갑을 모두 소유하면 두 주소를 모두 구독.

### daemonId의 역할

`daemonId`는 라우팅 키가 아니라 **추가 보안 필터(공유 시크릿)** 역할:

- 오너 주소는 온체인에 공개되어 있어 공격자가 알 수 있음
- `daemonId`는 페어링 과정에서만 공유되는 비공개 값
- 공격자가 타인의 알림을 구독하려면 **오너 주소 + daemonId** 둘 다 알아야 함
- 암호학적 소유권 증명은 아니지만, 실질적 보안 수준을 크게 높임

### 페어링 흐름

데몬과 지갑 앱 간 페어링에서 전달할 정보는 **daemonId 하나**뿐:

| 정보 | 지갑 앱이 이미 보유 | 페어링 시 전달 |
|------|-------------------|--------------|
| 오너 주소 | O (하드웨어 지갑 주소) | X |
| 푸시 릴레이 URL | O (자사 운영 서버) | X |
| ntfy 서버 URL | O (자사 인프라) | X |
| **daemonId** | X | **O** |

```
1. 데몬 운영자: Admin UI에서 daemonId 확인 (복사 또는 QR 코드)

2. 오너: 지갑 앱에서 daemonId 입력

3. 지갑 앱 → 푸시 릴레이에 디바이스 등록
   POST /devices {
     walletName: "dcent",
     pushToken: "fcm-token-xxx",
     platform: "ios",
     ownerAddresses: [
       { address: "0xAAA...", daemonId: "a1b2c3d4..." }
     ]
   }
```

- daemonId는 Admin UI에서 표시 + 재생성 가능 (`POST /v1/admin/daemon/regenerate-id`)
- 재생성 시 지갑 앱에서 새 daemonId로 구독 갱신 필요 (`PUT /devices/:token/subscriptions`)

---

## 구현 대상

### 1. `@waiaas/core` — 스키마 변경

#### SignRequest 스키마

`SignRequestSchema.metadata`에 `ownerAddress`, `daemonId` 필드 추가:

```typescript
metadata: z.object({
  txId: z.string(),
  type: z.string(),
  from: z.string(),           // 에이전트 지갑 주소 (기존)
  to: z.string(),
  ownerAddress: z.string(),   // 오너 지갑 주소 (신규)
  daemonId: z.string(),       // 데몬 인스턴스 ID (신규)
  amount: z.string().optional(),
  symbol: z.string().optional(),
  policyTier: z.enum(['APPROVAL', 'DELAY']),
})
```

#### NotificationMessage 스키마

`NotificationMessageSchema`에 `ownerAddress`, `daemonId` 필드 추가:

```typescript
export const NotificationMessageSchema = z.object({
  version: z.literal('1'),
  eventType: z.string(),
  walletId: z.string(),
  walletName: z.string(),
  ownerAddress: z.string(),   // 오너 지갑 주소 (신규)
  daemonId: z.string(),       // 데몬 인스턴스 ID (신규)
  category: z.enum(NOTIFICATION_CATEGORIES),
  title: z.string(),
  body: z.string(),
  details: z.record(z.unknown()).optional(),
  timestamp: z.number(),
});
```

### 2. `@waiaas/daemon` — daemonId 생성 및 메시지 포함

#### daemonId 생성 및 관리

데몬 최초 기동 시 UUID v4를 생성하여 Admin Settings에 영구 저장. Admin UI 또는 API로 재생성 가능:

```typescript
// 조회 (자동 생성)
const daemonId = settings.get('daemon.id') ?? generateAndStoreId();

// 재생성 (Admin API)
// POST /v1/admin/daemon/regenerate-id → 신규 UUID v4 발급 + 저장
```

**daemonId 변경 시 영향:**

- 데몬에서 발행하는 메시지의 daemonId가 즉시 변경됨
- 기존에 지갑 앱에서 등록한 구독의 daemonId와 불일치 → 알림 수신 중단
- 지갑 앱에서 새 daemonId로 구독 갱신 필요 (replaceSubscriptions)
- Admin UI에 현재 daemonId 표시 + 재생성 버튼 + 지갑 앱 재연동 안내 제공

#### SignRequestBuilder

`BuildRequestParams`에 `ownerAddress`, `daemonId` 추가:

```typescript
export interface BuildRequestParams {
  // ... 기존 필드
  ownerAddress: string;   // 오너 지갑 주소 (신규)
  daemonId: string;       // 데몬 ID (신규)
}
```

- 호출부에서 해당 에이전트 지갑의 오너 주소를 DB(`wallets.owner_address`)에서 조회하여 전달
- 오너가 없는 지갑(NONE 상태)은 서명 승인이 불필요하므로 이 경로에 도달하지 않음

#### WalletNotificationChannel

`NotificationMessage` 구성 시 `ownerAddress`, `daemonId` 포함:

```typescript
const message: NotificationMessage = {
  // ... 기존 필드
  ownerAddress: wallet.ownerAddress ?? '',
  daemonId,
};
```

- 오너가 없는 지갑(NONE)의 알림은 `ownerAddress = ''` — 푸시 릴레이에서 매칭 디바이스 없으므로 자연스럽게 미발송

### 3. `@waiaas/push-relay` — DB 스키마 및 라우팅 변경

#### DB 스키마

```sql
-- 기존 devices 테이블 유지 (디바이스 정보)
CREATE TABLE devices (
  push_token TEXT PRIMARY KEY,
  wallet_name TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 신규: 디바이스별 오너 주소 구독 테이블
CREATE TABLE device_subscriptions (
  push_token TEXT NOT NULL REFERENCES devices(push_token) ON DELETE CASCADE,
  owner_address TEXT NOT NULL,
  daemon_id TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (push_token, owner_address, daemon_id)
);

CREATE INDEX idx_device_subs_routing ON device_subscriptions(owner_address, daemon_id);
```

#### DeviceRegistry 변경

```typescript
interface OwnerSubscription {
  address: string;
  daemonId: string;
}

// 디바이스 등록 (ownerAddresses 동시 등록)
register(walletName: string, pushToken: string, platform: Platform, owners: OwnerSubscription[]): void;

// 구독 전체 교체
replaceSubscriptions(pushToken: string, owners: OwnerSubscription[]): void;

// 구독 목록 조회
getSubscriptions(pushToken: string): OwnerSubscription[];

// 오너 주소 + daemonId 기반 토큰 조회 (라우팅 핵심)
getTokensByOwnerAndDaemon(walletName: string, ownerAddress: string, daemonId: string): string[];
```

#### 라우팅 로직 변경

```typescript
onMessage: async (walletName, payload) => {
  const ownerAddress = payload.data['ownerAddress'];
  const daemonId = payload.data['daemonId'];

  // ownerAddress 또는 daemonId 없으면 기존 방식 폴백 (구버전 데몬 호환)
  if (!ownerAddress || !daemonId) {
    const tokens = registry.getTokensByWalletName(walletName);
    // ...
    return;
  }

  // ownerAddress + daemonId 기반 필터링
  const tokens = registry.getTokensByOwnerAndDaemon(walletName, ownerAddress, daemonId);
  if (tokens.length === 0) return;

  const result = await provider.send(tokens, payload);
  // ...
}
```

#### API 변경

```
POST   /devices                          → 디바이스 등록 + 오너 주소 구독
       {
         walletName, pushToken, platform,
         ownerAddresses: [
           { address: "0xAAA", daemonId: "d1" },
           { address: "0xBBB", daemonId: "d1" },
           { address: "0xCCC", daemonId: "d2" }
         ]
       }

PUT    /devices/:token/subscriptions     → 구독 전체 교체
       {
         ownerAddresses: [
           { address: "0xAAA", daemonId: "d1" },
           { address: "0xDDD", daemonId: "d3" }
         ]
       }

GET    /devices/:token/subscriptions     → 구독 목록

DELETE /devices/:token                   → 디바이스 삭제 (구독 CASCADE)
```

모든 엔드포인트는 기존과 동일하게 `X-API-Key` 인증 사용.

### 4. `@waiaas/wallet-sdk` — 구독 관리 함수 추가

지갑 앱이 푸시 릴레이에 디바이스 등록 및 오너 주소를 관리하는 SDK 함수:

```typescript
interface OwnerSubscription {
  address: string;
  daemonId: string;
}

// 디바이스 등록 (오너 주소 + daemonId 포함)
async function registerDevice(
  relayUrl: string, apiKey: string,
  opts: {
    walletName: string;
    pushToken: string;
    platform: Platform;
    ownerAddresses: OwnerSubscription[];
  }
): Promise<void>;

// 구독 전체 교체
async function replaceSubscriptions(
  relayUrl: string, apiKey: string,
  pushToken: string,
  ownerAddresses: OwnerSubscription[]
): Promise<void>;

// 구독 목록 조회
async function listSubscriptions(
  relayUrl: string, apiKey: string,
  pushToken: string
): Promise<OwnerSubscription[]>;
```

### 5. 설계 문서 업데이트

| 문서 | 변경 내용 |
|------|----------|
| doc 73 (Signing Protocol) | SignRequest.metadata.ownerAddress, daemonId 필드 추가 명세 |
| doc 75 (Notification + Push Relay) | 오너 주소 + daemonId 기반 라우팅, device_subscriptions 테이블, 구독 API + **기존 NotificationMessage 명세를 실제 구현과 동기화** (eventType/walletName/details/timestamp 등 괴리 수정) |

### 6. Skill 파일 업데이트

| 파일 | 변경 내용 |
|------|----------|
| admin.skill.md | push relay 구독 API 반영 |

---

## 기술 결정 사항

| # | 결정 항목 | 선택지 | 결정 근거 |
|---|----------|--------|----------|
| 1 | 라우팅 키 | `walletName + ownerAddress + daemonId` | walletName으로 ntfy 구독, ownerAddress + daemonId로 디바이스 필터링 |
| 2 | 오너 식별자 | 온체인 지갑 주소 | 암호학적 고유성 보장 |
| 3 | 네트워크 정보 | 불필요 | 오너 주소 형식이 체인별로 고유 (EVM hex vs Solana base58). 충돌 불가 |
| 4 | daemonId 역할 | 추가 보안 필터 (공유 시크릿) | 라우팅 키가 아닌 보안 필터. 페어링 시에만 공유되는 비공개 값으로 무단 구독 방지 |
| 5 | daemonId 생성 | 데몬 최초 기동 시 UUID v4 영구 저장, Admin API로 재생성 가능 | 고유성은 라우팅에 무관. 공유 시크릿 역할이므로 추측 불가한 값이면 충분. 유출 시 재생성 후 지갑 앱 재연동 |
| 6 | 구독 테이블 분리 | `devices` + `device_subscriptions` | 1 디바이스 : N (ownerAddress, daemonId) 관계 정규화 |
| 7 | 오너 없는 지갑 처리 | ownerAddress 빈 문자열 → 매칭 없음 → 미발송 | 오너가 없으면 승인 불필요 + 알림 대상 없음 |
| 8 | ntfy 토픽 구조 | 기존 유지 (walletName 기반) | 토픽에 주소를 넣으면 폭증. 메시지 내용으로 필터링이 효율적 |
| 9 | 구독 API 인증 | 기존 X-API-Key 방식 유지 | 앱 레벨 시크릿 + daemonId 조합으로 보안 확보 |
| 10 | 디바이스 등록 API | ownerAddresses 배열을 등록 시 함께 전달 | 별도 구독 API 호출 없이 등록과 동시에 구독 완료 |
| 11 | 구독 갱신 방식 | PUT 전체 교체 | 상태 동기화 단순. 지갑 앱이 현재 구독 목록을 통째로 전송 |
| 12 | ownerAddress/daemonId 없는 메시지 | 기존 walletName 브로드캐스트 폴백 | 구버전 데몬 호환 |
| 13 | ownerAddress 스키마 | required 필드 (빈 문자열 허용) | optional보다 명확. 빈 문자열로 "오너 없음" 표현 |

---

## 향후 검토 사항

| # | 항목 | 설명 |
|---|------|------|
| 1 | 소유권 증명 (Proof of Ownership) | 현재 X-API-Key + daemonId 조합으로 보안을 확보하지만, 암호학적 소유권 증명은 아님. 오너 주소 등록 시 해당 주소의 개인키로 서명한 증명을 요구하는 방안을 별도 마일스톤으로 검토 |

---

## E2E 검증 시나리오

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | 디바이스 등록 + 오너 구독 | POST /devices { ownerAddresses: [{ address: "0xAAA", daemonId: "d1" }] } → 201 | [L0] |
| 2 | 다중 오너 동시 등록 | POST /devices { ownerAddresses: [{ address: "0xAAA", daemonId: "d1" }, { address: "0xBBB", daemonId: "d1" }] } → 2건 구독 | [L0] |
| 3 | 다중 데몬 오너 등록 | ownerAddresses에 daemonId가 다른 항목 포함 → 각각 구독 | [L0] |
| 4 | 구독 전체 교체 | PUT /devices/:token/subscriptions → 기존 삭제 + 신규 등록 | [L0] |
| 5 | 구독 목록 조회 | GET /devices/:token/subscriptions → OwnerSubscription 배열 | [L0] |
| 6 | ownerAddress + daemonId 라우팅 | SignRequest(ownerAddress=0xAAA, daemonId=d1) → 해당 구독 디바이스만 수신 | [L0] |
| 7 | daemonId 불일치 필터링 | SignRequest(ownerAddress=0xAAA, daemonId=d2) → daemonId=d1 구독 디바이스 미수신 | [L0] |
| 8 | ownerAddress 불일치 필터링 | SignRequest(ownerAddress=0xBBB, daemonId=d1) → 0xAAA 구독 디바이스 미수신 | [L0] |
| 9 | 여러 구독 수신 | 디바이스가 (0xAAA,d1), (0xBBB,d1) 구독 → 양쪽 알림 모두 수신 | [L0] |
| 10 | 오너 없는 지갑 알림 | ownerAddress='' → 매칭 없음 → 발송 0건 | [L0] |
| 11 | SignRequest에 ownerAddress+daemonId 포함 | PENDING_APPROVAL → 두 필드 존재 assert | [L0] |
| 12 | NotificationMessage에 ownerAddress+daemonId 포함 | 알림 이벤트 → 두 필드 존재 assert | [L0] |
| 13 | 디바이스 삭제 시 구독 CASCADE | DELETE /devices/:token → device_subscriptions도 삭제 | [L0] |
| 14 | wallet-sdk 등록 함수 | registerDevice(ownerAddresses) → 릴레이에 디바이스+구독 등록 확인 | [L0] |
| 15 | wallet-sdk 구독 교체 함수 | replaceSubscriptions() → 기존 교체 확인 | [L0] |
| 16 | 다중 디바이스 동일 구독 | 2대 디바이스가 같은 (0xAAA,d1) 구독 → 2대 모두 수신 | [L0] |
| 17 | invalid token 정리 | FCM invalid → devices + device_subscriptions CASCADE 삭제 | [L0] |
| 18 | 폴백: ownerAddress/daemonId 없는 메시지 | 구버전 데몬 → walletName 전체 브로드캐스트 | [L0] |
| 19 | daemonId 재생성 | POST /v1/admin/daemon/regenerate-id → 신규 ID 반환 + 저장 | [L0] |
| 20 | daemonId 변경 후 알림 중단 | daemonId 재생성 → 기존 구독 불일치 → 발송 0건 | [L0] |
| 21 | daemonId 변경 후 재연동 | 지갑 앱에서 replaceSubscriptions(새 daemonId) → 알림 수신 재개 | [L0] |

---

## 의존

| 의존 대상 | 이유 |
|----------|------|
| m29-10 | ntfy 토픽 지갑별 설정 전환 — sign_topic/notify_topic이 wallet_apps에 저장되어야 라우팅 구조 완성 |

---

## 리스크

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| 1 | @waiaas/core 스키마 변경 | SignRequest/NotificationMessage에 필드 추가 — 기존 클라이언트 호환 | required 필드이되 빈 문자열 허용. 기존 SDK 버전은 필드 무시 |
| 2 | 푸시 릴레이 DB 변경 | device_subscriptions 테이블 추가 | 신규 테이블이므로 기존 데이터 손실 없음 |
| 3 | 기존 디바이스 마이그레이션 | 구독 없는 기존 디바이스는 알림 수신 불가 | 릴레이 업그레이드 후 지갑 앱에서 재등록 시 구독 추가 |
| 4 | 구버전 데몬 메시지 | ownerAddress/daemonId 없음 | 푸시 릴레이에서 walletName 전체 브로드캐스트로 폴백 |
| 5 | daemonId 유출 | daemonId가 노출되면 보안 효과 감소 | daemonId는 페어링 시에만 전달. 향후 소유권 증명 도입으로 근본 해결 |

---

## 수정 대상 파일

| 패키지 | 파일 | 변경 내용 |
|--------|------|----------|
| core | `schemas/signing-protocol.ts` | SignRequest.metadata에 ownerAddress+daemonId, NotificationMessage에 ownerAddress+daemonId 추가 |
| daemon | `infrastructure/settings/setting-keys.ts` | daemonId 설정 키 등록 |
| daemon | `api/routes/admin.ts` | POST /v1/admin/daemon/regenerate-id 엔드포인트 |
| daemon | `services/signing-sdk/sign-request-builder.ts` | BuildRequestParams에 ownerAddress+daemonId 추가, metadata에 포함 |
| daemon | `services/signing-sdk/channels/wallet-notification-channel.ts` | NotificationMessage 구성 시 ownerAddress+daemonId 포함 |
| daemon | `services/signing-sdk/channels/ntfy-signing-channel.ts` | ownerAddress+daemonId 전달 |
| push-relay | `registry/device-registry.ts` | device_subscriptions 테이블, register에 OwnerSubscription[], replaceSubscriptions, getTokensByOwnerAndDaemon |
| push-relay | `registry/device-routes.ts` | 구독 API (PUT /devices/:token/subscriptions, GET) |
| push-relay | `subscriber/message-parser.ts` | 메시지에서 ownerAddress+daemonId 추출 |
| push-relay | `bin.ts` | onMessage 핸들러 라우팅 로직 변경 |
| wallet-sdk | `src/push-relay.ts` (신규) | registerDevice, replaceSubscriptions, listSubscriptions 함수 |
| design | `73-signing-protocol-v1.md` | ownerAddress+daemonId 필드 명세 |
| design | `75-notification-push-relay.md` | 오너 기반 라우팅, device_subscriptions, 구독 API |
| skills | `admin.skill.md` | push relay 구독 API 반영 |

---

## 예상 규모

| 항목 | 예상 |
|------|------|
| 페이즈 | 3개 (core+daemon 스키마 / push-relay DB+라우팅+API / wallet-sdk+문서) |
| 신규/수정 파일 | 15-18개 |
| 테스트 | 22-28개 |
| DB 변경 | push-relay (device_subscriptions CREATE TABLE), daemon (daemonId 저장) |

---

*생성일: 2026-03-02*
*관련: m29-10 ntfy 토픽 지갑별 설정 전환, v29.7 D'CENT 직접 서명, v26.3 Push Relay Server, doc 73 Signing Protocol, doc 75 Notification+Push Relay*
