# 마일스톤 m26-01: WAIaaS Wallet Signing SDK

## 목표

지갑 개발사(D'CENT 등)가 통합할 수 있는 Wallet Signing SDK와 개방형 서명 프로토콜을 제공하여, Owner가 지갑 앱에서 트랜잭션을 승인/거부할 수 있는 상태. 메신저(Telegram) 중계 모델과 ntfy 직접 푸시 모델을 모두 지원하며, 세션 관리 없는 1회성 서명 플로우로 WalletConnect 대비 단순한 UX를 제공한다.

---

## 배경

### 승인 채널 전체 구조

m26-01 완료 시 Owner는 5가지 승인 채널을 선택할 수 있다:

| 우선순위 | 채널 | 마일스톤 | 특징 |
|---------|------|---------|------|
| 1 | **WAIaaS SDK + ntfy** | m26-01 | 메신저 불필요, 지갑 앱만으로 동작 |
| 2 | **WAIaaS SDK + Telegram** | m26-01 | 메신저 중계, 파트너 지갑 전용 |
| 3 | WalletConnect | v1.6.3 | 세션 기반, 범용 지갑 |
| 4 | Telegram Bot `/approve` | v1.6 | chatId 기반, 텍스트 명령 |
| 5 | REST API 직접 호출 | v1.2 | 서명 수동 생성 |

### WalletConnect vs WAIaaS Signing SDK

| 비교 | WalletConnect (v1.6.3) | WAIaaS Signing SDK |
|------|----------------------|-------------------|
| 세션 관리 | 필요 (7일 TTL + extend) | **불필요 (1회성)** |
| 외부 의존 | WC relay 서버 + Project ID | **ntfy 또는 Telegram (이미 설정됨)** |
| 지갑 통합 | WC v2 지원 지갑 (수백 개) | **WAIaaS SDK 통합 지갑** |
| 초기 설정 | QR 스캔 → 세션 연결 | **설정 없음** |
| 오프라인 복구 | 세션 만료 시 QR 재스캔 | **항상 동작 (세션 없음)** |
| 메신저 필요 | 불필요 | ntfy 모드: **불필요** / Telegram 모드: 필요 |

### 2가지 응답 채널

#### 채널 A: ntfy 직접 푸시 (메신저 불필요)

```
WAIaaS ──(publish)──→ ntfy 토픽 ──(네이티브 푸시)──→ 지갑 앱
                                                        ↓
                                                    사용자 서명
                                                        ↓
WAIaaS ←──(subscribe)── ntfy 응답 토픽 ←──(publish)── 지갑 앱
```

Owner가 메신저를 설치할 필요 없이, **지갑 앱만으로 전체 플로우가 완성**된다. 지갑 앱이 ntfy 구독을 내장하면 된다.

#### 채널 B: Telegram 메신저 중계

```
WAIaaS ──(Bot API)──→ Telegram ──→ Owner 폰 ──(유니버셜 링크)──→ 지갑 앱
                                                                    ↓
                                                                사용자 서명
                                                                    ↓
WAIaaS ←──(Long Polling)── Telegram ←──(공유 인텐트)── 지갑 앱
```

Owner가 이미 Telegram을 사용 중이면, 기존 메신저 인프라를 활용한다.

### 링크 방식: 지갑 도메인 유니버셜 링크

WAIaaS가 별도 도메인을 관리하지 않고, **지갑 개발사의 유니버셜 링크 도메인**을 활용한다:

```
https://link.dcentwallet.com/waiaas/sign?data={base64url(SignRequest)}
```

| 상황 | 동작 |
|------|------|
| 모바일 + 앱 설치됨 | D'CENT 앱 바로 열림 (유니버셜 링크) |
| 모바일 + 앱 미설치 | D'CENT 웹페이지 (설치 안내) |
| PC 메신저에서 클릭 | D'CENT 웹페이지 (QR 코드 → 모바일 스캔) |

WAIaaS 도메인 불필요, self-hosted 철학 유지, PC/모바일 모두 대응.

---

## 구현 대상

### WAIaaS Signing Protocol v1 (개방형 프로토콜)

#### 서명 요청 (SignRequest)

```typescript
const SignRequestSchema = z.object({
  version: z.literal('1'),
  requestId: z.string().uuid(),
  chain: z.enum(['solana', 'evm']),
  network: z.string(),                    // "ethereum-mainnet", "devnet" 등
  message: z.string(),                    // 서명할 메시지 (hex 또는 base64)
  displayMessage: z.string(),            // 사람이 읽을 수 있는 요약
  metadata: z.object({
    txId: z.string().uuid(),
    type: z.string(),                     // TRANSFER, TOKEN_TRANSFER, ...
    from: z.string(),
    to: z.string(),
    amount: z.string().optional(),
    symbol: z.string().optional(),
    policyTier: z.enum(['APPROVAL', 'DELAY']),
  }),
  responseChannel: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('ntfy'),
      responseTopic: z.string(),          // 지갑이 서명 결과를 publish할 ntfy 토픽
      serverUrl: z.string().url().optional(), // self-hosted ntfy URL (기본: https://ntfy.sh)
    }),
    z.object({
      type: z.literal('telegram'),
      botUsername: z.string(),            // WAIaaS Telegram Bot username
    }),
  ]),
  expiresAt: z.string().datetime(),
});
```

#### 서명 응답 (SignResponse)

```typescript
const SignResponseSchema = z.object({
  version: z.literal('1'),
  requestId: z.string().uuid(),
  action: z.enum(['approve', 'reject']),
  signature: z.string().optional(),       // approve 시 서명값
  signerAddress: z.string(),
  signedAt: z.string().datetime(),
});
```

#### 서명 메시지 포맷

```
WAIaaS Transaction Approval

Transaction: {txId}
Type: {TRANSFER | TOKEN_TRANSFER | CONTRACT_CALL | ...}
From: {fromAddress}
To: {toAddress}
Amount: {amount} {symbol}
Network: {network}
Policy Tier: {APPROVAL | DELAY}

Approve this transaction by signing this message.
Timestamp: {ISO 8601}
Nonce: {nonce}
```

### E2E 서명 플로우

#### ntfy 직접 푸시 모델

```
1. AI 에이전트 → 고액 트랜잭션 → 정책 평가 → PENDING_APPROVAL

2. WAIaaS 데몬:
   - SignRequest 생성 (responseChannel: ntfy)
   - ntfy 요청 토픽에 publish:
     토픽: waiaas-sign-{walletId}
     메시지: SignRequest JSON + 유니버셜 링크 URL
   - 동시에 ntfy 응답 토픽 subscribe 시작:
     토픽: waiaas-response-{requestId}

3. 지갑 앱 (ntfy 구독 중):
   - 네이티브 푸시 알림 수신 → 앱 열림
   - SignRequest 파싱 → 트랜잭션 상세 표시
   - Owner 승인 → 서명 생성

4. 지갑 앱 (WAIaaS SDK):
   - SignResponse 생성
   - ntfy 응답 토픽에 HTTP publish:
     PUT https://ntfy.sh/waiaas-response-{requestId}
     Body: base64url(SignResponse)

5. WAIaaS 데몬:
   - ntfy 응답 토픽에서 SignResponse 수신
   - 서명 검증 (ownerAuth 재사용) → 트랜잭션 실행 → CONFIRMED
```

#### Telegram 메신저 모델

```
1. PENDING_APPROVAL 발생

2. WAIaaS 데몬:
   - SignRequest 생성 (responseChannel: telegram)
   - Owner 지갑의 유니버셜 링크 URL 생성:
     https://link.dcentwallet.com/waiaas/sign?data={base64url(SignRequest)}
   - Telegram Bot 메시지 전송:
     "트랜잭션 승인 요청
      To: 0x5678... / Amount: 1.5 ETH
      [지갑에서 승인하기]"  ← 유니버셜 링크 인라인 버튼

3. Owner:
   - Telegram 알림 수신 (PC 또는 모바일)
   - [지갑에서 승인하기] 탭
     - 모바일: 지갑 앱 바로 열림 (유니버셜 링크)
     - PC: 지갑 웹페이지 → QR 코드 → 모바일 스캔 → 앱 열림
   - 지갑 앱에서 트랜잭션 확인 → 승인/거부 → 서명

4. 지갑 앱 (WAIaaS SDK):
   - SignResponse 생성
   - Telegram 공유 인텐트 실행:
     → WAIaaS Bot 채팅으로 /sign_response {base64url(SignResponse)} 전송
   - Owner는 Telegram에서 [보내기] 탭 (1탭)

5. WAIaaS 데몬:
   - Telegram Long Polling으로 /sign_response 수신
   - SignResponse 파싱 + 서명 검증 → 트랜잭션 실행
```

### 컴포넌트

#### 데몬 측 (WAIaaS)

| 컴포넌트 | 내용 |
|----------|------|
| SignRequestBuilder | PENDING_APPROVAL 트랜잭션 → SignRequest 생성. responseChannel(ntfy/telegram) 선택. Owner 지갑 종류에 따라 유니버셜 링크 URL 생성. 요청 만료 시각 설정 (기본 30분) |
| SignResponseHandler | SignResponse 파싱 + 검증. requestId 매칭, 만료 체크, 서명 검증(ownerAuth 재사용). 검증 성공 시 트랜잭션 approve/reject 실행 |
| NtfySigningChannel | ntfy 기반 서명 채널. 요청 토픽에 publish (서명 요청 전송). 응답 토픽을 SSE/polling으로 subscribe (서명 응답 수신). 토픽 이름: 요청 `waiaas-sign-{walletId}`, 응답 `waiaas-response-{requestId}` |
| TelegramSigningChannel | Telegram 기반 서명 채널. Bot 메시지에 유니버셜 링크 인라인 버튼 포함. `/sign_response` 명령어 핸들러 추가 (기존 Telegram Bot 확장) |
| WalletLinkRegistry | 통합 지갑별 유니버셜 링크 패턴 관리. 지갑 메타데이터(이름, 유니버셜 링크 base URL, 딥링크 스키마) 등록/조회 |
| ApprovalChannelRouter | 승인 채널 **지갑별** 라우팅. 각 지갑의 `owner_approval_method` 설정에 따라 채널 결정. 미설정 시 config 기반 기본 우선순위 fallback: SDK(ntfy) > SDK(Telegram) > WalletConnect > Telegram Bot > REST |

#### Wallet SDK (@waiaas/wallet-sdk, npm 패키지)

| 컴포넌트 | 내용 |
|----------|------|
| parseSignRequest(url) | 유니버셜 링크 또는 딥링크 URL에서 SignRequest 추출 + Zod 검증 |
| formatDisplayMessage(request) | SignRequest를 사람이 읽을 수 있는 포맷으로 변환 (지갑 앱 UI 표시용) |
| buildSignResponse(requestId, action, signature?, address) | SignResponse 객체 생성 |
| sendViaNtfy(response, topic, serverUrl?) | ntfy 응답 토픽에 HTTP PUT으로 publish. self-hosted ntfy URL 지원 |
| sendViaTelegram(response, botUsername) | Telegram 공유 인텐트 또는 딥링크로 WAIaaS Bot에 전송 |
| subscribeToRequests(topic, serverUrl?, callback) | ntfy 요청 토픽을 SSE로 구독. 새 서명 요청 수신 시 콜백 호출. 지갑 앱이 백그라운드에서 구독 유지 |
| registerWallet(config) | 지갑 메타데이터 등록 (유니버셜 링크 패턴, 딥링크 스키마 등) |

### 지갑 개발사 측 필요 작업 (D'CENT 예시)

| 항목 | 내용 |
|------|------|
| **AASA 파일** | `link.dcentwallet.com/.well-known/apple-app-site-association`에 `/waiaas/*` 경로 추가 |
| **assetlinks.json** | `link.dcentwallet.com/.well-known/assetlinks.json`에 Android 앱 패키지 추가 |
| **앱 내 URL 핸들러** | `/waiaas/sign` 경로 수신 → `parseSignRequest()` → 서명 UI 표시 |
| **ntfy 구독** | `subscribeToRequests('waiaas-sign-{walletId}')` — 백그라운드 푸시 알림 수신 |
| **서명 응답 전송** | 승인: `sendViaNtfy(response, topic)` 또는 `sendViaTelegram(response, botUsername)` |
| **웹 fallback 페이지** | `link.dcentwallet.com/waiaas/sign` — 앱 미설치 시 설치 안내, PC 시 QR 코드 표시 |
| **SDK 통합** | `npm install @waiaas/wallet-sdk` → 위 함수 호출 |

### 지갑 등록 메타데이터

```typescript
const WalletLinkConfig = z.object({
  name: z.string(),                       // "dcent"
  displayName: z.string(),               // "D'CENT Wallet"
  universalLink: z.object({
    base: z.string().url(),               // "https://link.dcentwallet.com"
    signPath: z.string(),                 // "/waiaas/sign"
  }),
  deepLink: z.object({
    scheme: z.string(),                   // "dcent"
    signPath: z.string(),                 // "/waiaas-sign"
  }).optional(),                          // 유니버셜 링크 fallback용
  ntfy: z.object({
    requestTopic: z.string(),             // "waiaas-sign-{walletId}" 패턴
  }).optional(),
});
```

### config.toml

```toml
[signing_sdk]
enabled = true
request_expiry_min = 30                  # 서명 요청 유효 시간 (기본 30분)
preferred_channel = "ntfy"               # 기본 응답 채널: "ntfy" | "telegram"
preferred_wallet = "dcent"               # Owner 기본 지갑 (fallback, 지갑별 설정 우선)

# ntfy 직접 푸시 설정 (메신저 불필요)
[signing_sdk.ntfy]
server_url = "https://ntfy.sh"           # ntfy 서버 (self-hosted 가능)
request_topic_prefix = "waiaas-sign"     # 요청 토픽 접두어
response_topic_prefix = "waiaas-response" # 응답 토픽 접두어

# 지갑별 유니버셜 링크 설정
[[signing_sdk.wallets]]
name = "dcent"
display_name = "D'CENT Wallet"
universal_link_base = "https://link.dcentwallet.com"
sign_path = "/waiaas/sign"
deep_link_scheme = "dcent"
deep_link_sign_path = "/waiaas-sign"
```

> **참고**: `preferred_wallet`과 `preferred_channel`은 글로벌 기본값이다. 각 지갑에 `owner_approval_method`가 설정되어 있으면 해당 설정이 글로벌 기본값보다 우선한다.

### 지갑별 Owner 승인 방법 (DB)

Owner가 등록된 각 지갑은 **개별적으로** 승인 방법을 설정할 수 있다. `wallets` 테이블에 `owner_approval_method` 컬럼을 추가한다:

```sql
ALTER TABLE wallets ADD COLUMN owner_approval_method TEXT;
-- CHECK (owner_approval_method IN ('sdk_ntfy', 'sdk_telegram', 'walletconnect', 'telegram_bot', 'rest'))
```

| 값 | 설명 | 연동 마일스톤 |
|----|------|-------------|
| `sdk_ntfy` | WAIaaS SDK + ntfy 직접 푸시 (메신저 불필요) | m26-01 |
| `sdk_telegram` | WAIaaS SDK + Telegram 메신저 중계 | m26-01 |
| `walletconnect` | WalletConnect v2 세션 기반 | v1.6.3 |
| `telegram_bot` | Telegram Bot `/approve` 텍스트 명령 | v1.6 |
| `rest` | REST API 직접 호출 (서명 수동 생성) | v1.2 |
| `NULL` (미설정) | 글로벌 config 기본 우선순위 fallback | - |

#### REST API 변경

`PUT /v1/wallets/:id/owner` 요청에 `approvalMethod` 필드 추가:

```json
{
  "ownerAddress": "0x1234...",
  "approvalMethod": "sdk_ntfy"
}
```

`approvalMethod`는 optional. 생략 시 `NULL`(글로벌 fallback). Owner 등록 이후에도 `PUT /v1/wallets/:id/owner`로 변경 가능.

#### ApprovalChannelRouter 라우팅 로직

```
1. 지갑의 owner_approval_method가 설정되어 있는가?
   → YES: 해당 채널로 직접 라우팅
   → NO: 글로벌 기본 우선순위 적용
         SDK(ntfy) > SDK(Telegram) > WalletConnect > Telegram Bot > REST
```

### Admin UI: Owner 승인 방법 설정

지갑 상세 페이지의 Owner 설정 섹션에 승인 방법 선택 UI를 추가한다:

```
┌─────────────────────────────────────────────┐
│  Owner Settings                              │
│                                              │
│  Owner Address    0x1234...5678              │
│  Owner Status     LOCKED ✓                   │
│                                              │
│  Approval Method                             │
│  ○ Use default (from config)                 │
│  ● D'CENT + ntfy (SDK direct push)          │
│  ○ D'CENT + Telegram (SDK messenger)        │
│  ○ WalletConnect                            │
│  ○ Telegram Bot (/approve command)          │
│  ○ Manual REST API                          │
│                                              │
│  [Save]                                      │
└─────────────────────────────────────────────┘
```

- Owner가 등록된 지갑에서만 승인 방법 설정 가능 (Owner 미등록 시 비활성)
- 선택한 방법에 필요한 인프라가 미구성 시 경고 표시 (예: ntfy 미설정 + sdk_ntfy 선택 → "ntfy is not configured" 안내)
- `signing_sdk.wallets`에 등록된 지갑 목록을 기반으로 SDK 옵션 라벨에 지갑 이름 표시

### 파일/모듈 구조

```
packages/daemon/src/services/
  signing-sdk/
    sign-request-builder.ts       # SignRequest 생성 + 유니버셜 링크 URL
    sign-response-handler.ts      # SignResponse 파싱 + 검증 + 실행
    wallet-link-registry.ts       # 지갑별 링크 패턴 관리
    channels/
      ntfy-signing-channel.ts     # ntfy publish/subscribe 서명 채널
      telegram-signing-channel.ts # Telegram 서명 채널 (기존 Bot 확장)
    approval-channel-router.ts    # 승인 채널 우선순위 라우팅

packages/wallet-sdk/              # 신규 패키지 (@waiaas/wallet-sdk)
  src/
    index.ts                      # 공개 API
    schemas.ts                    # SignRequest, SignResponse Zod 스키마
    parse-request.ts              # parseSignRequest()
    build-response.ts             # buildSignResponse()
    display.ts                    # formatDisplayMessage()
    channels/
      ntfy.ts                     # sendViaNtfy(), subscribeToRequests()
      telegram.ts                 # sendViaTelegram()
      index.ts                    # 채널 통합 인터페이스
    wallet-config.ts              # registerWallet(), WalletLinkConfig
  package.json
  tsconfig.json

packages/daemon/src/api/routes/
  wallets.ts                      # PUT /wallets/:id/owner에 approvalMethod 필드 추가

packages/daemon/src/infrastructure/database/
  migrations/                     # wallets.owner_approval_method 컬럼 추가 마이그레이션

packages/admin/src/components/
  wallet-detail.tsx               # Owner Settings 섹션에 Approval Method 라디오 선택 추가
```

---

## 기술 결정 사항

| # | 결정 항목 | 선택지 | 결정 근거 |
|---|----------|--------|----------|
| 1 | 링크 방식 | 지갑 도메인 유니버셜 링크 | WAIaaS 도메인 불필요. 지갑 개발사가 AASA/assetlinks.json 자체 관리. PC에서 클릭 시 지갑 웹페이지 fallback(QR 표시). self-hosted 철학 유지 |
| 2 | 직접 푸시 채널 | ntfy publish/subscribe | 메신저 없이 지갑 앱만으로 동작. self-hostable. 양방향 publish/subscribe 지원. WAIaaS가 이미 ntfy를 알림 채널로 지원(v1.3). 요청 토픽과 응답 토픽을 분리하여 단순한 구조 유지 |
| 3 | 메신저 채널 | Telegram만 (초기) | v1.6에서 이미 양방향(Bot API + Long Polling) 구현 완료. Slack(Socket Mode)/Discord(Gateway Bot)는 양방향 미구현이므로 후속 확장으로 분리 |
| 4 | 프로토콜 형식 | JSON + base64url 인코딩 | Zod 스키마 검증, URL-safe 인코딩, 유니버셜 링크 쿼리 파라미터에 포함 가능 |
| 5 | SDK 패키지 | @waiaas/wallet-sdk (npm, TypeScript) | React Native(D'CENT 브릿지 앱), Electron, Node.js 환경 모두 사용 가능 |
| 6 | 서명 검증 | 기존 ownerAuth 로직 재사용 | Ed25519(Solana) / EIP-191(EVM) 검증 로직이 v1.2에서 구현 완료 |
| 7 | 승인 채널 우선순위 | config 기반 5단계 | SDK(ntfy) > SDK(Telegram) > WalletConnect > Telegram Bot `/approve` > REST API. config에서 `preferred_channel` 설정 가능 |
| 8 | ntfy 토픽 보안 | requestId 기반 1회용 토픽 | 응답 토픽에 UUID v7 requestId 포함하여 추측 불가. 만료 후 자동 폐기. ntfy 서버를 self-hosted로 운영하면 추가 보안 확보 |
| 9 | 딥링크 fallback | 유니버셜 링크 실패 시 커스텀 딥링크 | 유니버셜 링크가 동작하지 않는 환경 대비. `deep_link_scheme` + `deep_link_sign_path` 설정 시 fallback |
| 10 | 승인 방법 범위 | 지갑별 `owner_approval_method` | 글로벌 `preferred_wallet` 하나로는 다중 지갑 환경에서 각각 다른 승인 채널을 설정할 수 없음. Solana 지갑은 SDK+ntfy, EVM 지갑은 WalletConnect처럼 지갑마다 최적의 채널 선택 가능. 미설정 시 글로벌 fallback |
| 11 | Admin UI 승인 방법 | 지갑 상세 > Owner Settings 섹션 | REST API만으로도 설정 가능하나, Owner 등록과 승인 방법 설정을 한 화면에서 제공하여 DX 향상. 미구성 인프라 선택 시 경고로 사전 오류 방지 |

---

## E2E 검증 시나리오

**자동화 비율: 100%**

### 프로토콜 + 요청/응답

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | SignRequest 생성 → 유니버셜 링크 URL | PENDING_APPROVAL TX + preferred_wallet=dcent → `https://link.dcentwallet.com/waiaas/sign?data=...` URL assert | [L0] |
| 2 | SignRequest 파싱 (SDK) | parseSignRequest(url) → SignRequest 객체 정상 파싱 + Zod 검증 통과 assert | [L0] |
| 3 | SignResponse 생성 (SDK) | buildSignResponse(requestId, 'approve', sig, addr) → 유효한 SignResponse assert | [L0] |
| 4 | displayMessage 포맷 (SDK) | formatDisplayMessage(request) → "To: 0x5678...\nAmount: 1.5 ETH\n..." 포맷 assert | [L0] |
| 5 | 만료된 요청 → 거부 | expiresAt 초과 SignResponse → SIGN_REQUEST_EXPIRED 에러 assert | [L0] |
| 6 | requestId 불일치 → 거부 | 존재하지 않는 requestId → SIGN_REQUEST_NOT_FOUND 에러 assert | [L0] |
| 7 | 서명 검증 실패 → 거부 | 잘못된 서명값 → INVALID_SIGNATURE 에러 assert | [L0] |

### ntfy 직접 푸시 채널

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 8 | ntfy 요청 publish → 지갑 수신 | mock ntfy 서버 + NtfySigningChannel.sendRequest() → 요청 토픽에 publish assert | [L0] |
| 9 | ntfy 응답 subscribe → 서명 검증 → TX 승인 | mock ntfy 응답 토픽에 SignResponse publish → NtfySigningChannel 수신 → ownerAuth 검증 → TX EXECUTING assert | [L0] |
| 10 | ntfy 거부 응답 → TX 취소 | action='reject' publish → TX CANCELLED assert | [L0] |
| 11 | SDK subscribeToRequests → 콜백 호출 | mock ntfy SSE → subscribeToRequests(topic, callback) → 콜백에 SignRequest 전달 assert | [L0] |
| 12 | SDK sendViaNtfy → HTTP PUT | sendViaNtfy(response, topic) → ntfy PUT 요청 assert | [L0] |

### Telegram 메신저 채널

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 13 | Telegram 서명 요청 → 인라인 버튼 | PENDING_APPROVAL + channel=telegram → Bot 메시지에 [지갑에서 승인하기] 유니버셜 링크 버튼 assert | [L0] |
| 14 | /sign_response → 서명 검증 → TX 승인 | mock Bot `/sign_response base64url(response)` → SignResponseHandler → TX EXECUTING assert | [L0] |
| 15 | SDK sendViaTelegram → 딥링크 URL | sendViaTelegram(response, 'waiaas_bot') → `tg://...` 또는 share intent URL 생성 assert | [L0] |

### 채널 라우팅

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 16 | 채널 우선순위: SDK(ntfy) > WC | SDK ntfy 활성 + WC 세션 활성 → PENDING_APPROVAL → ntfy publish (WC 아님) assert | [L0] |
| 17 | SDK 비활성 → WC fallback | signing_sdk.enabled=false + WC 세션 → WC 서명 요청 assert | [L0] |
| 18 | 모든 SDK/WC 비활성 → Telegram Bot | SDK 비활성 + WC 미연결 + Telegram 설정 → Telegram `/approve` 안내 assert | [L0] |

### 지갑 등록

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 19 | WalletLinkRegistry 등록/조회 | registerWallet(dcent config) → getWalletLink('dcent') → 유니버셜 링크 URL 정상 생성 assert | [L0] |
| 20 | 미등록 지갑 → 에러 | getWalletLink('unknown') → WALLET_NOT_REGISTERED 에러 assert | [L0] |

### 지갑별 승인 방법 설정

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 21 | REST API로 승인 방법 설정 | PUT /wallets/:id/owner { approvalMethod: 'sdk_ntfy' } → 200 + DB 반영 assert | [L0] |
| 22 | 지갑별 승인 방법 → 채널 라우팅 | wallet A(sdk_ntfy) + wallet B(walletconnect) → 각각 다른 채널로 라우팅 assert | [L0] |
| 23 | 승인 방법 미설정 → 글로벌 fallback | owner_approval_method = NULL → config preferred_channel 기반 라우팅 assert | [L0] |
| 24 | 유효하지 않은 승인 방법 → 400 에러 | PUT /wallets/:id/owner { approvalMethod: 'invalid' } → 400 에러 assert | [L0] |
| 25 | Admin UI 승인 방법 변경 | 라디오 선택 → Save → GET /wallets/:id → approvalMethod 반영 assert | [L0] |
| 26 | 미구성 인프라 경고 | ntfy 미설정 + sdk_ntfy 선택 → 경고 메시지 표시 assert | [L0] |

---

## 의존

| 의존 대상 | 이유 |
|----------|------|
| v1.6 (Telegram Bot) | Telegram 메시지 전송 + Long Polling 수신 인프라. `/sign_response` 명령어 추가 |
| v1.6.3 (WalletConnect) | ApprovalRequestBridge 패턴 재사용. 승인 채널 우선순위 라우팅에서 WC와 공존 |
| v1.3 (알림 시스템) | ntfy 채널 인프라 (ntfy HTTP publish). 서명 채널은 알림 채널과 별도이나 ntfy 연결 로직 재사용 |
| v1.2 (인증) | ownerAuth 서명 검증 (Ed25519/SIWE) 재사용 |

---

## 리스크

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| 1 | ntfy 토픽 보안 | 토픽 이름을 추측하면 제3자가 서명 요청을 엿보거나 위조 응답 가능 | 응답 토픽에 UUID v7 requestId 포함 (추측 불가). 서명 검증(ownerAuth)으로 위조 응답 거부. self-hosted ntfy 사용 시 추가 보안. 향후 ntfy 토픽 인증(Authorization 헤더) 지원 검토 |
| 2 | 유니버셜 링크 동작 불일치 | iOS/Android 버전별 유니버셜 링크 동작이 다를 수 있음 | 커스텀 딥링크를 fallback으로 제공. SDK에서 플랫폼 감지 후 최적 방법 선택 |
| 3 | SignRequest 데이터 크기 | base64url 인코딩 JSON이 URL 길이 제한 초과 가능 | metadata 필수 필드만 포함하여 2KB 이내 유지. 초과 시 requestId만 URL에 포함하고 ntfy에서 별도 조회 |
| 4 | Telegram 공유 인텐트 UX | 플랫폼별 공유 인텐트 동작 차이 | SDK에서 Telegram 딥링크, OS share intent, clipboard 순서로 fallback |
| 5 | 지갑 개발사 통합 부담 | AASA + URL 핸들러 + ntfy 구독 + SDK 통합 | 통합 가이드 + 샘플 코드 제공. D'CENT를 레퍼런스 구현으로 확보 |

---

## 범위 외 (후속 확장)

| 항목 | 설명 | 시기 |
|------|------|------|
| Slack 양방향 | Slack Socket Mode 구현으로 서명 응답 수신 | m26-01 이후 |
| Discord 양방향 | Discord Gateway Bot 구현으로 서명 응답 수신 | m26-01 이후 |
| ntfy 토픽 인증 | Authorization 헤더 기반 토픽 접근 제어 | 보안 강화 시 |
| 추가 지갑 파트너 | D'CENT 외 지갑 개발사 SDK 채택 | 사용자 기반 확장 시 |

---

## 예상 규모

| 항목 | 예상 |
|------|------|
| 페이즈 | 2개 (프로토콜 + 데몬 측 구현 + ntfy 채널 1 / @waiaas/wallet-sdk 패키지 + Telegram 채널 + 채널 라우팅 1) |
| 신규 파일 | 14-18개 (데몬 6-7 + wallet-sdk 패키지 8-11) |
| 수정 파일 | 6-8개 (Telegram Bot 명령어, config loader, 승인 우선순위, package.json, wallets 라우트, Admin settings.tsx) |
| 테스트 | 26-30개 |
| DB 마이그레이션 | 1개 (wallets 테이블에 owner_approval_method 컬럼 추가) |
| 신규 패키지 | @waiaas/wallet-sdk (모노레포 packages/wallet-sdk) |

---

*생성일: 2026-02-15*
*선행: v1.6.3 (WalletConnect Owner 승인)*
*관련: D'CENT Wallet, WAIaaS Signing Protocol v1, ntfy (https://ntfy.sh), 유니버셜 링크 (iOS AASA / Android App Links)*
