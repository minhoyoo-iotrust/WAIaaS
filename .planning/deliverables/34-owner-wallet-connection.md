# Owner 지갑 연결 프로토콜 설계 (OWNR-CONN)

**문서 ID:** OWNR-CONN
**작성일:** 2026-02-05
**상태:** 완료
**참조:** SESS-PROTO (30-session-token-protocol.md), TX-PIPE (32-transaction-pipeline-api.md), CORE-06 (29-api-framework-design.md), CORE-01 (24-monorepo-data-directory.md), LOCK-MECH (33-time-lock-approval-mechanism.md)
**요구사항:** OWNR-01 (브라우저 지갑), OWNR-02 (WalletConnect QR), OWNR-03 (서명 승인), API-05 (Owner 엔드포인트)

---

## 1. 문서 개요

### 1.1 목적

Owner는 WAIaaS에서 **유일한 인가 주체**이다. 세션 발급, 거래 승인, Kill Switch 발동, 정책 변경 등 모든 관리 작업은 Owner의 지갑 서명으로 인가된다. 이 문서는 Owner 지갑이 WAIaaS 데몬에 연결되는 전체 프로토콜, 연결 후 사용되는 ownerAuth 미들웨어, 그리고 Owner 전용 API 엔드포인트를 구현 가능한 수준으로 설계한다.

### 1.2 요구사항 매핑

| 요구사항 | 설명 | 충족 섹션 |
|---------|------|-----------|
| OWNR-01 | 브라우저 기반 지갑 연결 (Tauri WebView) | 섹션 3 (Tauri Desktop 연결 플로우) |
| OWNR-02 | WalletConnect v2 QR 코드 기반 연결 | 섹션 2 (WalletConnect v2 아키텍처) + 섹션 3 (시퀀스 다이어그램) |
| OWNR-03 | Owner 서명 기반 거래 승인 | 섹션 5 (ownerAuth 미들웨어) + 섹션 6 (approve/reject API) |
| API-05 | Owner 전용 API 엔드포인트 | 섹션 6 (Owner API 6개 엔드포인트) |

### 1.3 v0.1 -> v0.2 변경 요약

| 항목 | v0.1 (Cloud) | v0.2 (Self-Hosted) | 근거 |
|------|-------------|-------------------|------|
| Owner 인증 | OAuth 2.1 + API Key | SIWS/SIWE 지갑 서명 | 지갑 소유권 = 관리 권한. OAuth 인프라 불필요 |
| 관리 UI | 웹 대시보드 (SaaS) | Tauri Desktop 앱 + CLI | Self-Hosted 로컬 데몬. 웹 서버 없음 |
| 지갑 연결 | MetaMask 브라우저 익스텐션 직접 연결 | WalletConnect v2 QR 코드 (모바일 지갑) | Tauri WebView는 브라우저 익스텐션 미지원 |
| Owner API 인증 | Bearer API Key | Bearer ownerSignaturePayload (SIWS/SIWE) | 단기 서명 기반 인가. 영구 키 탈취 위험 제거 |

### 1.4 Tauri WebView 제약사항

Tauri 2는 시스템 네이티브 WebView(WKWebView/WebView2/WebKitGTK)를 사용하며, **Chrome Extension API를 지원하지 않는다**. 따라서:

- `window.solana` (Phantom 브라우저 익스텐션) 사용 불가
- `window.ethereum` (MetaMask 브라우저 익스텐션) 사용 불가
- **WalletConnect v2 QR 코드 방식이 유일하게 실용적인 Owner 지갑 연결 경로**

향후 Phantom Embedded SDK (`@phantom/browser-sdk`)를 대안으로 검토 가능하나, 현재 **체인 무관 설계 원칙**에 따라 Reown AppKit (Solana + EVM 모두 지원) 우선.

---

## 2. WalletConnect v2 아키텍처 개요

### 2.1 역할 분배

WAIaaS는 WalletConnect v2 프로토콜에서 **dApp(요청자)** 역할을 수행한다. Owner의 모바일 지갑이 Wallet(서명자) 역할이다.

```
┌─────────────────────┐         ┌──────────────────────┐         ┌──────────────────────┐
│ WAIaaS 데몬          │         │ WalletConnect Relay  │         │ Owner 모바일 지갑     │
│ (dApp - 요청자)      │◄───────►│ wss://relay.wc.com   │◄───────►│ (Wallet - 서명자)     │
│                     │   E2E   │ (메시지 중계만)       │   E2E   │ Phantom / MetaMask    │
│ @reown/appkit       │ 암호화   │                      │ 암호화   │ Mobile               │
│ (Tauri WebView 내)  │         │                      │         │                      │
└─────────────────────┘         └──────────────────────┘         └──────────────────────┘
```

**핵심 특성:**
- Relay 서버는 **메시지를 중계할 뿐**, 내용을 읽을 수 없다 (E2E 암호화)
- projectId는 **읽기 전용 식별자** -- Relay 접근 허용일 뿐 보안 시크릿 아님
- 세션이 수립되면 Owner 지갑의 **공개키**를 WAIaaS가 알 수 있다

### 2.2 projectId 관리

```toml
# ~/.waiaas/config.toml

# ─────────────────────────────────────────
# WalletConnect v2 설정
# Reown Cloud에서 무료 projectId 발급: https://cloud.reown.com
# ─────────────────────────────────────────
[walletconnect]
project_id = ""   # 필수. 사용자 직접 발급. 기본값 없음.
```

| 항목 | 값 |
|------|-----|
| 설정 위치 | `config.toml [walletconnect].project_id` |
| 환경변수 | `WAIAAS_WALLETCONNECT_PROJECT_ID` |
| 기본값 | `""` (빈 문자열 -- 미설정 시 Owner 연결 기능 비활성) |
| 발급 방법 | [Reown Cloud](https://cloud.reown.com) 무료 회원가입 후 프로젝트 생성 |
| `waiaas init` 안내 | `"WalletConnect projectId가 설정되지 않았습니다. Owner 지갑 연결을 위해 https://cloud.reown.com 에서 발급하세요."` |

**Zod 스키마 (ConfigSchema 확장):**

```typescript
// packages/core/src/schemas/config.schema.ts (CORE-01 확장)
walletconnect: z.object({
  project_id: z.string().default(''),
}).default({}),
```

### 2.3 지원 네임스페이스

WalletConnect v2 프로토콜에서 네임스페이스(namespace)는 체인 그룹을 식별한다.

| 체인 | 네임스페이스 | CAIP-2 Chain ID | 지원 시점 |
|------|------------|----------------|-----------|
| Solana Mainnet | `solana` | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` | v0.2 |
| Solana Devnet | `solana` | `solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z` | v0.2 |
| Ethereum Mainnet | `eip155` | `eip155:1` | v0.3 |
| Ethereum Sepolia | `eip155` | `eip155:11155111` | v0.3 |

### 2.4 지원 메서드

| 체인 | 메서드 | 용도 |
|------|--------|------|
| Solana | `solana_signMessage` | SIWS 메시지 서명 (Owner 인증) |
| EVM (v0.3) | `personal_sign` | SIWE 메시지 서명 (Owner 인증) |

**참고:** 트랜잭션 서명(`solana_signTransaction`, `eth_signTransaction`)은 사용하지 않는다. WAIaaS 데몬이 에이전트의 개인키로 직접 서명하며, Owner 지갑은 **관리 작업 인가(메시지 서명)에만** 사용된다.

---

## 3. Owner 지갑 연결 플로우 -- Tauri Desktop

### 3.1 전체 시퀀스 다이어그램

```mermaid
sequenceDiagram
    participant OwnerUI as OwnerUI (Tauri WebView)
    participant AppKit as @reown/appkit
    participant Relay as WalletConnect Relay
    participant OwnerWallet as Owner 지갑 (Phantom Mobile)
    participant Daemon as WAIaaS 데몬 API

    Note over OwnerUI,Daemon: ═══ Phase A: QR 코드 생성 + 표시 ═══

    OwnerUI->>AppKit: "지갑 연결" 버튼 클릭
    AppKit->>AppKit: SignClient.connect() 호출
    AppKit->>Relay: 페어링 토픽 등록
    Relay-->>AppKit: 페어링 URI 반환 (wc:...)
    AppKit->>OwnerUI: QR 코드 모달 표시 (페어링 URI 인코딩)

    Note over OwnerUI,Daemon: ═══ Phase B: QR 스캔 + 세션 수립 ═══

    OwnerWallet->>OwnerWallet: QR 코드 스캔
    OwnerWallet->>Relay: 페어링 요청 (E2E 암호화)
    Relay->>AppKit: 페어링 수립 알림

    AppKit->>Relay: 세션 제안 (지원 체인/메서드)
    Relay->>OwnerWallet: 세션 제안 전달
    OwnerWallet->>OwnerWallet: 세션 승인 (사용자 확인)
    OwnerWallet->>Relay: 세션 수락 (공개키 + 승인된 체인/메서드)
    Relay->>AppKit: 세션 수립 완료

    Note over OwnerUI,Daemon: ═══ Phase C: Owner 정보 등록 ═══

    AppKit->>AppKit: session 이벤트 -> Owner 공개키 추출
    AppKit->>OwnerUI: 연결 성공 콜백 (address, chain, sessionTopic)
    OwnerUI->>Daemon: POST /v1/owner/connect { address, chain, wcSessionTopic }
    Daemon->>Daemon: owner_wallets 테이블 INSERT (또는 기존 레코드 교체)
    Daemon-->>OwnerUI: 201 { ownerId, address, chain, connectedAt }

    Note over OwnerUI,Daemon: ═══ 연결 완료 -- 이후 서명 요청 가능 ═══
```

### 3.2 Reown AppKit 초기화 코드 패턴

```typescript
// packages/desktop/src/lib/wallet-connect.ts (Tauri WebView 내)
import { createAppKit } from '@reown/appkit'
import { solana, solanaDevnet } from '@reown/appkit/networks'

// 1. AppKit 인스턴스 초기화
const appKit = createAppKit({
  projectId: config.walletconnect.project_id,  // config.toml에서 로드
  networks: [solana, solanaDevnet],
  metadata: {
    name: 'WAIaaS',
    description: 'Self-Hosted Wallet-as-a-Service for AI Agents',
    url: 'http://127.0.0.1:3100',
    icons: ['https://waiaas.dev/icon.png'],
  },
  features: {
    email: false,       // 소셜 로그인 비활성
    socials: false,     // 소셜 로그인 비활성
    onramp: false,      // 온램프 비활성
  },
})

// 2. 연결 이벤트 리스너
appKit.subscribeEvents((event) => {
  switch (event.data.event) {
    case 'CONNECT_SUCCESS': {
      const { address, chainId } = event.data.properties
      // Daemon에 Owner 정보 등록
      registerOwner(address, chainId, appKit.getWalletConnectSession()?.topic)
      break
    }
    case 'DISCONNECT_SUCCESS': {
      // Daemon에서 Owner 연결 해제
      disconnectOwner()
      break
    }
    case 'SESSION_UPDATE': {
      // 세션 갱신 시 lastActiveAt 업데이트
      updateOwnerActivity()
      break
    }
  }
})

// 3. 연결 모달 열기 (사용자 클릭 시)
function openConnectModal(): void {
  appKit.open()  // QR 코드 모달 자동 표시
}
```

### 3.3 Daemon에 Owner 등록 API

```typescript
// POST /v1/owner/connect 호출 (Tauri WebView -> Daemon)
async function registerOwner(
  address: string,
  chain: string,
  wcSessionTopic?: string,
): Promise<void> {
  const response = await fetch('http://127.0.0.1:3100/v1/owner/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, chain, wcSessionTopic }),
  })
  if (!response.ok) {
    throw new Error(`Owner 등록 실패: ${response.status}`)
  }
}
```

**POST /v1/owner/connect:**
- **인증:** 없음 (초기 연결이므로 아직 Owner 서명 불가). 단, `hostValidation` 미들웨어로 localhost만 허용
- **보안:** localhost 전용이므로 외부 접근 불가. 최초 1회만 허용 (이미 Owner가 등록된 경우 409)
- **요청:** `{ address: string, chain: 'solana' | 'ethereum', wcSessionTopic?: string }`
- **응답:** `201 { ownerId, address, chain, connectedAt }`
- **에러:** `OWNER_ALREADY_CONNECTED (409)` -- 기존 Owner 해제 후 재연결 필요

---

## 4. Owner 지갑 연결 플로우 -- CLI 대안

### 4.1 CLI `waiaas owner connect` 커맨드

Tauri Desktop 없이 터미널에서 직접 Owner 지갑을 연결하는 대안 경로. CLI에서는 `@reown/appkit` 불필요하며, `@walletconnect/sign-client`를 직접 사용한다.

```
$ waiaas owner connect --chain solana

WAIaaS Owner Wallet Connection
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. 아래 QR 코드를 모바일 지갑 (Phantom/MetaMask)으로 스캔하세요:

   ██████████████████████████████████
   ██ ▄▄▄▄▄ █▀▀▄█ ▄▀▀▄█ ▄▄▄▄▄ ██
   ██ █   █ █▀▄▀▀▄█▀▀▄█ █   █ ██
   ██ █▄▄▄█ ██▄ ▀▄ ▄▀██ █▄▄▄█ ██
   ██▄▄▄▄▄▄▄█▄█▄█▄█▄█▄█▄▄▄▄▄▄▄██
   ██████████████████████████████████

2. 지갑에서 연결 요청을 승인하세요.
3. 대기 중... (120초 타임아웃)

✓ Owner 지갑 연결 완료
  주소: 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
  체인: solana
  연결 시각: 2026-02-05T10:30:00.000Z
```

### 4.2 CLI 연결 플로우

```typescript
// packages/cli/src/commands/owner-connect.ts
import { SignClient } from '@walletconnect/sign-client'
import QRCode from 'qrcode-terminal'

async function ownerConnect(chain: 'solana' | 'ethereum'): Promise<void> {
  // 1. Sign Client 초기화
  const signClient = await SignClient.init({
    projectId: config.walletconnect.project_id,
    metadata: {
      name: 'WAIaaS CLI',
      description: 'WAIaaS Owner Wallet Connection',
      url: 'http://127.0.0.1:3100',
      icons: [],
    },
  })

  // 2. 세션 요청 (URI 생성)
  const { uri, approval } = await signClient.connect({
    requiredNamespaces: chain === 'solana'
      ? {
          solana: {
            chains: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'],
            methods: ['solana_signMessage'],
            events: [],
          },
        }
      : {
          eip155: {
            chains: ['eip155:1'],
            methods: ['personal_sign'],
            events: ['accountsChanged'],
          },
        },
  })

  // 3. 터미널에 QR 코드 출력
  if (uri) {
    QRCode.generate(uri, { small: true }, (qr: string) => {
      console.log('\n아래 QR 코드를 모바일 지갑으로 스캔하세요:\n')
      console.log(qr)
    })
  }

  // 4. 세션 수립 대기 (120초 타임아웃)
  console.log('\n대기 중... (120초 타임아웃)')
  const session = await Promise.race([
    approval(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('연결 타임아웃')), 120_000)
    ),
  ])

  // 5. Owner 공개키 추출
  const accounts = Object.values(session.namespaces)
    .flatMap((ns: { accounts: string[] }) => ns.accounts)
  // CAIP-10 형식: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:7xKXtg..."
  const [namespace, chainId, address] = accounts[0].split(':')

  // 6. Daemon에 Owner 등록
  await registerOwner(address, chain, session.topic)

  console.log(`\n✓ Owner 지갑 연결 완료`)
  console.log(`  주소: ${address}`)
  console.log(`  체인: ${chain}`)
  console.log(`  연결 시각: ${new Date().toISOString()}`)
}
```

### 4.3 CLI vs Desktop 비교

| 항목 | Tauri Desktop | CLI |
|------|--------------|-----|
| QR 표시 | @reown/appkit 모달 (그래픽) | qrcode-terminal (ASCII art) |
| WC 라이브러리 | @reown/appkit (고수준) | @walletconnect/sign-client (저수준) |
| 서명 요청 UI | 모바일 지갑 앱 알림 | 모바일 지갑 앱 알림 |
| 세션 유지 | AppKit localStorage 캐시 | 파일 기반 세션 캐시 (~/.waiaas/wc-session.json) |
| 자동 재연결 | AppKit 내장 | CLI 시작 시 수동 재연결 시도 |
| 사용 편의성 | 높음 (GUI) | 중간 (터미널) |

---

## 5. ownerAuth 미들웨어 상세 설계

### 5.1 CORE-06 ownerAuth stub 완성

CORE-06에서 `ownerAuth`는 `/v1/owner/*` 라우트에만 적용되는 **라우트 레벨 미들웨어**로 정의되었다. Phase 7의 `owner-verifier` 유틸리티(`verifySIWS`, `verifySIWE`)를 재사용하여 완성한다.

### 5.2 인증 방식

Owner 전용 API는 매 요청마다 **SIWS/SIWE 서명**을 포함한다. 세션 기반 인증(JWT)이 아닌 **요청별 서명(per-request signature)** 방식이다.

```
Authorization: Bearer <ownerSignaturePayload>
```

### 5.3 ownerSignaturePayload 구조

`ownerSignaturePayload`는 base64url 인코딩된 JSON 문자열이다:

```typescript
// packages/core/src/schemas/owner-auth.schema.ts
import { z } from 'zod'

export const OwnerSignaturePayloadSchema = z.object({
  /** 체인 식별자 */
  chain: z.enum(['solana', 'ethereum']),

  /** Owner 지갑 공개키/주소 */
  address: z.string(),

  /** 수행하려는 작업 */
  action: z.enum([
    'approve_tx',
    'reject_tx',
    'kill_switch',
    'manage_sessions',
    'update_settings',
  ]),

  /** 일회성 nonce (LRU 캐시 기반, SESS-PROTO와 동일) */
  nonce: z.string(),

  /** 요청 시각 (ISO 8601, 5분 이내만 유효) */
  timestamp: z.string().datetime(),

  /** SIWS/SIWE 표준 메시지 원문 */
  message: z.string(),

  /** 서명 값 (Solana: base58, Ethereum: hex) */
  signature: z.string(),
})

export type OwnerSignaturePayload = z.infer<typeof OwnerSignaturePayloadSchema>
```

**payload 예시 (base64url 디코딩 후):**

```json
{
  "chain": "solana",
  "address": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "action": "approve_tx",
  "nonce": "a1b2c3d4e5f67890a1b2c3d4e5f67890",
  "timestamp": "2026-02-05T10:30:00.000Z",
  "message": "localhost:3100 wants you to sign in with your Solana account:\n7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU\n\nWAIaaS Owner Action: approve_tx\n\nURI: http://localhost:3100\nVersion: 1\nChain ID: 1\nNonce: a1b2c3d4e5f67890a1b2c3d4e5f67890\nIssued At: 2026-02-05T10:30:00.000Z\nExpiration Time: 2026-02-05T10:35:00.000Z",
  "signature": "3Kp8V2...base58...signature"
}
```

### 5.4 Owner 서명 메시지 포맷 (SIWS/SIWE 표준 준수)

Owner가 서명하는 메시지는 SESS-PROTO의 세션 생성 메시지와 동일한 EIP-4361 포맷을 따르되, **statement에 action을 명시**한다:

```
localhost:3100 wants you to sign in with your Solana account:
7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU

WAIaaS Owner Action: approve_tx

URI: http://localhost:3100
Version: 1
Chain ID: 1
Nonce: a1b2c3d4e5f67890a1b2c3d4e5f67890
Issued At: 2026-02-05T10:30:00.000Z
Expiration Time: 2026-02-05T10:35:00.000Z
```

| 필드 | 값 | 설명 |
|------|-----|------|
| domain | `localhost:3100` | WAIaaS 데몬 호스트 |
| address | Owner 공개키/주소 | 서명자 식별 |
| statement | `WAIaaS Owner Action: {action}` | 수행할 작업 명시 (사용자가 서명 시 확인 가능) |
| URI | `http://localhost:3100` | 데몬 URL |
| nonce | 서버 발급 nonce | 일회성 재생 방지 |
| issuedAt | ISO 8601 | 서명 시각 |
| expirationTime | issuedAt + 5분 | 서명 유효 기간 |

### 5.5 ownerAuth 미들웨어 검증 로직 (8단계)

```typescript
// packages/daemon/src/server/middleware/owner-auth.ts
import { createMiddleware } from 'hono/factory'
import { verifySIWS, verifySIWE } from '../../services/owner-verifier.js'
import { verifyAndConsumeNonce } from '../../infrastructure/cache/nonce-cache.js'
import { OwnerSignaturePayloadSchema } from '@waiaas/core/schemas'
import type { AppBindings } from '../types.js'

/** ownerAuth 미들웨어가 기대하는 action 매핑 */
const ROUTE_ACTION_MAP: Record<string, string> = {
  'POST /v1/owner/approve': 'approve_tx',
  'POST /v1/owner/reject': 'reject_tx',
  'POST /v1/owner/kill-switch': 'kill_switch',
  'GET /v1/owner/pending-approvals': 'manage_sessions',
  'PUT /v1/owner/policies': 'update_settings',
  'POST /v1/owner/policies': 'update_settings',
}

export function ownerAuthMiddleware(db: DrizzleInstance) {
  return createMiddleware<AppBindings>(async (c, next) => {

    // ═══ Step 1: Authorization 헤더 파싱 + payload 추출 ═══
    const authHeader = c.req.header('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      throw new WaiaasError(
        'UNAUTHORIZED',
        'Owner 서명이 필요합니다. Authorization: Bearer <payload> 형식으로 전달하세요.',
        401,
      )
    }

    const token = authHeader.slice(7) // 'Bearer ' 제거
    let payload: OwnerSignaturePayload
    try {
      const decoded = Buffer.from(token, 'base64url').toString('utf-8')
      payload = OwnerSignaturePayloadSchema.parse(JSON.parse(decoded))
    } catch {
      throw new WaiaasError(
        'INVALID_SIGNATURE',
        'Owner 서명 페이로드 형식이 올바르지 않습니다.',
        401,
      )
    }

    // ═══ Step 2: timestamp 유효성 (5분 이내) ═══
    const now = Date.now()
    const signedAt = new Date(payload.timestamp).getTime()
    const MAX_AGE_MS = 5 * 60 * 1000 // 5분
    if (Math.abs(now - signedAt) > MAX_AGE_MS) {
      throw new WaiaasError(
        'INVALID_SIGNATURE',
        'Owner 서명이 만료되었습니다. 5분 이내에 서명된 요청만 유효합니다.',
        401,
      )
    }

    // ═══ Step 3: nonce 유효성 (일회성, LRU에서 확인 후 삭제) ═══
    const nonceValid = verifyAndConsumeNonce(payload.nonce)
    if (!nonceValid) {
      throw new WaiaasError(
        'INVALID_NONCE',
        '유효하지 않거나 이미 사용된 nonce입니다.',
        401,
      )
    }

    // ═══ Step 4: chain 분기 -> SIWS/SIWE 서명 검증 ═══
    // Phase 7 owner-verifier 유틸리티 재사용
    const verifyResult = payload.chain === 'solana'
      ? await verifySIWS({
          message: payload.message,
          signature: payload.signature,
          publicKey: payload.address,
        })
      : await verifySIWE({
          message: payload.message,
          signature: payload.signature,
          ownerAddress: payload.address,
        })

    if (!verifyResult.valid) {
      throw new WaiaasError(
        'INVALID_SIGNATURE',
        'Owner 서명 검증에 실패했습니다.',
        401,
      )
    }

    // ═══ Step 5: 서명자 주소 == 등록된 Owner 주소 확인 ═══
    const ownerWallet = await db.select()
      .from(ownerWallets)
      .where(eq(ownerWallets.address, payload.address))
      .get()

    if (!ownerWallet) {
      throw new WaiaasError(
        'OWNER_MISMATCH',
        '등록된 Owner 지갑 주소와 서명자 주소가 일치하지 않습니다.',
        403,
      )
    }

    // ═══ Step 6: action == 요청된 API 경로의 기대 action 확인 ═══
    const method = c.req.method
    const path = c.req.path.replace(/\/[0-9a-f-]{36}$/, '') // UUID 경로 파라미터 제거
    const routeKey = `${method} ${path}`
    const expectedAction = ROUTE_ACTION_MAP[routeKey]

    if (expectedAction && payload.action !== expectedAction) {
      throw new WaiaasError(
        'INVALID_SIGNATURE',
        `서명된 action(${payload.action})이 요청 경로의 기대 action(${expectedAction})과 일치하지 않습니다.`,
        403,
      )
    }

    // ═══ Step 7: 성공 -> Hono 컨텍스트에 Owner 정보 설정 ═══
    c.set('ownerAddress', payload.address)
    c.set('ownerChain', payload.chain)

    // lastActiveAt 갱신
    await db.update(ownerWallets)
      .set({ lastActiveAt: new Date().toISOString() })
      .where(eq(ownerWallets.id, ownerWallet.id))

    // ═══ Step 8: next() ═══
    await next()
  })
}
```

### 5.6 ownerAuth 검증 단계 요약

| 단계 | 검증 항목 | 실패 시 에러 | HTTP |
|------|----------|-------------|------|
| 1 | Authorization 헤더 파싱 + payload 디코딩 | `UNAUTHORIZED` | 401 |
| 2 | timestamp 유효성 (5분 이내) | `INVALID_SIGNATURE` | 401 |
| 3 | nonce 일회성 (LRU 캐시 확인 + 삭제) | `INVALID_NONCE` | 401 |
| 4 | SIWS/SIWE 서명 암호학적 검증 | `INVALID_SIGNATURE` | 401 |
| 5 | 서명자 == owner_wallets.address | `OWNER_MISMATCH` | 403 |
| 6 | action == 라우트 기대 action | `INVALID_SIGNATURE` | 403 |
| 7 | 컨텍스트 설정 (ownerAddress, ownerChain) | - | - |
| 8 | next() 호출 | - | - |

### 5.7 AppBindings 타입 확장 (Phase 8 보완)

```typescript
// packages/daemon/src/server/types.ts (CORE-06 + SESS-PROTO 확장)
type AppBindings = {
  Variables: {
    db: DrizzleInstance
    keyStore: ILocalKeyStore
    adapters: AdapterRegistry
    requestId: string
    // Phase 7 -- sessionAuth에서 설정
    sessionId?: string
    agentId?: string
    constraints?: SessionConstraints
    usageStats?: SessionUsageStats
    // Phase 8 -- ownerAuth에서 설정
    ownerAddress?: string
    ownerChain?: 'solana' | 'ethereum'
  }
}
```

### 5.8 ownerAuth vs sessionAuth 비교

| 항목 | sessionAuth | ownerAuth |
|------|------------|-----------|
| 적용 범위 | 전역 미들웨어 (`/v1/*`) | 라우트 레벨 (`/v1/owner/*`) |
| 인증 방식 | JWT 토큰 (상태 기반) | 요청별 SIWS/SIWE 서명 (무상태) |
| 토큰 수명 | 최대 7일 | 요청 시점 5분 이내 서명 |
| nonce | 세션 생성 시 1회 사용 | 매 요청마다 새 nonce |
| 재생 방지 | JWT jti + DB 폐기 확인 | nonce 일회성 + timestamp 5분 제한 |
| 사용자 | AI 에이전트 | Owner (인간) |
| DB 의존성 | Stage 2에서 sessions 조회 | Step 5에서 owner_wallets 조회 |
| Phase 7 재사용 | owner-verifier (세션 생성 시) | owner-verifier (매 요청 시) |

### 5.9 ownerAuth 라우트 등록 패턴

```typescript
// packages/daemon/src/server/routes/owner.ts
import { OpenAPIHono } from '@hono/zod-openapi'
import { ownerAuthMiddleware } from '../middleware/owner-auth.js'
import type { AppBindings } from '../types.js'

export function registerOwnerRoutes(
  app: OpenAPIHono<AppBindings>,
  deps: AppContext,
): void {
  // ownerAuth를 라우트 그룹에 적용
  app.use('/*', ownerAuthMiddleware(deps.db))

  // POST /v1/owner/approve/:txId -- 섹션 6에서 상세
  // POST /v1/owner/reject/:txId -- 섹션 6에서 상세
  // POST /v1/owner/kill-switch -- 섹션 6에서 상세
  // GET /v1/owner/pending-approvals -- 섹션 6에서 상세
  // PUT /v1/owner/policies/:policyId -- 섹션 6에서 상세
  // POST /v1/owner/policies -- 섹션 6에서 상세
}
```

**참고:** `/v1/owner/connect`와 `/v1/owner/disconnect`는 ownerAuth 적용 대상이 아니다:
- `/v1/owner/connect`: 최초 연결이므로 아직 Owner 서명 불가 (localhost 보안으로 보호)
- `/v1/owner/disconnect`: ownerAuth 적용 (연결 해제는 Owner만 가능)

---

## 6. Owner 전용 API 엔드포인트 (API-05)

모든 Owner 엔드포인트는 `ownerAuth` 미들웨어 적용 (SIWS/SIWE 서명 필수). 예외: `/v1/owner/connect` (초기 연결).

### 6.1 엔드포인트 전체 목록

| # | Method | Path | 인증 | action | 설명 |
|---|--------|------|------|--------|------|
| 1 | POST | `/v1/owner/connect` | None (localhost) | - | Owner 지갑 초기 등록 |
| 2 | DELETE | `/v1/owner/disconnect` | ownerAuth | - | Owner 지갑 연결 해제 |
| 3 | POST | `/v1/owner/approve/:txId` | ownerAuth | `approve_tx` | 거래 승인 (APPROVAL 티어) |
| 4 | POST | `/v1/owner/reject/:txId` | ownerAuth | `reject_tx` | 거래 거절 |
| 5 | POST | `/v1/owner/kill-switch` | ownerAuth | `kill_switch` | Kill Switch 발동 |
| 6 | GET | `/v1/owner/pending-approvals` | ownerAuth | `manage_sessions` | 승인 대기 거래 목록 |
| 7 | PUT | `/v1/owner/policies/:policyId` | ownerAuth | `update_settings` | 정책 수정 |
| 8 | POST | `/v1/owner/policies` | ownerAuth | `update_settings` | 정책 생성 |

### 6.2 POST /v1/owner/approve/:txId (거래 승인)

LOCK-MECH의 APPROVAL 플로우에서 QUEUED 상태의 거래를 Owner가 승인한다.

**인증:** ownerAuth (action=`approve_tx`)

**경로 파라미터:**

```typescript
const ApproveParamsSchema = z.object({
  txId: z.string().uuid().openapi({ description: '거래 UUID v7' }),
})
```

**응답 스키마 (200 OK):**

```typescript
const ApproveResponseSchema = z.object({
  transactionId: z.string().uuid(),
  status: z.literal('EXECUTING'),
  approvedAt: z.string().datetime(),
  approvedBy: z.string().openapi({ description: 'Owner 지갑 주소' }),
}).openapi('ApproveResponse')
```

**처리 로직:**

```typescript
// POST /v1/owner/approve/:txId 핸들러
async function handleApprove(c: Context): Promise<Response> {
  const { txId } = c.req.param()
  const ownerAddress = c.get('ownerAddress')

  // 1. 트랜잭션 조회 + 상태 검증 (BEGIN IMMEDIATE)
  const result = sqlite.transaction(() => {
    const tx = sqlite.prepare(
      'SELECT id, status, tier, queued_at, expires_at FROM transactions WHERE id = ?'
    ).get(txId)

    if (!tx) throw new WaiaasError('TX_NOT_FOUND', '거래를 찾을 수 없습니다.', 404)
    if (tx.status !== 'QUEUED') {
      throw new WaiaasError('TX_NOT_PENDING_APPROVAL', `현재 상태(${tx.status})에서 승인할 수 없습니다.`, 409)
    }

    // 만료 확인
    const now = Math.floor(Date.now() / 1000)
    if (tx.expires_at && now > tx.expires_at) {
      // 만료된 거래 -> EXPIRED 전이
      sqlite.prepare(
        "UPDATE transactions SET status = 'EXPIRED', error = 'APPROVAL_TIMEOUT' WHERE id = ?"
      ).run(txId)
      throw new WaiaasError('TX_EXPIRED', '승인 대기 시간이 만료되었습니다.', 410)
    }

    // 2. 상태 전이: QUEUED -> EXECUTING
    sqlite.prepare(
      "UPDATE transactions SET status = 'EXECUTING' WHERE id = ? AND status = 'QUEUED'"
    ).run(txId)

    return tx
  }).immediate()

  // 3. Stage 5a 실행 트리거 (비동기 -- buildTransaction부터 재실행)
  triggerStage5Execution(txId)

  // 4. audit_log 기록
  await insertAuditLog(db, {
    eventType: 'TX_APPROVED',
    actor: ownerAddress,
    transactionId: txId,
    severity: 'info',
    details: { approvedBy: ownerAddress },
  })

  return c.json({
    transactionId: txId,
    status: 'EXECUTING',
    approvedAt: new Date().toISOString(),
    approvedBy: ownerAddress,
  }, 200)
}
```

**에러:**

| 에러 코드 | HTTP | 조건 |
|----------|------|------|
| `TX_NOT_FOUND` | 404 | txId에 해당하는 거래 없음 |
| `TX_NOT_PENDING_APPROVAL` | 409 | 거래 상태가 QUEUED가 아님 |
| `TX_EXPIRED` | 410 | 승인 대기 시간 만료 |
| `OWNER_MISMATCH` | 403 | ownerAuth Step 5 실패 |

### 6.3 POST /v1/owner/reject/:txId (거래 거절)

DELAY 또는 APPROVAL 티어의 대기 중인 거래를 Owner가 거절한다.

**인증:** ownerAuth (action=`reject_tx`)

**경로 파라미터:**

```typescript
const RejectParamsSchema = z.object({
  txId: z.string().uuid(),
})
```

**요청 본문 (선택):**

```typescript
const RejectRequestSchema = z.object({
  reason: z.string().max(500).optional().openapi({ description: '거절 사유' }),
}).optional()
```

**응답 스키마 (200 OK):**

```typescript
const RejectResponseSchema = z.object({
  transactionId: z.string().uuid(),
  status: z.literal('CANCELLED'),
  rejectedAt: z.string().datetime(),
  rejectedBy: z.string(),
  reason: z.string().optional(),
}).openapi('RejectResponse')
```

**처리 로직:**

```typescript
async function handleReject(c: Context): Promise<Response> {
  const { txId } = c.req.param()
  const ownerAddress = c.get('ownerAddress')
  const body = await c.req.json().catch(() => ({}))
  const reason = body?.reason ?? 'OWNER_REJECTED'

  sqlite.transaction(() => {
    const tx = sqlite.prepare(
      'SELECT id, status FROM transactions WHERE id = ?'
    ).get(txId)

    if (!tx) throw new WaiaasError('TX_NOT_FOUND', '거래를 찾을 수 없습니다.', 404)
    if (tx.status !== 'QUEUED' && tx.status !== 'PENDING') {
      throw new WaiaasError('TX_NOT_PENDING', `현재 상태(${tx.status})에서 거절할 수 없습니다.`, 409)
    }

    // QUEUED/PENDING -> CANCELLED
    sqlite.prepare(
      "UPDATE transactions SET status = 'CANCELLED', error = ? WHERE id = ?"
    ).run(`OWNER_REJECTED: ${reason}`, txId)

    // reserved_amount 롤백 (TOCTOU 방지 -- LOCK-MECH 참조)
    // reserved_amount가 있으면 해제
  }).immediate()

  await insertAuditLog(db, {
    eventType: 'TX_CANCELLED',
    actor: ownerAddress,
    transactionId: txId,
    severity: 'info',
    details: { rejectedBy: ownerAddress, reason },
  })

  return c.json({
    transactionId: txId,
    status: 'CANCELLED',
    rejectedAt: new Date().toISOString(),
    rejectedBy: ownerAddress,
    reason,
  }, 200)
}
```

**에러:**

| 에러 코드 | HTTP | 조건 |
|----------|------|------|
| `TX_NOT_FOUND` | 404 | txId에 해당하는 거래 없음 |
| `TX_NOT_PENDING` | 409 | 거래 상태가 QUEUED/PENDING이 아님 |

### 6.4 POST /v1/owner/kill-switch (Kill Switch 발동)

모든 세션 폐기, 대기 거래 취소, 에이전트 정지를 일괄 수행한다. 08-04에서 상세 캐스케이드 설계.

**인증:** ownerAuth (action=`kill_switch`)

**요청 스키마:**

```typescript
const KillSwitchRequestSchema = z.object({
  reason: z.string().max(500).openapi({
    description: 'Kill Switch 발동 사유',
    example: '비정상 거래 패턴 감지',
  }),
})
```

**응답 스키마 (200 OK):**

```typescript
const KillSwitchResponseSchema = z.object({
  activated: z.literal(true),
  timestamp: z.string().datetime(),
  sessionsRevoked: z.number().int().openapi({ description: '폐기된 세션 수' }),
  txCancelled: z.number().int().openapi({ description: '취소된 거래 수' }),
  agentsSuspended: z.number().int().openapi({ description: '정지된 에이전트 수' }),
}).openapi('KillSwitchResponse')
```

**처리 로직 개요 (08-04에서 상세화):**

```typescript
async function handleKillSwitch(c: Context): Promise<Response> {
  const ownerAddress = c.get('ownerAddress')
  const { reason } = await c.req.json()

  // Kill Switch 중복 발동 방지
  const existing = await getKillSwitchStatus(db)
  if (existing?.active) {
    throw new WaiaasError('KILL_SWITCH_ALREADY_ACTIVE', 'Kill Switch가 이미 활성화되어 있습니다.', 409)
  }

  // 캐스케이드 실행 (08-04 상세)
  const result = await executeKillSwitch(db, sqlite, keyStore, notificationService, reason)

  await insertAuditLog(db, {
    eventType: 'KILL_SWITCH_ACTIVATED',
    actor: ownerAddress,
    severity: 'critical',
    details: { reason, ...result },
  })

  return c.json({
    activated: true,
    timestamp: new Date().toISOString(),
    sessionsRevoked: result.sessionsRevoked,
    txCancelled: result.txCancelled,
    agentsSuspended: result.agentsSuspended,
  }, 200)
}
```

**에러:**

| 에러 코드 | HTTP | 조건 |
|----------|------|------|
| `KILL_SWITCH_ALREADY_ACTIVE` | 409 | Kill Switch 이미 활성 상태 |

### 6.5 GET /v1/owner/pending-approvals (승인 대기 거래 목록)

APPROVAL 또는 DELAY 티어에서 QUEUED 상태인 거래 목록을 조회한다.

**인증:** ownerAuth (action=`manage_sessions`)

**쿼리 파라미터:**

```typescript
const PendingApprovalsQuerySchema = z.object({
  agentId: z.string().uuid().optional().openapi({ description: '에이전트 필터 (선택)' }),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().uuid().optional().openapi({ description: '페이지네이션 커서 (UUID v7)' }),
})
```

**응답 스키마 (200 OK):**

```typescript
const PendingApprovalSummarySchema = z.object({
  txId: z.string().uuid(),
  agentId: z.string().uuid(),
  agentName: z.string(),
  type: z.string().openapi({ description: '거래 유형 (TRANSFER 등)' }),
  amount: z.string().openapi({ description: '금액 (최소 단위)' }),
  toAddress: z.string(),
  chain: z.string(),
  tier: z.enum(['DELAY', 'APPROVAL']),
  queuedAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
}).openapi('PendingApprovalSummary')

const PendingApprovalsResponseSchema = z.object({
  transactions: z.array(PendingApprovalSummarySchema),
  nextCursor: z.string().uuid().optional(),
}).openapi('PendingApprovalsResponse')
```

**처리 로직:**

```typescript
async function handlePendingApprovals(c: Context): Promise<Response> {
  const { agentId, limit, cursor } = c.req.query()

  // 커서 기반 페이지네이션 (UUID v7 시간 순서 -- TX-PIPE 결정)
  let query = db.select({
    txId: transactions.id,
    agentId: transactions.agentId,
    agentName: agents.name,
    type: transactions.type,
    amount: transactions.amount,
    toAddress: transactions.toAddress,
    chain: transactions.chain,
    tier: transactions.tier,
    queuedAt: transactions.queuedAt,
    expiresAt: transactions.expiresAt,
  })
    .from(transactions)
    .leftJoin(agents, eq(transactions.agentId, agents.id))
    .where(eq(transactions.status, 'QUEUED'))
    .orderBy(desc(transactions.id))
    .limit(parsedLimit + 1)  // 1개 더 조회하여 nextCursor 결정

  if (agentId) query = query.where(eq(transactions.agentId, agentId))
  if (cursor) query = query.where(lt(transactions.id, cursor))

  const rows = await query.all()
  const hasMore = rows.length > parsedLimit
  const items = hasMore ? rows.slice(0, parsedLimit) : rows

  return c.json({
    transactions: items,
    nextCursor: hasMore ? items[items.length - 1].txId : undefined,
  }, 200)
}
```

### 6.6 PUT /v1/owner/policies/:policyId (정책 수정)

LOCK-MECH에서 정의한 policies 테이블의 기존 정책을 수정한다.

**인증:** ownerAuth (action=`update_settings`)

**경로 파라미터:**

```typescript
const PolicyParamsSchema = z.object({
  policyId: z.string().uuid(),
})
```

**요청 스키마:**

```typescript
const UpdatePolicyRequestSchema = z.object({
  rules: z.union([
    SpendingLimitRuleSchema,
    WhitelistRuleSchema,
    TimeRestrictionRuleSchema,
    RateLimitRuleSchema,
  ]).optional().openapi({ description: '정책 규칙 (LOCK-MECH PolicyRuleSchema)' }),
  enabled: z.boolean().optional(),
  priority: z.number().int().optional(),
}).openapi('UpdatePolicyRequest')
```

**응답 스키마 (200 OK):**

```typescript
const PolicySummarySchema = z.object({
  id: z.string().uuid(),
  agentId: z.string().uuid().nullable(),
  type: z.enum(['SPENDING_LIMIT', 'WHITELIST', 'TIME_RESTRICTION', 'RATE_LIMIT']),
  rules: z.unknown(),
  priority: z.number().int(),
  enabled: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).openapi('PolicySummary')

const UpdatePolicyResponseSchema = z.object({
  policy: PolicySummarySchema,
  updatedAt: z.string().datetime(),
}).openapi('UpdatePolicyResponse')
```

**에러:**

| 에러 코드 | HTTP | 조건 |
|----------|------|------|
| `POLICY_NOT_FOUND` | 404 | policyId에 해당하는 정책 없음 |
| `INVALID_RULES` | 400 | rules JSON이 해당 type의 Zod 스키마 검증 실패 |

### 6.7 POST /v1/owner/policies (정책 생성)

새 정책을 생성한다.

**인증:** ownerAuth (action=`update_settings`)

**요청 스키마:**

```typescript
const CreatePolicyRequestSchema = z.object({
  agentId: z.string().uuid().optional().openapi({
    description: '대상 에이전트 ID. 미지정 시 글로벌 정책',
  }),
  type: z.enum(['SPENDING_LIMIT', 'WHITELIST', 'TIME_RESTRICTION', 'RATE_LIMIT']),
  rules: z.union([
    SpendingLimitRuleSchema,
    WhitelistRuleSchema,
    TimeRestrictionRuleSchema,
    RateLimitRuleSchema,
  ]).openapi({ description: '정책 규칙 (type에 맞는 스키마)' }),
  priority: z.number().int().optional().default(0),
  enabled: z.boolean().optional().default(true),
}).openapi('CreatePolicyRequest')
```

**응답 스키마 (201 Created):**

```typescript
const CreatePolicyResponseSchema = z.object({
  policy: PolicySummarySchema,
  createdAt: z.string().datetime(),
}).openapi('CreatePolicyResponse')
```

**처리 로직:**

```typescript
async function handleCreatePolicy(c: Context): Promise<Response> {
  const ownerAddress = c.get('ownerAddress')
  const body = CreatePolicyRequestSchema.parse(await c.req.json())

  // rules를 type에 맞는 Zod 스키마로 검증
  validateRulesForType(body.type, body.rules)

  const policyId = generateUUIDv7()
  const now = new Date()

  await db.insert(policies).values({
    id: policyId,
    agentId: body.agentId ?? null,
    type: body.type,
    rules: JSON.stringify(body.rules),
    priority: body.priority ?? 0,
    enabled: body.enabled ?? true,
    createdAt: now,
    updatedAt: now,
  })

  await insertAuditLog(db, {
    eventType: 'POLICY_CREATED',
    actor: ownerAddress,
    severity: 'info',
    details: { policyId, type: body.type, agentId: body.agentId },
  })

  return c.json({
    policy: { id: policyId, ...body, createdAt: now.toISOString(), updatedAt: now.toISOString() },
    createdAt: now.toISOString(),
  }, 201)
}
```

---

## 7. Owner 지갑 세션 관리

### 7.1 WalletConnect 세션 수명주기

```mermaid
stateDiagram-v2
    [*] --> Disconnected : 초기 상태
    Disconnected --> Pairing : QR 스캔 (페어링)
    Pairing --> Connected : 세션 제안 수락
    Connected --> Connected : 세션 ping (30분 주기)
    Connected --> Connected : Owner 서명 요청/응답
    Connected --> Reconnecting : 네트워크 단절
    Reconnecting --> Connected : 자동 재연결 성공
    Reconnecting --> Disconnected : 재연결 실패 (타임아웃)
    Connected --> Disconnected : DELETE /v1/owner/disconnect
    Connected --> Disconnected : 모바일 지갑에서 연결 해제
```

| 수명주기 단계 | API/이벤트 | 처리 |
|--------------|-----------|------|
| **연결** | `POST /v1/owner/connect` | owner_wallets INSERT |
| **유지** | WalletConnect SDK 내장 세션 ping (30분 주기) | 자동 (SDK 관리) |
| **재연결** | AppKit 자동 재연결 (localStorage 세션 캐시) | Tauri WebView 재시작 시 자동 복원 |
| **해제** | `DELETE /v1/owner/disconnect` | owner_wallets DELETE + WC 세션 종료 |

### 7.2 owner_wallets 테이블 스키마

```typescript
// packages/daemon/src/infrastructure/database/schema.ts (CORE-02 확장)
export const ownerWallets = sqliteTable('owner_wallets', {
  // -- 식별자 --
  id: text('id').primaryKey(),                    // UUID v7

  // -- 지갑 정보 --
  address: text('address').notNull(),             // Owner 지갑 공개키/주소
  chain: text('chain', {
    enum: ['solana', 'ethereum'],
  }).notNull(),

  // -- WalletConnect 세션 --
  wcSessionTopic: text('wc_session_topic'),       // WalletConnect 세션 토픽
  wcPairingTopic: text('wc_pairing_topic'),       // WalletConnect 페어링 토픽

  // -- 타임스탬프 --
  connectedAt: text('connected_at').notNull(),    // ISO 8601
  lastActiveAt: text('last_active_at'),           // 마지막 서명 활동

  // -- 메타데이터 --
  metadata: text('metadata'),                     // JSON (지갑 이름, 아이콘 등)
})
```

**CREATE TABLE SQL DDL:**

```sql
CREATE TABLE owner_wallets (
  id TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  chain TEXT NOT NULL CHECK (chain IN ('solana', 'ethereum')),
  wc_session_topic TEXT,
  wc_pairing_topic TEXT,
  connected_at TEXT NOT NULL,
  last_active_at TEXT,
  metadata TEXT       -- JSON: { walletName, walletIcon }
);

CREATE UNIQUE INDEX idx_owner_wallets_address ON owner_wallets(address);
```

| 컬럼 | 타입 | Nullable | 용도 |
|------|------|----------|------|
| `id` | TEXT (PK) | NOT NULL | Owner 지갑 UUID v7 |
| `address` | TEXT (UNIQUE) | NOT NULL | Owner 지갑 공개키 (Solana base58 / Ethereum 0x...) |
| `chain` | TEXT (ENUM) | NOT NULL | 체인 식별자: `'solana'` 또는 `'ethereum'` |
| `wc_session_topic` | TEXT | NULL | WalletConnect 활성 세션 토픽 (재연결에 사용) |
| `wc_pairing_topic` | TEXT | NULL | WalletConnect 페어링 토픽 |
| `connected_at` | TEXT | NOT NULL | 연결 시각 (ISO 8601) |
| `last_active_at` | TEXT | NULL | 마지막 서명 활동 시각 (ownerAuth Step 7에서 갱신) |
| `metadata` | TEXT | NULL | JSON: 모바일 지갑 메타데이터 (이름, 아이콘 URL 등) |

### 7.3 다중 Owner 미지원 (v0.2)

v0.2에서 owner_wallets 테이블에는 **최대 1개의 활성 레코드**만 존재한다. Self-Hosted 데몬은 단일 Owner가 운영하는 개인 인프라이며, 다중 Owner(멀티시그)는 v0.3 이후 검토한다.

**단일 Owner 강제 로직:**

```typescript
// POST /v1/owner/connect 핸들러
async function handleOwnerConnect(c: Context): Promise<Response> {
  const { address, chain, wcSessionTopic } = await c.req.json()

  // 이미 Owner가 등록된 경우 거부
  const existing = await db.select().from(ownerWallets).get()
  if (existing) {
    throw new WaiaasError(
      'OWNER_ALREADY_CONNECTED',
      `이미 Owner 지갑(${existing.address})이 연결되어 있습니다. 먼저 연결을 해제하세요.`,
      409,
    )
  }

  const ownerId = generateUUIDv7()
  await db.insert(ownerWallets).values({
    id: ownerId,
    address,
    chain,
    wcSessionTopic: wcSessionTopic ?? null,
    connectedAt: new Date().toISOString(),
  })

  return c.json({ ownerId, address, chain, connectedAt: new Date().toISOString() }, 201)
}
```

### 7.4 Owner 주소 변경 절차

Owner 지갑 주소를 변경하려면 기존 연결 해제 후 새 연결을 수립해야 한다:

1. `DELETE /v1/owner/disconnect` (기존 Owner 서명 필요)
2. owner_wallets 레코드 삭제 + WalletConnect 세션 종료
3. 모든 에이전트의 `ownerAddress` 참조 갱신 (agents 테이블)
4. `POST /v1/owner/connect` (새 지갑으로 QR 스캔)
5. 새 Owner 주소로 에이전트 재등록 안내

**주의:** Owner 변경 시 기존 세션은 모두 유효하지만, 새 거래의 APPROVAL은 새 Owner만 가능하다.

---

## 8. WalletConnect Relay 장애 대응

### 8.1 장애 시 영향 분석

WalletConnect Relay (`wss://relay.walletconnect.com`)는 WAIaaS의 **유일한 외부 의존성**이다. 장애 시 다음 기능이 영향받는다:

| 기능 | Relay 필요 여부 | 장애 시 영향 |
|------|---------------|------------|
| Owner 지갑 초기 연결 | 필요 | QR 스캔 불가 -> 연결 불가 |
| APPROVAL 거래 승인 | 필요 (모바일 서명) | 서명 요청 전달 불가 -> 타임아웃 -> EXPIRED |
| DELAY 거래 취소 | 필요 (모바일 서명) | 취소 불가 -> 쿨다운 만료 시 자동 실행 |
| Kill Switch | **불필요** (로컬 CLI) | 영향 없음 |
| 세션 발급 | **불필요** (HTTP POST) | 영향 없음 |
| 일반 거래 (INSTANT) | **불필요** | 영향 없음 |

**핵심 원칙:** Relay 장애 시 시스템은 **안전 방향(fail-safe)**으로 동작한다:
- APPROVAL 거래는 타임아웃 만료 -> `EXPIRED` (실행되지 않음)
- DELAY 거래는 Owner가 취소하지 못하면 자동 실행 (이미 정책 엔진이 허가한 거래)

### 8.2 CLI 직접 서명 대안

Relay 장애 시에도 Owner가 거래를 승인/거절할 수 있는 CLI 대안 경로:

```bash
# APPROVAL 거래 직접 승인 (WalletConnect 불필요)
waiaas owner approve <txId> \
  --signature <base58_sig> \
  --message <siws_message_file>

# APPROVAL 거래 직접 거절
waiaas owner reject <txId> \
  --signature <base58_sig> \
  --message <siws_message_file>
```

**플로우:**

1. CLI가 데몬에서 nonce를 발급받는다 (`GET /v1/auth/nonce`)
2. SIWS/SIWE 메시지를 생성하여 파일로 저장
3. Owner가 **키페어 파일** 또는 **오프라인 서명 도구**로 메시지에 서명
4. 서명 결과를 CLI에 전달
5. CLI가 ownerSignaturePayload를 구성하여 API 호출

```typescript
// packages/cli/src/commands/owner-approve.ts
async function ownerApprove(
  txId: string,
  signatureBase58: string,
  messageFile: string,
): Promise<void> {
  const message = await readFile(messageFile, 'utf-8')
  const nonce = extractNonceFromMessage(message)
  const address = extractAddressFromMessage(message)

  // ownerSignaturePayload 구성
  const payload = {
    chain: 'solana',
    address,
    action: 'approve_tx',
    nonce,
    timestamp: new Date().toISOString(),
    message,
    signature: signatureBase58,
  }

  const token = Buffer.from(JSON.stringify(payload)).toString('base64url')

  const response = await fetch(`http://127.0.0.1:3100/v1/owner/approve/${txId}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
  })

  if (response.ok) {
    console.log(`✓ 거래 ${txId} 승인 완료`)
  } else {
    const error = await response.json()
    console.error(`✗ 승인 실패: ${error.error.message}`)
  }
}
```

### 8.3 Kill Switch 로컬 발동 (WalletConnect 불필요)

Kill Switch는 **최고 비상 상황**에서 사용되므로, WalletConnect Relay에 의존해서는 안 된다. CLI에서 **마스터 패스워드 인증**으로 직접 발동할 수 있다:

```bash
waiaas kill-switch --reason "emergency: suspicious activity detected"
# 마스터 패스워드 입력 요청:
# Enter master password: ********
# ✓ Kill Switch 발동 완료
#   세션 폐기: 3
#   거래 취소: 1
#   에이전트 정지: 2
```

**CLI Kill Switch 인증 방식:**
- WalletConnect/SIWS 서명 **불필요**
- **마스터 패스워드** 인증 (키스토어 잠금 해제 수준의 인증)
- localhost에서만 실행 가능 (CLI -> 데몬 HTTP API)

```typescript
// packages/cli/src/commands/kill-switch.ts
async function killSwitch(reason: string): Promise<void> {
  // 1. 마스터 패스워드 입력
  const password = await promptPassword('Enter master password: ')

  // 2. 마스터 패스워드 해시를 Authorization 헤더로 전달
  // Kill Switch 전용 인증: 마스터 패스워드 SHA-256 해시
  const passwordHash = createHash('sha256').update(password).digest('hex')

  const response = await fetch('http://127.0.0.1:3100/v1/admin/kill-switch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Master-Password-Hash': passwordHash,
    },
    body: JSON.stringify({ reason }),
  })

  const result = await response.json()
  if (response.ok) {
    console.log(`\n✓ Kill Switch 발동 완료`)
    console.log(`  세션 폐기: ${result.sessionsRevoked}`)
    console.log(`  거래 취소: ${result.txCancelled}`)
    console.log(`  에이전트 정지: ${result.agentsSuspended}`)
  }
}
```

**참고:** `/v1/admin/kill-switch` (마스터 패스워드 인증)과 `/v1/owner/kill-switch` (Owner 서명 인증)은 **동일한 캐스케이드 로직**을 실행하지만 인증 방식이 다르다. 08-04에서 두 경로의 통합 설계를 상세화한다.

---

## 9. 보안 고려사항

### 9.1 WalletConnect projectId 유출

**위험도:** 낮음

projectId는 **읽기 전용 식별자**로, Relay 서버 접근을 허용하는 역할만 한다. projectId가 유출되어도:
- Owner의 개인키는 노출되지 않음
- 서명 요청/응답은 E2E 암호화
- 공격자가 임의 세션을 생성할 수 있으나, Owner 지갑의 **수동 승인 없이는 의미 없음**

**대응:** config.toml 파일 권한 600 유지. 별도 암호화 불필요.

### 9.2 서명 재생 공격 방지 (3중 방어)

| 방어 계층 | 메커니즘 | 효과 |
|----------|---------|------|
| **nonce 일회성** | LRU 캐시에서 사용 후 즉시 삭제 | 동일 서명 재사용 차단 |
| **timestamp 5분 제한** | 서명 시각 검증 (issuedAt + expirationTime) | 오래된 서명 거부 |
| **action 바인딩** | 서명 메시지에 action 명시 + 라우트 매칭 | 다른 API에 서명 재사용 차단 |

**공격 시나리오와 방어:**

```
공격자가 approve_tx 서명을 캡처 -> reject_tx API에 재사용 시도
-> Step 6에서 action 불일치로 거부
-> 같은 approve_tx API에 재사용 시도
-> Step 3에서 nonce 이미 소비되어 거부
```

### 9.3 Owner 사칭 방지

서명자 주소와 owner_wallets.address의 일치 확인은 **ownerAuth Step 5**에서 수행된다:

```
1. 공격자가 자신의 지갑으로 SIWS 메시지 서명
2. ownerAuth Step 4: 서명 자체는 유효 (공격자 지갑으로 검증)
3. ownerAuth Step 5: 서명자 주소 != owner_wallets.address -> OWNER_MISMATCH (403)
```

owner_wallets에 등록된 주소만 Owner로 인정된다. 등록은 localhost에서만 가능(`POST /v1/owner/connect`).

### 9.4 다중 디바이스 정책

WalletConnect 세션은 **1개만 유지**한다. 새 디바이스에서 연결하면 기존 연결이 해제된다:

```typescript
// 새 연결 시 기존 세션 종료 로직
async function replaceOwnerConnection(
  newAddress: string,
  newChain: string,
  newSessionTopic: string,
): Promise<void> {
  const existing = await db.select().from(ownerWallets).get()
  if (existing) {
    // 기존 WalletConnect 세션 종료
    if (existing.wcSessionTopic) {
      await signClient.disconnect({
        topic: existing.wcSessionTopic,
        reason: { code: 6000, message: 'New device connected' },
      })
    }
    // 기존 레코드 삭제
    await db.delete(ownerWallets).where(eq(ownerWallets.id, existing.id))
  }
  // 새 레코드 생성
  // ...
}
```

**참고:** v0.2에서는 `POST /v1/owner/connect`가 기존 Owner 존재 시 409를 반환한다. 교체를 원하면 먼저 `DELETE /v1/owner/disconnect` 호출 필요. 이 보수적 정책은 실수로 Owner가 교체되는 것을 방지한다.

### 9.5 Phase 9 Tauri 통합 시 CSP 설정

Tauri WebView의 Content Security Policy에 WalletConnect Relay 도메인을 허용해야 한다:

```json
// tauri.conf.json (Phase 9에서 설정)
{
  "app": {
    "security": {
      "csp": {
        "connect-src": [
          "http://127.0.0.1:3100",
          "wss://relay.walletconnect.com",
          "https://rpc.walletconnect.com"
        ]
      }
    }
  }
}
```

| 도메인 | 프로토콜 | 용도 |
|--------|---------|------|
| `relay.walletconnect.com` | WSS | WalletConnect v2 Relay (E2E 암호화 메시지 중계) |
| `rpc.walletconnect.com` | HTTPS | WalletConnect RPC (세션 메타데이터) |
| `127.0.0.1:3100` | HTTP | WAIaaS 데몬 API (로컬) |

---

*문서 ID: OWNR-CONN*
*작성일: 2026-02-05*
*Phase: 08-security-layers-design*
*상태: 완료*
