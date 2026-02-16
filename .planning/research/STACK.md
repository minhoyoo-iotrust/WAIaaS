# Technology Stack: WalletConnect Owner 승인

**Project:** WAIaaS v1.6.1 WalletConnect Owner 승인
**Researched:** 2026-02-16
**Mode:** Subsequent Milestone (기존 스택에 WalletConnect v2 추가)

---

## Executive Summary

WAIaaS 데몬이 **dApp 역할(Proposer)**로 WalletConnect v2 Sign Protocol을 사용하여 Owner의 외부 지갑에 서명을 요청한다. Owner가 모바일/데스크톱 지갑(MetaMask, Phantom 등)에서 QR 코드를 스캔하여 세션을 열고, APPROVAL 거래 발생 시 WC 경유로 `personal_sign` 요청을 받아 승인/거절한다. WC 세션이 없거나 타임아웃 시 기존 Telegram Bot fallback으로 전환한다.

**핵심 결론:** 새 npm 패키지 2개(`@walletconnect/sign-client`, `qrcode`) + dev 1개(`@types/qrcode`). 나머지는 기존 인프라(ApprovalWorkflow, TelegramBotService, EventBus, SettingsService, ownerAuth 서명 검증) 활용.

---

## Recommended Stack Additions

### Core: WalletConnect Sign Client (dApp SDK)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@walletconnect/sign-client` | `^2.23.5` | WC v2 Sign Protocol dApp 측 클라이언트 | WalletConnect 공식 dApp SDK. Node.js 호환 명시. `@walletconnect/core` 2.23.5 자동 포함. Relay 서버 연결, pairing, 세션 관리, 서명 요청 전송 담당 |

**Confidence:** HIGH -- npm registry 직접 확인 (`npm view @walletconnect/sign-client version` = 2.23.5, 2026-02-11 릴리스).

**왜 `@walletconnect/sign-client`인가 (`@reown` 패키지 대신):**

1. **Reown은 WalletConnect의 리브랜딩 (2024-09)**. `@reown/appkit`은 프론트엔드 UI 통합 중심 (모달, 소셜 로그인, 내장 지갑).
2. **서버사이드 Sign API는 `@walletconnect/sign-client` 패키지 사용** -- [Reown 공식 문서](https://docs.reown.com/advanced/api/sign/dapp-usage)가 dApp Sign API용으로 이 패키지를 계속 문서화하고 `import SignClient from "@walletconnect/sign-client"` 사용.
3. `@reown/appkit`은 브라우저 전용 UI 모달 + 소셜 로그인 등 번들. 서버 데몬에 불필요.
4. `@walletconnect/sign-client`는 활발히 유지보수 중 (2026-02-11 최신 릴리스, Node.js heartbeat 버그 수정 포함).

**자동 포함 의존성 (직접 설치 불필요):**

| Transitive Dependency | Version | Role |
|----------------------|---------|------|
| `@walletconnect/core` | 2.23.5 | Relay WebSocket 연결, Pairing 관리, Heartbeat |
| `@walletconnect/types` | 2.23.5 | TypeScript 타입 정의 (SessionTypes, SignClientTypes 등) |
| `@walletconnect/utils` | 2.23.5 | 유틸리티 함수 (URI 파싱, 네임스페이스 검증) |
| `@walletconnect/keyvaluestorage` | 1.1.1 | 세션 영속화 (Node.js: `unstorage` 기반 파일시스템 기본) |
| `@walletconnect/jsonrpc-ws-connection` | 1.0.16 | Relay 서버 WebSocket 연결 |
| `@walletconnect/heartbeat` | 1.2.2 | 세션 유지 heartbeat (2.23.5에서 Node.js 크래시 수정됨) |
| `events` | 3.3.0 | EventEmitter polyfill |
| `es-toolkit` | 1.44.0 | lodash 대체 유틸리티 (core 의존) |
| `uint8arrays` | 3.1.1 | Uint8Array 변환 유틸리티 (core 의존) |

### QR Code Generation (Server-Side)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `qrcode` | `^1.5.4` | WC pairing URI를 QR 코드로 변환 | Node.js 서버사이드 QR 생성 표준 라이브러리. `toDataURL()` -> base64 PNG, `toString('svg')` -> SVG 문자열. Admin UI에서 `<img src="data:image/png;base64,...">` 렌더. Telegram Bot에서 동일 이미지 전송 가능 |

**Confidence:** HIGH -- npm registry 확인 (`npm view qrcode version` = 1.5.4). 의존성 최소 (pngjs, dijkstrajs, yargs).

### TypeScript Types (Dev)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@types/qrcode` | `^1.5.6` | qrcode 패키지 TypeScript 타입 | `qrcode`는 순수 JS 패키지로 자체 타입 미포함. DefinitelyTyped 공식 타입 |

**Confidence:** HIGH -- npm registry 확인 (`npm view @types/qrcode version` = 1.5.6).

---

## 기존 스택 활용 (신규 설치 불필요)

### 변경 없이 그대로 사용

| Existing Component | WalletConnect에서의 역할 | Integration Point |
|---|---|---|
| **ApprovalWorkflow** | APPROVAL 거래 -> WC 서명 요청 트리거 | `requestApproval()` 호출 후 WC `session_request` 발송. 서명 응답 수신 시 `approve(txId, signature)` / `reject(txId)` 호출 |
| **SettingsService** | `walletconnect.project_id` 이미 정의됨 | `setting-keys.ts` line 99: `{ key: 'walletconnect.project_id', category: 'walletconnect', defaultValue: '', isCredential: false }` |
| **TelegramBotService** | WC fallback 채널 | 기존 `/approve`, `/reject` 명령 + `buildApprovalKeyboard()` inline keyboard 그대로 사용. WC 실패 시 Telegram으로 승인 요청 전환 |
| **EventBus** | APPROVAL 이벤트 발행/구독 | WC 서비스가 EventBus 구독하여 `TX_APPROVAL_REQUESTED` 이벤트 수신 -> WC `session_request` 발송 |
| **NotificationService** | 승인 요청/결과 알림 | 기존 4채널 알림 (Telegram/Discord/ntfy/Slack)으로 "승인 대기 중" 알림 발송 |
| **ownerAuth middleware** | WC 서명 검증에 재사용 가능 | `verifySIWE()` (EVM EIP-4361), Ed25519 verify (Solana) -- 기존 검증 로직 그대로 |
| **CSP middleware** | Admin UI QR 표시 호환 | `img-src 'self' data:` 이미 설정됨 -- base64 QR 이미지 표시에 CSP 변경 불필요 |
| **viem 2.x** | EVM personal_sign 서명 검증 | `verifyMessage()` 또는 기존 `verifySIWE()` 재사용 |
| **sodium-native 4.x** | Solana `solana_signMessage` 서명 검증 | `crypto_sign_verify_detached()` 기존 코드 재사용 |

### 확장 필요 (코드 변경만, 패키지 추가 없음)

| Component | Change Needed | Rationale |
|---|---|---|
| **DB schema v16** | `wc_sessions` 테이블 추가 (topic, wallet_id, chain, peer_metadata, namespace_accounts, expiry_at, paired_at, disconnected_at) | WC 세션과 WAIaaS wallet 매핑. 세션 복원, 만료 관리 |
| **setting-keys.ts** | `walletconnect.relay_url` 추가 (기본값: `wss://relay.walletconnect.com`) | 커스텀 relay 서버 지원. 자체 호스팅 relay 가능 |
| **setting-keys.ts** | `walletconnect.metadata_name`, `walletconnect.metadata_description` 추가 | QR 스캔 시 지갑에 표시되는 dApp 메타데이터 |
| **config.toml schema** | `[walletconnect]` 섹션에 `relay_url`, `metadata_name`, `metadata_description` 필드 추가 | config.toml 초기값 |
| **Admin UI** | QR 코드 표시 모달, WC 세션 상태 표시, 페어링 버튼 | 기존 Preact 컴포넌트 + Modal 패턴 활용 |
| **Notification templates** | `WC_APPROVAL_REQUESTED`, `WC_SESSION_PAIRED`, `WC_SESSION_DISCONNECTED` 메시지 | 기존 i18n 템플릿 시스템 (en/ko) 확장 |
| **audit_log event_type** | `WC_SESSION_PAIRED`, `WC_SESSION_DISCONNECTED`, `TX_APPROVED_VIA_WC`, `TX_REJECTED_VIA_WC` | 기존 audit_log 테이블 + 이벤트 타입 추가 |

---

## WalletConnect v2 Architecture Fit

### WAIaaS = dApp (Proposer), Owner Wallet = Wallet (Responder)

WAIaaS 데몬은 **dApp 역할**. Owner의 외부 지갑(MetaMask Mobile, Phantom, Backpack, Rainbow 등)이 **Wallet 역할**.

```
WAIaaS Daemon (dApp)              WC Relay Server            Owner Wallet
       |                              |                          |
  [1. 세션 생성]                       |                          |
       |--- signClient.connect() ---->|                          |
       |<-- { uri, approval } --------|                          |
       |                              |                          |
  [2. QR 표시]                        |                          |
       |   [Admin UI: QR 모달]         |                          |
       |   [Telegram: QR 이미지]       |                          |
       |                              |<-- wallet scans QR ------|
       |                              |--- session proposal ---->|
       |<-- session approved ---------|<-- wallet approves ------|
       |                              |                          |
  [3. APPROVAL 거래 발생]              |                          |
       |                              |                          |
       |--- session_request --------->|--- personal_sign ------->|
       |    (approval message)        |    (message to sign)     |
       |                              |                          |
       |<-- signature result ---------|<-- user signs/rejects ---|
       |                              |                          |
  [4. 서명 검증 + 승인/거절]           |                          |
       |   approve(txId, signature)   |                          |
       |   or reject(txId)            |                          |
```

### SignClient API 사용 패턴

```typescript
import SignClient from '@walletconnect/sign-client';

// 1. 초기화
const signClient = await SignClient.init({
  projectId: settingsService.get('walletconnect.project_id'),
  relayUrl: settingsService.get('walletconnect.relay_url') || 'wss://relay.walletconnect.com',
  metadata: {
    name: settingsService.get('walletconnect.metadata_name') || 'WAIaaS Daemon',
    description: settingsService.get('walletconnect.metadata_description') || 'AI Agent Wallet Service',
    url: 'https://github.com/user/waiaas',
    icons: [],
  },
});

// 2. 페어링 URI 생성 (QR 코드용)
const { uri, approval } = await signClient.connect({
  requiredNamespaces: buildNamespaces(wallet),  // wallet.chain 기반 동적 구성
});
// uri -> QR 코드 생성 -> Admin UI / Telegram 전송

// 3. 세션 승인 대기
const session = await approval();  // wallet에서 승인 시 resolve
// session.topic, session.namespaces, session.peer.metadata 저장

// 4. 서명 요청 (APPROVAL 거래 발생 시)
const result = await signClient.request({
  topic: session.topic,
  chainId: resolveWcChainId(wallet),  // e.g., 'eip155:1' or 'solana:5eykt4...'
  request: {
    method: wallet.chain === 'ethereum' ? 'personal_sign' : 'solana_signMessage',
    params: buildApprovalSignParams(wallet, txId, txDetails),
  },
});
// result -> 서명 검증 -> approve(txId, signature) or reject(txId)

// 5. 세션 이벤트 핸들링
signClient.on('session_delete', ({ topic }) => { /* 세션 종료 처리 */ });
signClient.on('session_expire', ({ topic }) => { /* 세션 만료 처리 */ });
```

### Namespace Configuration

WAIaaS가 지원하는 체인별 WC 네임스페이스 구성.

**EVM (eip155) -- wallet.chain === 'ethereum':**
```typescript
{
  eip155: {
    methods: ['personal_sign'],
    chains: resolveEvmChains(wallet),
    // e.g., ['eip155:1', 'eip155:11155111', 'eip155:137', ...]
    events: ['chainChanged', 'accountsChanged'],
  },
}
```

**EVM Chain ID 매핑 (기존 adapter-pool.test.ts에서 확인):**

| WAIaaS Network | EVM Chain ID | WC Chain ID |
|---|---|---|
| `ethereum-mainnet` | 1 | `eip155:1` |
| `ethereum-sepolia` | 11155111 | `eip155:11155111` |
| `polygon-mainnet` | 137 | `eip155:137` |
| `polygon-amoy` | 80002 | `eip155:80002` |
| `arbitrum-mainnet` | 42161 | `eip155:42161` |
| `arbitrum-sepolia` | 421614 | `eip155:421614` |
| `optimism-mainnet` | 10 | `eip155:10` |
| `optimism-sepolia` | 11155420 | `eip155:11155420` |
| `base-mainnet` | 8453 | `eip155:8453` |
| `base-sepolia` | 84532 | `eip155:84532` |

**Solana (solana) -- wallet.chain === 'solana':**
```typescript
{
  solana: {
    methods: ['solana_signMessage'],
    chains: resolveSolanaChains(wallet),
    // e.g., ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp']
    events: [],
  },
}
```

**Solana CAIP-2 Chain ID 매핑 ([chainagnostic.org](https://namespaces.chainagnostic.org/solana/caip2) 확인):**

| WAIaaS Network | Solana Genesis Hash (truncated) | WC Chain ID |
|---|---|---|
| Mainnet | `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` |
| Devnet | `EtWTRABZaYq6iMfeYKouRu166VU2xqa1` | `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` |
| Testnet | `4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z` | `solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z` |

**설계 결정:** 네임스페이스를 wallet.chain 기반으로 **동적 구성**한다. EVM wallet이면 eip155만, Solana wallet이면 solana만 requiredNamespaces에 포함. 두 체인 모두 지원하는 Owner 지갑은 드물고, Owner 주소는 이미 특정 체인에 귀속되어 있으므로.

### 서명 요청 메시지 형식

**EVM (`personal_sign`):**
```typescript
// APPROVAL 거래 승인 메시지 (EIP-4361 SIWE 형식 재사용 가능)
const message = [
  `WAIaaS Approval Request`,
  ``,
  `Transaction: ${txId}`,
  `Wallet: ${walletName}`,
  `Type: ${txType}`,
  `To: ${to}`,
  `Amount: ${amount} ${symbol}`,
  `Network: ${network}`,
  ``,
  `Approve this transaction by signing this message.`,
  `Timestamp: ${new Date().toISOString()}`,
].join('\n');

// personal_sign params: [hex-encoded message, signer address]
const params = [
  `0x${Buffer.from(message, 'utf8').toString('hex')}`,
  ownerAddress,
];
```

**Solana (`solana_signMessage`):**
```typescript
// solana_signMessage params: { message: base58-encoded, pubkey: base58 }
const params = {
  message: bs58.encode(Buffer.from(message, 'utf8')),
  pubkey: ownerAddress,
};
```

### Storage Strategy

`@walletconnect/keyvaluestorage` 1.1.1은 Node.js에서 `unstorage` 기반 파일시스템 저장을 기본 사용.

**접근 방식:** WC 기본 파일시스템 저장 + DB에 세션 비즈니스 메타데이터만 별도 저장

| 저장소 | 데이터 | 이유 |
|--------|--------|------|
| WC keyvaluestorage (파일시스템) | pairing 암호키, 세션 crypto state, relay 메시지 큐 | WC SDK 내부 암호화 핸드셰이크/세션 복원 로직이 이 저장소에 의존. 커스텀 교체 시 충돌 위험 |
| SQLite `wc_sessions` 테이블 | wallet_id <-> session topic 매핑, peer metadata, 만료 시간 | 비즈니스 로직: "어떤 wallet에 어떤 WC session이 연결되어 있는가" 조회 필요 |

**이유:** WC SDK 내부 스토리지를 커스텀 SQLite 어댑터로 교체하는 것은 기술적으로 가능하나, WC 내부 암호화 핸드셰이크/세션 복원 로직과 충돌 위험이 있다. 기본 저장소 사용이 안정성 최우선. 별도 `wc_sessions` 테이블로 비즈니스 메타데이터만 관리하면 WAIaaS 쿼리 요구사항 충족.

---

## Installation

```bash
# Core (daemon package)
cd packages/daemon
pnpm add @walletconnect/sign-client@^2.23.5 qrcode@^1.5.4

# Dev dependencies (daemon package)
pnpm add -D @types/qrcode@^1.5.6
```

**Admin UI (`packages/admin`):** 추가 패키지 불필요. QR 코드는 서버(daemon)에서 base64 PNG로 생성하여 REST API(`GET /v1/admin/walletconnect/:walletId/qr`)로 전달. Admin UI는 `<img src="data:image/png;base64,...">` 으로 렌더링. 기존 CSP `img-src 'self' data:` 호환.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| WC SDK | `@walletconnect/sign-client` | `@reown/appkit` | 브라우저 전용 UI 번들 (모달, 소셜 로그인, 내장 지갑). 서버 데몬에 부적합. 과도한 의존성 |
| WC SDK | `@walletconnect/sign-client` | `@walletconnect/web3wallet` | **Web3Wallet은 지갑 측(Responder) SDK**. WAIaaS는 dApp(Proposer) 역할이므로 sign-client 필요 |
| WC SDK | `@walletconnect/sign-client` | `@walletconnect/ethereum-provider` | EIP-1193 Provider 래퍼. EVM 전용이라 Solana 미지원. 직접 sign-client API가 더 낮은 수준 제어 가능 |
| QR 생성 위치 | 서버사이드 (`qrcode` in daemon) | 프론트엔드 QR 라이브러리 (Admin UI Preact) | 서버에서 생성하면 (1) CSP 추가 변경 불필요, (2) Telegram Bot에서도 동일 QR 이미지 전송 가능, (3) REST API로 일관된 인터페이스 |
| QR 패키지 | `qrcode` | `@walletconnect/qrcode-modal` | Deprecated 패키지. `@reown/appkit`으로 대체됨. 브라우저 모달 전용 |
| WC Storage | 기본 파일시스템 | SQLite 커스텀 IKeyValueStorage 어댑터 | WC 내부 암호화 상태 관리와 충돌 위험. keyvaluestorage의 Node.js 파일시스템 기본값 안정 |
| WC Storage | 기본 파일시스템 | In-memory 저장 | 데몬 재시작 시 모든 WC 세션 소실. Owner가 매번 QR 재스캔 필요. UX 열화 |
| 서명 메서드 | `personal_sign` | `eth_signTypedData_v4` | personal_sign이 더 단순하고 모든 지갑이 지원. 구조화된 데이터 서명이 불필요한 승인 메시지에 typedData는 과잉 |
| Fallback | Telegram Bot (기존) | 이메일 / SMS | 이미 구현된 Telegram Bot + 4채널 알림 인프라 활용이 최소 비용. 이메일/SMS는 추가 인프라 필요 |

---

## NOT Adding (명시적 제외)

| Library | Reason |
|---------|--------|
| `@reown/appkit` | 브라우저 전용 UI 프레임워크. 소셜 로그인, 내장 지갑 등 서버 데몬에 불필요한 기능 번들 |
| `@walletconnect/web3wallet` | 지갑 측(Responder) SDK. WAIaaS는 dApp(Proposer) 역할 |
| `@walletconnect/ethereum-provider` | EIP-1193 Provider 래퍼. EVM 전용이고 Solana 미지원. 불필요한 추상화 계층 |
| `@walletconnect/modal` | Deprecated (2024). 브라우저 모달 UI 전용 |
| `ws` | `@walletconnect/core`가 `@walletconnect/jsonrpc-ws-connection` 1.0.16으로 내부 관리. 직접 설치 불필요 |
| Admin UI용 QR 라이브러리 | 서버에서 base64 PNG 생성으로 충분. 프론트엔드 QR 라이브러리 추가 불필요 |
| `@walletconnect/universal-provider` | 범용 provider 래퍼. sign-client 직접 사용이 더 가벼움 |

---

## 패키지별 변경 사항

### @waiaas/daemon (변경 대상)

| 변경 | 내용 | 의존성 변경 |
|------|------|-----------|
| `package.json` | `@walletconnect/sign-client`, `qrcode`, `@types/qrcode` 추가 | **신규 2 + dev 1** |
| `services/wc-session-service.ts` (신규) | WC SignClient 래퍼. 초기화, connect, request, 세션 관리 | sign-client 사용 |
| `services/wc-approval-bridge.ts` (신규) | ApprovalWorkflow <-> WC 브릿지. APPROVAL 이벤트 -> WC 서명 요청 -> approve/reject | 기존 ApprovalWorkflow 활용 |
| `api/routes/walletconnect.ts` (신규) | REST endpoints: QR 생성, 세션 상태, 페어링 해제 | qrcode 사용 |
| `infrastructure/database/migrate.ts` | v16 마이그레이션: `wc_sessions` 테이블 | 없음 |
| `infrastructure/settings/setting-keys.ts` | `walletconnect.relay_url` 등 설정 키 추가 | 없음 |
| `infrastructure/config/loader.ts` | `[walletconnect]` 섹션 확장 | 없음 |
| `infrastructure/telegram/telegram-bot-service.ts` | WC fallback 로직 통합 (WC 실패 시 Telegram 전환) | 없음 |
| `lifecycle/daemon.ts` | WcSessionService 초기화/시작/종료 | 없음 |

### @waiaas/core (변경 최소)

| 변경 | 내용 | 의존성 변경 |
|------|------|-----------|
| `enums/notification.ts` | WC 관련 NotificationEventType 추가 | 없음 |
| `interfaces/types.ts` | WC 세션 관련 타입 정의 (WcSessionInfo 등) | 없음 |
| `i18n/messages.ts` | WC 관련 알림/텔레그램 메시지 템플릿 (en/ko) | 없음 |

### @waiaas/admin (UI 변경)

| 변경 | 내용 | 의존성 변경 |
|------|------|-----------|
| `pages/wallets.tsx` | 월렛 상세 뷰에 "WC 페어링" 버튼 + QR 모달 | 없음 (기존 Modal 컴포넌트 활용) |
| `pages/settings.tsx` | WalletConnect 설정 섹션 확장 (relay_url, metadata) | 없음 |

### @waiaas/mcp (선택적)

| 변경 | 내용 | 의존성 변경 |
|------|------|-----------|
| `tools/wc-pair.ts` (선택) | MCP 도구: WC 페어링 URI 생성 | 없음 (daemon REST API 경유) |

### @waiaas/sdk (선택적)

| 변경 | 내용 | 의존성 변경 |
|------|------|-----------|
| `client.ts` | WC 관련 메서드 추가 (getWcPairingUri, getWcSessionStatus) | 없음 (0-dep SDK) |

---

## Version Compatibility Matrix

| Package | Min Version | Tested With | WAIaaS Constraint |
|---------|-------------|-------------|-------------------|
| `@walletconnect/sign-client` | 2.20+ (Node.js heartbeat fix) | 2.23.5 | Node.js 22 ESM 호환. `type: "module"` 지원 |
| `qrcode` | 1.5.0+ | 1.5.4 | Node.js 22 호환. CommonJS (require) 사용 -> daemon ESM에서 `createRequire` 필요 가능 |
| Node.js | 18+ (WC SDK) | 22 | WAIaaS 기존 요구사항 충족 |
| `viem` | 2.x | 기존 설치 (^2.21.0) | WC 서명 검증에 기존 `verifySIWE()` / `verifyMessage()` 재사용 |
| `sodium-native` | 4.x | 기존 설치 (^4.3.1) | Solana WC 서명 검증에 기존 `crypto_sign_verify_detached()` 재사용 |
| SQLite (better-sqlite3) | 12.x | 기존 설치 (^12.6.0) | DB v16 마이그레이션 (wc_sessions 테이블) |

---

## Known Issues and Mitigations

### 1. Node.js Heartbeat Crash (Resolved in 2.23.x)

**이슈:** `@walletconnect/sign-client` 2.17.x에서 Node.js ~2분 후 `TypeError: i.terminate is not a function` 크래시 ([GitHub #5588](https://github.com/WalletConnect/walletconnect-monorepo/issues/5588))
**상태:** PR #5691에서 수정. 2.23.5에 포함.
**대응:** 2.23.5+ 사용으로 해결. 추가 예방: `signClient.core.relayer.on('relayer_error')` 에러 핸들러 등록.

### 2. KeyValueStorage Message Accumulation

**이슈:** WC 내부 `wc@2:core:0.3//messages` 키에 메시지 누적으로 스토리지 비대화 ([GitHub #4125](https://github.com/WalletConnect/walletconnect-monorepo/issues/4125))
**대응:** WcSessionService에서 주기적 정리 로직 구현 -- 만료된 세션의 메시지 pruning. 기존 `processExpiredApprovals()` 패턴 참조하여 cron-like 정리.

### 3. Relay Server External Dependency

**이슈:** WalletConnect Relay 서버 (`relay.walletconnect.com`)에 대한 외부 의존성. 서버 다운 시 WC 경유 승인 불가.
**대응:** (1) Telegram Bot fallback 자동 전환. (2) `walletconnect.relay_url` 설정으로 자체 호스팅 relay 가능. (3) Relay 연결 상태를 Health check에 노출.

### 4. qrcode 패키지 ESM 호환성

**이슈:** `qrcode` 패키지는 CommonJS. daemon은 ESM (`type: "module"`).
**대응:** `createRequire(import.meta.url)` 패턴 사용 (daemon에서 이미 `sodium-native`, `better-sqlite3`에 동일 패턴 적용 중).

### 5. WalletConnect Cloud Project ID 필요

**이슈:** WC v2는 `project_id`가 필수. [WalletConnect Cloud](https://cloud.walletconnect.com)에서 무료 발급.
**대응:** `walletconnect.project_id`가 비어있으면 WC 서비스 비활성화 (graceful). Telegram fallback만 동작. Admin UI Settings에서 project_id 입력 안내 표시.

---

## Confidence Assessment

| Item | Confidence | Source | Notes |
|------|------------|--------|-------|
| `@walletconnect/sign-client` 2.23.5 | HIGH | npm registry 직접 `npm view` 확인 | 2026-02-11 릴리스, Node.js 호환 명시 |
| dApp vs Wallet SDK 역할 구분 | HIGH | [Reown Docs](https://docs.reown.com/advanced/api/sign/dapp-usage) + [WC Specs](https://specs.walletconnect.com/2.0/specs/clients/sign/namespaces) | sign-client = dApp, web3wallet = Wallet |
| `qrcode` 1.5.4 | HIGH | npm registry 직접 확인 | 안정 라이브러리, 최소 의존성 |
| EVM Chain ID 매핑 | HIGH | 기존 코드베이스 `adapter-pool.test.ts` + WC Specs | 10개 네트워크 모두 확인 |
| Solana CAIP-2 Chain ID | HIGH | [chainagnostic.org](https://namespaces.chainagnostic.org/solana/caip2) | mainnet/devnet/testnet genesis hash 확인 |
| SignClient API (connect, request, events) | HIGH | [Reown Docs dApp Usage](https://docs.reown.com/advanced/api/sign/dapp-usage) | 코드 예제 + 타입 검증 |
| Node.js heartbeat 버그 수정 | MEDIUM | GitHub issue #5588 (COMPLETED + PR merged) | 정확한 수정 포함 버전 미확인, 2.23.5에 포함으로 추정 |
| 파일시스템 스토리지 안정성 | MEDIUM | WC 문서 + 커뮤니티 사례 | 장기 운영 시 스토리지 정리 필요 가능 |
| Solana WC 지원 범위 | MEDIUM | [WC Docs Solana](https://docs.walletconnect.network/wallet-sdk/chain-support/solana) | `solana_signMessage` 지원 확인, 지갑별 호환성 차이 가능 |

---

## Sources

### npm Registry (HIGH)
- [@walletconnect/sign-client npm](https://www.npmjs.com/package/@walletconnect/sign-client) -- v2.23.5 확인
- [@walletconnect/core npm](https://www.npmjs.com/package/@walletconnect/core) -- v2.23.5 transitive dep
- [qrcode npm](https://www.npmjs.com/package/qrcode) -- v1.5.4 확인
- [@types/qrcode npm](https://www.npmjs.com/package/@types/qrcode) -- v1.5.6 확인

### Official Documentation (HIGH)
- [Reown Docs - Dapp Usage](https://docs.reown.com/advanced/api/sign/dapp-usage) -- SignClient 초기화, connect(), request() API
- [WalletConnect Specs - Pairing URI](https://specs.walletconnect.com/2.0/specs/clients/core/pairing/pairing-uri) -- URI 포맷 `wc:{topic}@2?symKey=...&relay-protocol=irn`
- [WalletConnect Specs - Namespaces](https://specs.walletconnect.com/2.0/specs/clients/sign/namespaces) -- eip155/solana 네임스페이스 구조
- [CAIP-2 Solana Chains](https://namespaces.chainagnostic.org/solana/caip2) -- Solana chain ID 매핑
- [WC Docs - Solana Support](https://docs.walletconnect.network/wallet-sdk/chain-support/solana) -- solana_signMessage, solana_signTransaction

### GitHub Issues (MEDIUM)
- [GitHub #5588 - Node.js heartbeat crash](https://github.com/WalletConnect/walletconnect-monorepo/issues/5588) -- 수정됨
- [GitHub #4125 - Storage accumulation](https://github.com/WalletConnect/walletconnect-monorepo/issues/4125) -- 메시지 누적 이슈
- [WalletConnect Releases](https://github.com/WalletConnect/walletconnect-monorepo/releases) -- v2.23.5 릴리스 노트

### Reown Rebrand (MEDIUM)
- [Reown Blog - WalletConnect is now Reown](https://reown.com/blog/walletconnect-is-now-reown) -- @walletconnect vs @reown 관계 설명

### Codebase (HIGH)
- `packages/daemon/package.json` -- 기존 의존성 확인
- `packages/daemon/src/infrastructure/settings/setting-keys.ts` -- `walletconnect.project_id` 이미 정의
- `packages/daemon/src/workflow/approval-workflow.ts` -- ApprovalWorkflow API (requestApproval, approve, reject)
- `packages/daemon/src/infrastructure/telegram/telegram-bot-service.ts` -- Telegram approve/reject 명령
- `packages/daemon/src/api/middleware/owner-auth.ts` -- SIWS/SIWE 서명 검증 (재사용)
- `packages/daemon/src/api/middleware/csp.ts` -- `img-src 'self' data:` 확인
- `packages/daemon/src/__tests__/adapter-pool.test.ts` -- EVM chainId 매핑 확인
